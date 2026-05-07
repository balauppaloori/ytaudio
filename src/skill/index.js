const WORKER_URL = "https://ytaudio-api.balapavan.workers.dev";

function formatDuration(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

async function ytaudio_search({ query, channel, limit = 10 }) {
  const sp = new URLSearchParams({ q: query, limit: String(limit) });
  if (channel) sp.set("channel", channel);
  const res = await fetch(`${WORKER_URL}/search?${sp}`);
  const data = await res.json();
  const results = data.results ?? [];

  if (results.length === 0) {
    return `No results found for "${query}".`;
  }

  const lines = results.map((r, i) => {
    const parts = [`${i + 1}. **${r.title}**`];
    parts.push(`   Channel: ${r.channel_name}`);
    if (r.published_at) parts.push(`   Date: ${formatDate(r.published_at)}`);
    if (r.duration_seconds) parts.push(`   Duration: ${formatDuration(r.duration_seconds)}`);
    if (r.language) parts.push(`   Language: ${r.language.toUpperCase()}`);
    if (r.snippet) parts.push(`   …${r.snippet.replace(/<\/?mark>/g, "**")}…`);
    parts.push(`   https://youtube.com/watch?v=${r.id}`);
    return parts.join("\n");
  });

  return `Found ${results.length} result(s) for "${query}":\n\n${lines.join("\n\n")}`;
}

async function ytaudio_list_channels() {
  const res = await fetch(`${WORKER_URL}/channels`);
  const data = await res.json();
  const channels = data.channels ?? [];

  if (channels.length === 0) return "No channels in the library yet.";

  const lines = channels.map((c) =>
    `• **${c.name}** — ${c.track_count} track(s)${c.handle ? ` (@${c.handle})` : ""}`
  );
  return `Channels in YTAudio library:\n\n${lines.join("\n")}`;
}

async function ytaudio_list_tracks({ channel, limit = 10 }) {
  const sp = new URLSearchParams({ limit: String(limit) });
  if (channel) sp.set("channel", channel);
  const res = await fetch(`${WORKER_URL}/tracks?${sp}`);
  const data = await res.json();
  const tracks = data.tracks ?? [];

  if (tracks.length === 0) return "No tracks found.";

  const lines = tracks.map((t, i) => {
    const parts = [`${i + 1}. **${t.title}**`];
    parts.push(`   Channel: ${t.channel_name}`);
    if (t.published_at) parts.push(`   Date: ${formatDate(t.published_at)}`);
    if (t.duration_seconds) parts.push(`   Duration: ${formatDuration(t.duration_seconds)}`);
    parts.push(`   https://youtube.com/watch?v=${t.id}`);
    return parts.join("\n");
  });

  return `Recent tracks:\n\n${lines.join("\n\n")}`;
}

module.exports = { ytaudio_search, ytaudio_list_channels, ytaudio_list_tracks };
