"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Clock, Globe, ArrowLeft, Loader2 } from "lucide-react";
import { getTrack, formatDuration, formatDate } from "@/lib/api";
import type { Track } from "@/lib/api";

function TrackDetail() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const [track, setTrack] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    getTrack(id).then((t) => { setTrack(t); setLoading(false); });
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
      </div>
    );
  }

  if (!track) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-gray-400">
        Track not found.{" "}
        <Link href="/" className="text-blue-500 hover:underline">Back to library</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to library
      </Link>

      <div className="rounded-xl overflow-hidden border border-gray-100 shadow-sm aspect-video mb-6">
        <iframe
          src={`https://www.youtube.com/embed/${track.id}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-gray-900 leading-snug">{track.title}</h1>
          <a
            href={`https://www.youtube.com/watch?v=${track.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-gray-300 hover:text-gray-600 transition-colors"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-gray-400">
          <Link href={`/?channel=${track.channel_id}`} className="hover:text-gray-700 transition-colors">
            {track.channel_name}
          </Link>
          {track.published_at && <><span>·</span><span>{formatDate(track.published_at)}</span></>}
          {track.duration_seconds && (
            <><span>·</span><Clock className="w-3.5 h-3.5 inline" /><span>{formatDuration(track.duration_seconds)}</span></>
          )}
          {track.language && (
            <><span>·</span><Globe className="w-3.5 h-3.5 inline" /><span className="uppercase">{track.language}</span></>
          )}
        </div>
      </div>

      {track.transcript ? (
        <div className="border border-gray-100 rounded-xl p-6 bg-gray-50">
          <h2 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider">Transcript</h2>
          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{track.transcript}</p>
        </div>
      ) : (
        <div className="border border-gray-100 rounded-xl p-6 bg-gray-50 text-center text-sm text-gray-400">
          Transcript not yet available.
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
      </div>
    }>
      <TrackDetail />
    </Suspense>
  );
}
