const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? "https://ytaudio-api.balapavan.workers.dev";

export interface Channel {
  id: string;
  name: string;
  handle: string | null;
  thumbnail_url: string | null;
  created_at: string;
  track_count: number;
}

export interface Track {
  id: string;
  channel_id: string;
  channel_name: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_seconds: number | null;
  language: string | null;
  transcript: string | null;
  status: string;
  ingested_at: string;
  snippet?: string;
}

export interface Job {
  id: string;
  type: string;
  input_url: string;
  status: "queued" | "running" | "done" | "error";
  progress: number;
  current_step: string | null;
  error: string | null;
  track_id: string | null;
  channel_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getChannels(): Promise<Channel[]> {
  const res = await fetch(`${WORKER_URL}/channels`, { cache: "no-store" });
  const data = await res.json();
  return data.channels ?? [];
}

export async function getTracks(params?: {
  channel?: string;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<Track[]> {
  const sp = new URLSearchParams();
  if (params?.channel) sp.set("channel", params.channel);
  if (params?.q) sp.set("q", params.q);
  if (params?.limit) sp.set("limit", String(params.limit));
  if (params?.offset) sp.set("offset", String(params.offset));
  const res = await fetch(`${WORKER_URL}/tracks?${sp}`, { cache: "no-store" });
  const data = await res.json();
  return data.tracks ?? [];
}

export async function searchTracks(params: {
  q?: string;
  channel?: string;
  limit?: number;
  offset?: number;
}): Promise<Track[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.channel) sp.set("channel", params.channel);
  if (params.limit) sp.set("limit", String(params.limit));
  if (params.offset) sp.set("offset", String(params.offset));
  const res = await fetch(`${WORKER_URL}/search?${sp}`, { cache: "no-store" });
  const data = await res.json();
  return data.results ?? [];
}

export async function getTrack(id: string): Promise<Track | null> {
  const res = await fetch(`${WORKER_URL}/tracks/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function createJob(type: string, input_url: string): Promise<string> {
  const res = await fetch(`${WORKER_URL}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, input_url }),
  });
  const data = await res.json();
  return data.job_id;
}

export async function getJob(id: string): Promise<Job | null> {
  const res = await fetch(`${WORKER_URL}/jobs/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export async function getActiveJobs(): Promise<Job[]> {
  const res = await fetch(`${WORKER_URL}/jobs`, { cache: "no-store" });
  const data = await res.json();
  return data.jobs ?? [];
}

export function parseYouTubeInput(input: string): { type: "video" | "channel"; id: string } | null {
  const trimmed = input.trim();

  const videoPatterns = [
    /(?:youtube\.com\/watch[?&]v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of videoPatterns) {
    const m = trimmed.match(p);
    if (m) return { type: "video", id: m[1] };
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return { type: "video", id: trimmed };

  const channelPatterns = [
    /youtube\.com\/@([\w-]+)/,
    /youtube\.com\/channel\/(UC[\w-]+)/,
    /youtube\.com\/c\/([\w-]+)/,
    /youtube\.com\/user\/([\w-]+)/,
  ];
  for (const p of channelPatterns) {
    const m = trimmed.match(p);
    if (m) return { type: "channel", id: m[1] };
  }
  if (trimmed.startsWith("@")) return { type: "channel", id: trimmed.slice(1) };
  if (trimmed.startsWith("UC") && trimmed.length > 20) return { type: "channel", id: trimmed };

  return null;
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
