"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, CheckCircle, AlertCircle, Loader2, ExternalLink, Upload } from "lucide-react";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL ?? "https://ytaudio-api.balapavan.workers.dev";
const WORKER_SECRET = process.env.NEXT_PUBLIC_WORKER_SECRET ?? "ytaudio-internal-2026";

export default function ConnectPage() {
  const [cookies, setCookies] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    fetch(`${WORKER_URL}/settings/youtube-cookies/status`)
      .then((r) => r.json())
      .then((d: { configured: boolean; updated_at: string | null }) => {
        setConfigured(d.configured);
        setUpdatedAt(d.updated_at);
      })
      .catch(() => setConfigured(false));
  }, [status]);

  async function handleSave() {
    if (!cookies.trim()) return;
    setStatus("saving");
    try {
      const res = await fetch(`${WORKER_URL}/settings/youtube-cookies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Secret": WORKER_SECRET,
        },
        body: JSON.stringify({ cookies: cookies.trim() }),
      });
      setStatus(res.ok ? "saved" : "error");
      if (res.ok) setCookies("");
    } catch {
      setStatus("error");
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => setCookies((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="flex flex-col items-center gap-2 mb-10">
        <ShieldCheck className="w-8 h-8 text-amber-500" />
        <h1 className="text-2xl font-light text-gray-800">Connect YouTube</h1>
        <p className="text-sm text-gray-400 text-center">
          Upload your YouTube cookies so the server can download videos on your behalf.
          This is a one-time setup.
        </p>
      </div>

      {/* Status badge */}
      {configured !== null && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl mb-6 text-sm ${
          configured ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
        }`}>
          {configured
            ? <><CheckCircle className="w-4 h-4" /> Connected{updatedAt ? ` · last updated ${new Date(updatedAt).toLocaleDateString()}` : ""}</>
            : <><AlertCircle className="w-4 h-4" /> Not connected — uploads will fail until configured</>
          }
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">How to get your cookies file</h2>
        <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
          <li>
            Install{" "}
            <a
              href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline inline-flex items-center gap-1"
            >
              Get cookies.txt LOCALLY <ExternalLink className="w-3 h-3" />
            </a>{" "}
            in Chrome
          </li>
          <li>Go to <strong>youtube.com</strong> and make sure you&apos;re signed in</li>
          <li>Click the extension icon → click <strong>Export</strong></li>
          <li>Drop the downloaded file below or paste its contents</li>
        </ol>
      </div>

      {/* File drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center mb-4 transition-colors cursor-pointer ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
        }`}
        onClick={() => document.getElementById("cookie-file-input")?.click()}
      >
        <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">Drop <code>cookies.txt</code> here or click to browse</p>
        <input
          id="cookie-file-input"
          type="file"
          accept=".txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {/* Textarea */}
      <textarea
        value={cookies}
        onChange={(e) => setCookies(e.target.value)}
        placeholder="Or paste cookie file contents here…"
        rows={6}
        className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-xl resize-none outline-none focus:border-gray-400 transition-colors text-gray-600 mb-4"
      />

      <button
        onClick={handleSave}
        disabled={!cookies.trim() || status === "saving"}
        className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
      >
        {status === "saving" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {status === "saving" ? "Saving…" : "Save cookies"}
      </button>

      {status === "saved" && (
        <div className="mt-4 flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="w-4 h-4" />
          Saved. Restart the daemon for it to take effect, or it will sync automatically on next startup.
        </div>
      )}
      {status === "error" && (
        <p className="mt-4 text-sm text-red-400">Failed to save. Check your connection and try again.</p>
      )}

      {/* Daemon restart reminder */}
      <div className="mt-6 p-4 bg-blue-50 rounded-xl text-xs text-blue-600">
        <strong>After saving:</strong> restart the daemon so it picks up the new cookies:
        <br />
        <code className="mt-1 block font-mono">
          pkill -f daemon.py; bash /workspace/projects/ytaudio/src/daemon/start.sh
        </code>
      </div>
    </div>
  );
}
