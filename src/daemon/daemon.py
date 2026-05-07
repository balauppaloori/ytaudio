#!/usr/bin/env python3
"""
ytaudio daemon — polls Cloudflare D1 for queued jobs and processes them.
Runs as a persistent background service.
"""

import os
import sys
import time
import json
import logging
import tempfile
import subprocess
from pathlib import Path
from datetime import datetime

import httpx
import yt_dlp
import whisper

WORKER_URL = os.environ.get("YTAUDIO_WORKER_URL", "https://ytaudio-api.balapavan.workers.dev")
WORKER_SECRET = os.environ.get("YTAUDIO_WORKER_SECRET", "ytaudio-internal-2026")
AUDIO_DIR = Path(os.environ.get("YTAUDIO_AUDIO_DIR", "/workspace/projects/ytaudio/audio"))
WHISPER_MODEL = os.environ.get("YTAUDIO_WHISPER_MODEL", "medium")
POLL_INTERVAL = int(os.environ.get("YTAUDIO_POLL_INTERVAL", "5"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("ytaudio-daemon")

AUDIO_DIR.mkdir(parents=True, exist_ok=True)

_whisper_model = None


def get_model():
    global _whisper_model
    if _whisper_model is None:
        log.info(f"Loading Whisper model: {WHISPER_MODEL}")
        _whisper_model = whisper.load_model(WHISPER_MODEL)
    return _whisper_model


def headers():
    return {"X-Worker-Secret": WORKER_SECRET, "Content-Type": "application/json"}


def patch_job(client: httpx.Client, job_id: str, **kwargs):
    client.patch(f"{WORKER_URL}/jobs/{job_id}", json=kwargs, headers=headers())


def upsert_channel(client: httpx.Client, channel_id: str, name: str, handle: str = None, thumbnail_url: str = None):
    client.post(f"{WORKER_URL}/channels", json={
        "id": channel_id, "name": name, "handle": handle, "thumbnail_url": thumbnail_url
    }, headers=headers())


def upsert_track(client: httpx.Client, track: dict):
    client.post(f"{WORKER_URL}/tracks", json=track, headers=headers())


def fetch_pending_jobs(client: httpx.Client) -> list[dict]:
    r = client.get(f"{WORKER_URL}/jobs?status=queued")
    data = r.json()
    return data.get("jobs", [])


COOKIES_FILE = os.environ.get("YTAUDIO_COOKIES_FILE", "/workspace/secrets/youtube-cookies.txt")

YDL_BASE = {
    "quiet": True,
    "no_warnings": True,
    **({"cookiefile": COOKIES_FILE} if os.path.exists(COOKIES_FILE) else {}),
}


def ydl_opts_info(extra: dict = None) -> dict:
    opts = {**YDL_BASE, "extract_flat": False}
    if extra:
        opts.update(extra)
    return opts


def process_video_job(client: httpx.Client, job: dict):
    job_id = job["id"]
    url = job["input_url"]
    log.info(f"[{job_id}] Processing video: {url}")

    patch_job(client, job_id, status="running", progress=5, current_step="Fetching video info")

    # --- Fetch metadata ---
    try:
        with yt_dlp.YoutubeDL({**YDL_BASE}) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        patch_job(client, job_id, status="error", error=f"Failed to fetch info: {e}")
        return

    video_id = info.get("id")
    title = info.get("title", "Untitled")
    channel_id = info.get("channel_id", info.get("uploader_id", "unknown"))
    channel_name = info.get("channel", info.get("uploader", "Unknown"))
    channel_handle = info.get("uploader_id")
    thumbnail = info.get("thumbnail")
    published_str = info.get("upload_date")
    duration = info.get("duration")
    description = (info.get("description") or "")[:2000]

    published_at = None
    if published_str and len(published_str) == 8:
        published_at = f"{published_str[:4]}-{published_str[4:6]}-{published_str[6:8]}"

    patch_job(client, job_id, progress=10, current_step="Saving channel info")
    upsert_channel(client, channel_id, channel_name, channel_handle, thumbnail)

    patch_job(client, job_id, progress=15, current_step="Downloading audio")

    # --- Download audio ---
    audio_path = AUDIO_DIR / f"{video_id}.mp3"
    if not audio_path.exists():
        progress_state = {"pct": 15}

        def progress_hook(d):
            if d["status"] == "downloading":
                pct_str = d.get("_percent_str", "0%").strip().replace("%", "")
                try:
                    dl_pct = float(pct_str)
                    overall = int(15 + dl_pct * 0.35)
                    if overall != progress_state["pct"]:
                        progress_state["pct"] = overall
                        patch_job(client, job_id, progress=overall, current_step=f"Downloading audio {dl_pct:.0f}%")
                except ValueError:
                    pass

        ydl_download_opts = {
            **YDL_BASE,
            "format": "bestaudio/best",
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }],
            "outtmpl": str(AUDIO_DIR / f"{video_id}.%(ext)s"),
            "progress_hooks": [progress_hook],
        }
        try:
            with yt_dlp.YoutubeDL(ydl_download_opts) as ydl:
                ydl.download([url])
        except Exception as e:
            patch_job(client, job_id, status="error", error=f"Download failed: {e}")
            return
    else:
        log.info(f"[{job_id}] Audio already exists, skipping download")

    if not audio_path.exists():
        patch_job(client, job_id, status="error", error="Audio file not found after download")
        return

    patch_job(client, job_id, progress=50, current_step="Transcribing audio (this may take a while)")

    # --- Transcribe ---
    try:
        model = get_model()
        result = model.transcribe(str(audio_path), verbose=False)
        transcript = result.get("text", "").strip()
        language = result.get("language", None)
    except Exception as e:
        patch_job(client, job_id, status="error", error=f"Transcription failed: {e}")
        return

    patch_job(client, job_id, progress=90, current_step="Saving to library")

    # --- Save track ---
    track = {
        "id": video_id,
        "channel_id": channel_id,
        "title": title,
        "description": description,
        "thumbnail_url": thumbnail,
        "published_at": published_at,
        "duration_seconds": int(duration) if duration else None,
        "language": language,
        "transcript": transcript,
        "audio_filename": audio_path.name,
        "status": "done",
    }
    upsert_track(client, track)

    patch_job(client, job_id, status="done", progress=100, current_step="Complete", track_id=video_id, channel_id=channel_id)
    log.info(f"[{job_id}] Done: {title}")


