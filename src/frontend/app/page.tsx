"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, Clock, Globe, ExternalLink } from "lucide-react";
import { getChannels, searchTracks, getTracks, formatDuration, formatDate } from "@/lib/api";
import type { Channel, Track } from "@/lib/api";

export default function LibraryPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getChannels().then(setChannels);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (debouncedQuery) {
        const results = await searchTracks({ q: debouncedQuery, channel: selectedChannel || undefined });
        setTracks(results);
      } else {
        const results = await getTracks({ channel: selectedChannel || undefined, limit: 50 });
        setTracks(results);
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, selectedChannel]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      {/* Search bar */}
      <div className="flex flex-col items-center gap-6 mb-10">
        <h1 className="text-3xl font-light tracking-tight text-gray-800">YTAudio Library</h1>
        <div className="relative w-full max-w-2xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcripts, titles…"
            className="w-full pl-12 pr-4 py-3 rounded-full border border-gray-200 shadow-sm hover:shadow focus:shadow-md focus:border-gray-300 outline-none text-base transition-shadow"
          />
        </div>

        {/* Channel filters */}
        {channels.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => setSelectedChannel("")}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                !selectedChannel
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              }`}
            >
              All
            </button>
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(selectedChannel === ch.id ? "" : ch.id)}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                  selectedChannel === ch.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
              >
                {ch.name}
                {ch.track_count > 0 && (
                  <span className="ml-1 text-xs opacity-60">{ch.track_count}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
        </div>
      )}

      {!loading && tracks.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          {query ? "No results found." : (
            <div className="flex flex-col items-center gap-3">
              <p>Your library is empty.</p>
              <Link href="/import" className="text-blue-500 hover:underline text-sm">
                Import a YouTube video or channel →
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col divide-y divide-gray-100">
        {tracks.map((track) => (
          <TrackRow key={track.id} track={track} highlight={debouncedQuery} />
        ))}
      </div>
    </div>
  );
}

function TrackRow({ track, highlight }: { track: Track; highlight: string }) {
  return (
    <div className="py-4 flex gap-4">
      {track.thumbnail_url && (
        <div className="flex-shrink-0">
          <Image
            src={track.thumbnail_url}
            alt={track.title}
            width={120}
            height={68}
            className="rounded object-cover w-[120px] h-[68px]"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/track?id=${track.id}`}
            className="font-medium text-gray-900 hover:text-blue-600 leading-snug line-clamp-2"
          >
            {highlight
              ? highlightText(track.title, highlight)
              : track.title}
          </Link>
          <a
            href={`https://www.youtube.com/watch?v=${track.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
          <span>{track.channel_name}</span>
          {track.published_at && (
            <>
              <span>·</span>
              <span>{formatDate(track.published_at)}</span>
            </>
          )}
          {track.duration_seconds && (
            <>
              <span>·</span>
              <Clock className="w-3 h-3 inline" />
              <span>{formatDuration(track.duration_seconds)}</span>
            </>
          )}
          {track.language && (
            <>
              <span>·</span>
              <Globe className="w-3 h-3 inline" />
              <span className="uppercase">{track.language}</span>
            </>
          )}
        </div>

        {track.snippet && (
          <p
            className="mt-1 text-sm text-gray-500 line-clamp-2"
            dangerouslySetInnerHTML={{ __html: track.snippet }}
          />
        )}
      </div>
    </div>
  );
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="bg-yellow-100 text-gray-900 rounded px-0.5">{part}</mark>
          : part
      )}
    </>
  );
}
