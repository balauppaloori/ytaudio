# YTAudio

Download, transcribe, and search YouTube audio. Supports English, Telugu (తెలుగు), and Hindi (हिंदी).

## Architecture

```
YouTube URL
    ↓
yt-dlp (download MP3, local)
    ↓
Whisper medium (transcribe, local, no GPU needed)
    ↓
Cloudflare D1 (store transcript + metadata)
    ↑                    ↑
Cloudflare Pages    Yogi/Telegram
(frontend)          (same Worker API)
```

- **Frontend:** Next.js 15 + Tailwind + shadcn — [ytaudio-frontend.pages.dev](https://ytaudio-frontend.pages.dev)
- **Worker API:** Cloudflare Worker + D1 with FTS5 full-text search
- **Daemon:** Local Python service (yt-dlp + Whisper)
- **Yogi skill:** Telegram chatbot search via openclaw

## Structure

```
src/
  frontend/   Next.js 15 app (Cloudflare Pages)
  worker/     Cloudflare Worker API (TypeScript)
  daemon/     Local Python ingestion daemon
  skill/      openclaw skill for Yogi (Telegram)
migrations/   D1 SQL schema
audio/        Downloaded MP3s (gitignored, local only)
```

## Quick Start

### 1. Start the daemon

```bash
bash src/daemon/start.sh
```

Keeps running, polls for queued jobs every 5 seconds.

### 2. Import a video or channel

Open [ytaudio-frontend.pages.dev/import](https://ytaudio-frontend.pages.dev/import), paste a YouTube URL or `@channelhandle`, click **Transcribe**.

### 3. Search

- **Web:** [ytaudio-frontend.pages.dev](https://ytaudio-frontend.pages.dev) — search bar + channel filters
- **Telegram:** Ask Yogi — *"search audio for X"* or *"what channels do I have?"*

## API

Base URL: `https://ytaudio-api.balapavan.workers.dev`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search?q=...&channel=...` | Full-text search transcripts |
| GET | `/channels` | List all channels |
| GET | `/tracks?channel=...` | List tracks |
| GET | `/tracks/:id` | Single track + transcript |
| POST | `/jobs` | Queue a new job |
| GET | `/jobs/:id` | Job status + progress |

## Tech Stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS
- **API:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite + FTS5)
- **Downloader:** yt-dlp
- **Transcription:** OpenAI Whisper (local, `medium` model)
- **Chatbot:** openclaw + Yogi agent (Telegram)