def process_channel_job(client: httpx.Client, job: dict):
    job_id = job["id"]
    url = job["input_url"]
    log.info(f"[{job_id}] Processing channel: {url}")

    patch_job(client, job_id, status="running", progress=5, current_step="Scanning channel")

    try:
        with yt_dlp.YoutubeDL({**YDL_BASE, "extract_flat": True}) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        patch_job(client, job_id, status="error", error=f"Failed to scan channel: {e}")
        return

    channel_id = info.get("channel_id") or info.get("id") or info.get("uploader_id", "unknown")
    channel_name = info.get("channel") or info.get("title") or info.get("uploader", "Unknown")
    channel_handle = info.get("uploader_id")
    thumbnail = info.get("thumbnail")

    upsert_channel(client, channel_id, channel_name, channel_handle, thumbnail)

    entries = info.get("entries") or []
    total = len(entries)
    log.info(f"[{job_id}] Found {total} videos in channel")

    patch_job(client, job_id, progress=10, current_step=f"Found {total} videos — queuing jobs")

    for i, entry in enumerate(entries):
        if not entry:
            continue
        video_id = entry.get("id")
        if not video_id:
            continue
        video_url = f"https://www.youtube.com/watch?v={video_id}"
        # Create individual video job
        client.post(f"{WORKER_URL}/jobs", json={
            "type": "transcribe_video",
            "input_url": video_url,
        }, headers={"Content-Type": "application/json"})
        pct = int(10 + (i / total) * 85)
        patch_job(client, job_id, progress=pct, current_step=f"Queued {i+1}/{total} videos")

    patch_job(client, job_id, status="done", progress=100, current_step=f"All {total} videos queued", channel_id=channel_id)
    log.info(f"[{job_id}] Channel scan complete: {total} videos queued")


def run():
    log.info("ytaudio daemon starting up")
    log.info(f"Worker URL: {WORKER_URL}")
    log.info(f"Audio dir: {AUDIO_DIR}")
    log.info(f"Whisper model: {WHISPER_MODEL}")

    with httpx.Client(timeout=60) as client:
        # Eagerly load whisper model so first job is fast
        log.info("Pre-loading Whisper model...")
        try:
            get_model()
            log.info("Whisper model loaded")
        except Exception as e:
            log.warning(f"Could not pre-load Whisper model: {e}")

        log.info(f"Polling for jobs every {POLL_INTERVAL}s...")
        while True:
            try:
                jobs = fetch_pending_jobs(client)
                if jobs:
                    job = jobs[0]
                    log.info(f"Picked up job {job['id']} type={job['type']}")
                    if job["type"] == "transcribe_video":
                        process_video_job(client, job)
                    elif job["type"] == "transcribe_channel":
                        process_channel_job(client, job)
                    else:
                        patch_job(client, job["id"], status="error", error=f"Unknown job type: {job['type']}")
            except KeyboardInterrupt:
                log.info("Daemon stopped.")
                break
            except Exception as e:
                log.error(f"Unexpected error in poll loop: {e}", exc_info=True)

            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run()
