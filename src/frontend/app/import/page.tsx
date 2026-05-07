"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Link2, Video, Tv2, CheckCircle, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { createJob, getJob, parseYouTubeInput } from "@/lib/api";
import type { Job } from "@/lib/api";

interface ActiveJob {
  id: string;
  inputUrl: string;
  type: "video" | "channel";
}

export default function ImportPage() {
  const [url, setUrl] = useState("");
  const [parsed, setParsed] = useState<{ type: "video" | "channel"; id: string } | null>(null);
  const [parseError, setParseError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [jobStatuses, setJobStatuses] = useState<Record<string, Job>>({});
  const [ytConnected, setYtConnected] = useState<boolean | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_WORKER_URL ?? "https://ytaudio-api.balapavan.workers.dev"}/settings/youtube-cookies/status`)
      .then((r) => r.json())
      .then((d: { configured: boolean }) => setYtConnected(d.configured))
      .catch(() => setYtConnected(false));
  }, []);

  useEffect(() => {
    const result = parseYouTubeInput(url);
    setParsed(result);
    setParseError(url.trim().length > 5 && !result);
  }, [url]);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const poll = async () => {
      const updates: Record<string, Job> = { ...jobStatuses };
      for (const aj of activeJobs) {
        const job = await getJob(aj.id);
        if (job) updates[aj.id] = job;
      }
      setJobStatuses(updates);
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobs]);

  async function handleSubmit() {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const type = parsed.type === "video" ? "transcribe_video" : "transcribe_channel";
      const jobId = await createJob(type, url.trim());
      setActiveJobs((prev) => [...prev, { id: jobId, inputUrl: url.trim(), type: parsed.type }]);
      setUrl("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex flex-col items-center gap-2 mb-10">
        <h1 className="text-2xl font-light text-gray-800">Import from YouTube</h1>
        <p className="text-sm text-gray-400">Paste a video URL, channel URL, or @handle</p>
      </div>

      {/* URL input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !submitting && parsed && handleSubmit()}
            placeholder="https://youtube.com/watch?v=… or @channelname"
            className={`w-full pl-9 pr-4 py-3 rounded-lg border text-sm outline-none transition-colors ${
              parseError
                ? "border-red-300 focus:border-red-400"
                : parsed
                ? "border-green-300 focus:border-green-400"
                : "border-gray-200 focus:border-gray-400"
            }`}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!parsed || submitting}
          className="px-5 py-3 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-700 transition-colors flex items-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {parsed?.type === "channel" ? "Import Channel" : "Transcribe"}
        </button>
      </div>

      {parsed && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          {parsed.type === "video"
            ? <><Video className="w-3.5 h-3.5 text-red-500" /> YouTube video</>
            : <><Tv2 className="w-3.5 h-3.5 text-blue-500" /> YouTube channel — all videos will be queued</>
          }
        </div>
      )}
      {parseError && (
        <p className="mt-2 text-xs text-red-400">Couldn&apos;t recognise this as a YouTube URL or channel handle.</p>
      )}

      {/* Video preview embed */}
      {parsed?.type === "video" && (
        <div className="mt-6 rounded-xl overflow-hidden border border-gray-100 shadow-sm aspect-video">
          <iframe
            src={`https://www.youtube.com/embed/${parsed.id}`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* YouTube connection status */}
      {ytConnected === false && (
        <div className="mt-6 border border-amber-100 bg-amber-50 rounded-xl p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">YouTube not connected</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Imports will fail until you upload your YouTube cookies. This is a one-time setup.
            </p>
          </div>
          <Link
            href="/connect"
            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
          >
            Set up →
          </Link>
        </div>
      )}

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <div className="mt-6 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-gray-700">Progress</h2>
          {activeJobs.map((aj) => (
            <JobCard key={aj.id} activeJob={aj} job={jobStatuses[aj.id] ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ activeJob, job }: { activeJob: ActiveJob; job: Job | null }) {
  const status = job?.status ?? "queued";
  const progress = job?.progress ?? 0;
  const step = job?.current_step ?? "Queued…";

  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {status === "done" ? (
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : status === "error" ? (
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
          )}
          <span className="text-sm text-gray-700 truncate max-w-xs">{activeJob.inputUrl}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          status === "done" ? "bg-green-100 text-green-700"
          : status === "error" ? "bg-red-100 text-red-600"
          : status === "running" ? "bg-blue-100 text-blue-600"
          : "bg-gray-100 text-gray-500"
        }`}>
          {status}
        </span>
      </div>

      {status !== "done" && status !== "error" && (
        <div className="mb-2">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">{step}</span>
            <span className="text-xs text-gray-400">{progress}%</span>
          </div>
        </div>
      )}

      {status === "done" && job?.track_id && (
        <a href={`/track?id=${job.track_id}`} className="text-xs text-blue-500 hover:underline">
          View transcript →
        </a>
      )}
      {status === "error" && job?.error && (
        <p className="text-xs text-red-400 mt-1">{job.error}</p>
      )}
    </div>
  );
}
