export interface Env {
  DB: D1Database;
  WORKER_SECRET: string;
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Worker-Secret");
  return new Response(response.body, { status: response.status, headers });
}

function json(data: unknown, status = 200): Response {
  return cors(new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  }));
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function requireSecret(request: Request, env: Env): boolean {
  return request.headers.get("X-Worker-Secret") === env.WORKER_SECRET;
}

function generateId(): string {
  return crypto.randomUUID();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // --- SEARCH ---
      if (path === "/search" && method === "GET") {
        const q = url.searchParams.get("q")?.trim() ?? "";
        const channel = url.searchParams.get("channel") ?? "";
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 100);
        const offset = parseInt(url.searchParams.get("offset") ?? "0");

        if (!q && !channel) return err("Provide q or channel");

        let rows;
        if (q && channel) {
          rows = await env.DB.prepare(`
            SELECT t.id, t.title, t.published_at, t.duration_seconds, t.language, t.thumbnail_url,
                   t.status, c.name as channel_name, c.id as channel_id,
                   snippet(tracks_fts, 1, '<mark>', '</mark>', '…', 32) as snippet
            FROM tracks_fts
            JOIN tracks t ON t.rowid = tracks_fts.rowid
            JOIN channels c ON c.id = t.channel_id
            WHERE tracks_fts MATCH ? AND t.channel_id = ? AND t.status = 'done'
            ORDER BY t.published_at DESC LIMIT ? OFFSET ?
          `).bind(q, channel, limit, offset).all();
        } else if (q) {
          rows = await env.DB.prepare(`
            SELECT t.id, t.title, t.published_at, t.duration_seconds, t.language, t.thumbnail_url,
                   t.status, c.name as channel_name, c.id as channel_id,
                   snippet(tracks_fts, 1, '<mark>', '</mark>', '…', 32) as snippet
            FROM tracks_fts
            JOIN tracks t ON t.rowid = tracks_fts.rowid
            JOIN channels c ON c.id = t.channel_id
            WHERE tracks_fts MATCH ? AND t.status = 'done'
            ORDER BY t.published_at DESC LIMIT ? OFFSET ?
          `).bind(q, limit, offset).all();
        } else {
          rows = await env.DB.prepare(`
            SELECT t.id, t.title, t.published_at, t.duration_seconds, t.language, t.thumbnail_url,
                   t.status, c.name as channel_name, c.id as channel_id, '' as snippet
            FROM tracks t JOIN channels c ON c.id = t.channel_id
            WHERE t.channel_id = ? AND t.status = 'done'
            ORDER BY t.published_at DESC LIMIT ? OFFSET ?
          `).bind(channel, limit, offset).all();
        }

        return json({ results: rows.results, total: rows.results.length });
      }

      // --- CHANNELS ---
      if (path === "/channels" && method === "GET") {
        const rows = await env.DB.prepare(`
          SELECT c.*, COUNT(t.id) as track_count
          FROM channels c
          LEFT JOIN tracks t ON t.channel_id = c.id AND t.status = 'done'
          GROUP BY c.id ORDER BY c.name
        `).all();
        return json({ channels: rows.results });
      }

      if (path === "/channels" && method === "POST") {
        if (!requireSecret(request, env)) return err("Unauthorized", 401);
        const body = await request.json() as { id: string; name: string; handle?: string; thumbnail_url?: string };
        await env.DB.prepare(`
          INSERT INTO channels (id, name, handle, thumbnail_url)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, handle=excluded.handle, thumbnail_url=excluded.thumbnail_url
        `).bind(body.id, body.name, body.handle ?? null, body.thumbnail_url ?? null).run();
        return json({ ok: true });
      }

      // --- TRACKS ---
      if (path === "/tracks" && method === "GET") {
        const channel = url.searchParams.get("channel") ?? "";
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
        const offset = parseInt(url.searchParams.get("offset") ?? "0");
        const q = url.searchParams.get("q")?.trim() ?? "";

        let rows;
        if (q) {
          rows = await env.DB.prepare(`
            SELECT t.id, t.title, t.published_at, t.duration_seconds, t.language, t.thumbnail_url, t.status,
                   c.name as channel_name, c.id as channel_id
            FROM tracks t JOIN channels c ON c.id = t.channel_id
            WHERE (t.title LIKE ? OR t.channel_id = ?)
            ORDER BY t.published_at DESC LIMIT ? OFFSET ?
          `).bind(`%${q}%`, channel || "", limit, offset).all();
        } else if (channel) {
          rows = await env.DB.prepare(`
            SELECT t.id, t.title, t.published_at, t.duration_seconds, t.language, t.thumbnail_url, t.status,
                   c.name as channel_name, c.id as channel_id
            FROM tracks t JOIN channels c ON c.id = t.channel_id
            WHERE t.channel_id = ?
            ORDER BY t.published_at DESC LIMIT ? OFFSET ?
          `).bind(channel, limit, offset).all();
        } else {
          rows = await env.DB.prepare(`
            SELECT t.id, t.title, t.published_at, t.duration_seconds, t.language, t.thumbnail_url, t.status,
                   c.name as channel_name, c.id as channel_id
            FROM tracks t JOIN channels c ON c.id = t.channel_id
            ORDER BY t.published_at DESC LIMIT ? OFFSET ?
          `).bind(limit, offset).all();
        }

        return json({ tracks: rows.results });
      }

      const trackMatch = path.match(/^\/tracks\/([^/]+)$/);
      if (trackMatch && method === "GET") {
        const row = await env.DB.prepare(`
          SELECT t.*, c.name as channel_name
          FROM tracks t JOIN channels c ON c.id = t.channel_id
          WHERE t.id = ?
        `).bind(trackMatch[1]).first();
        if (!row) return err("Not found", 404);
        return json(row);
      }

      if (path === "/tracks" && method === "POST") {
        if (!requireSecret(request, env)) return err("Unauthorized", 401);
        const body = await request.json() as {
          id: string; channel_id: string; title: string; description?: string;
          thumbnail_url?: string; published_at?: string; duration_seconds?: number;
          language?: string; transcript?: string; audio_filename?: string; status?: string;
        };
        await env.DB.prepare(`
          INSERT INTO tracks (id, channel_id, title, description, thumbnail_url, published_at,
            duration_seconds, language, transcript, audio_filename, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title=excluded.title, description=excluded.description,
            thumbnail_url=excluded.thumbnail_url, published_at=excluded.published_at,
            duration_seconds=excluded.duration_seconds, language=excluded.language,
            transcript=excluded.transcript, audio_filename=excluded.audio_filename,
            status=excluded.status
        `).bind(
          body.id, body.channel_id, body.title, body.description ?? null,
          body.thumbnail_url ?? null, body.published_at ?? null,
          body.duration_seconds ?? null, body.language ?? null,
          body.transcript ?? null, body.audio_filename ?? null,
          body.status ?? "pending"
        ).run();
        return json({ ok: true });
      }

      // --- JOBS ---
      if (path === "/jobs" && method === "POST") {
        const body = await request.json() as { type: string; input_url: string };
        if (!body.type || !body.input_url) return err("type and input_url required");
        const id = generateId();
        await env.DB.prepare(`
          INSERT INTO jobs (id, type, input_url, status, progress, current_step)
          VALUES (?, ?, ?, 'queued', 0, 'Queued')
        `).bind(id, body.type, body.input_url).run();
        return json({ job_id: id }, 201);
      }

      if (path === "/jobs" && method === "GET") {
        const status = url.searchParams.get("status") ?? "";
        let rows;
        if (status) {
          rows = await env.DB.prepare(
            `SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT 50`
          ).bind(status).all();
        } else {
          rows = await env.DB.prepare(
            `SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50`
          ).all();
        }
        return json({ jobs: rows.results });
      }

      const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
      if (jobMatch && method === "GET") {
        const row = await env.DB.prepare(`SELECT * FROM jobs WHERE id = ?`).bind(jobMatch[1]).first();
        if (!row) return err("Not found", 404);
        return json(row);
      }

      if (jobMatch && method === "PATCH") {
        if (!requireSecret(request, env)) return err("Unauthorized", 401);
        const body = await request.json() as {
          status?: string; progress?: number; current_step?: string;
          error?: string; track_id?: string; channel_id?: string;
        };
        await env.DB.prepare(`
          UPDATE jobs SET
            status = COALESCE(?, status),
            progress = COALESCE(?, progress),
            current_step = COALESCE(?, current_step),
            error = COALESCE(?, error),
            track_id = COALESCE(?, track_id),
            channel_id = COALESCE(?, channel_id),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          body.status ?? null, body.progress ?? null, body.current_step ?? null,
          body.error ?? null, body.track_id ?? null, body.channel_id ?? null,
          jobMatch[1]
        ).run();
        return json({ ok: true });
      }

      // --- PREVIEW (oembed proxy for video metadata) ---
      if (path === "/preview" && method === "GET") {
        const videoUrl = url.searchParams.get("url");
        if (!videoUrl) return err("url required");
        const oembed = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`
        );
        if (!oembed.ok) return err("Could not fetch video info", 404);
        const data = await oembed.json() as Record<string, unknown>;
        return json(data);
      }

      // --- SETTINGS (youtube cookies) ---
      if (path === "/settings/youtube-cookies" && method === "GET") {
        // Only the daemon (with secret) can read raw cookies
        if (!requireSecret(request, env)) return err("Unauthorized", 401);
        const row = await env.DB.prepare(
          `SELECT value FROM settings WHERE key = 'youtube_cookies'`
        ).first<{ value: string }>();
        if (!row) return json({ cookies: null });
        return json({ cookies: row.value });
      }

      if (path === "/settings/youtube-cookies" && method === "POST") {
        if (!requireSecret(request, env)) return err("Unauthorized", 401);
        const body = await request.json() as { cookies: string };
        if (!body.cookies?.trim()) return err("cookies field required");
        await env.DB.prepare(`
          INSERT INTO settings (key, value, updated_at)
          VALUES ('youtube_cookies', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).bind(body.cookies.trim()).run();
        return json({ ok: true });
      }

      if (path === "/settings/youtube-cookies/status" && method === "GET") {
        const row = await env.DB.prepare(
          `SELECT updated_at FROM settings WHERE key = 'youtube_cookies'`
        ).first<{ updated_at: string }>();
        return json({ configured: !!row, updated_at: row?.updated_at ?? null });
      }

      return err("Not found", 404);
    } catch (e) {
      return err(`Server error: ${(e as Error).message}`, 500);
    }
  },
};
