"use client";

import { useState, useEffect } from "react";
import { CheckCircle, AlertCircle, Loader2, Clock } from "lucide-react";
import { getActiveJobs, formatDate } from "@/lib/api";
import type { Job } from "@/lib/api";

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const data = await getActiveJobs();
    setJobs(data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");
    const interval = setInterval(refresh, hasActive ? 2000 : 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.length]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-light text-gray-800">All Jobs</h1>
        <button onClick={refresh} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <p className="text-center text-gray-400 py-16">No jobs yet. Import a video to get started.</p>
      )}

      <div className="flex flex-col gap-3">
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const isActive = job.status === "queued" || job.status === "running";

  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {job.status === "done" ? (
            <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
          ) : job.status === "error" ? (
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm text-gray-800 truncate">{job.input_url}</p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatDate(job.created_at)} · {job.type.replace("_", " ")}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
          job.status === "done" ? "bg-green-100 text-green-700"
          : job.status === "error" ? "bg-red-100 text-red-600"
          : job.status === "running" ? "bg-blue-100 text-blue-600"
          : "bg-gray-100 text-gray-500"
        }`}>
          {job.status}
        </span>
      </div>

      {isActive && (
        <div className="mt-3">
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">{job.current_step ?? "Waiting…"}</span>
            <span className="text-xs text-gray-400">{job.progress}%</span>
          </div>
        </div>
      )}

      {job.status === "error" && job.error && (
        <p className="mt-2 text-xs text-red-400">{job.error}</p>
      )}

      {job.status === "done" && job.track_id && (
        <a href={`/track?id=${job.track_id}`} className="mt-2 block text-xs text-blue-500 hover:underline">
          View transcript →
        </a>
      )}
    </div>
  );
}
