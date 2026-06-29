"use client";

import { useEffect, useState } from "react";
import { getCluster } from "@/lib/api";
import type { ClusterDetail as Detail } from "@/lib/types";
import { sourceColor } from "@/lib/sourceColors";
import { formatDateTime, relativeTime } from "@/lib/time";

interface Props {
  clusterId: number | null;
  onClose: () => void;
}

export default function ClusterDetail({ clusterId, onClose }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape while the panel is open.
  useEffect(() => {
    if (clusterId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clusterId, onClose]);

  useEffect(() => {
    if (clusterId == null) {
      setDetail(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    getCluster(clusterId)
      .then((d) => active && setDetail(d))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [clusterId]);

  const open = clusterId != null;

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0d1326] shadow-2xl transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {detail?.label || "Cluster"}
            </h2>
            {detail && (
              <p className="mt-1 text-xs text-slate-400">
                {detail.articleCount} articles · {formatDateTime(detail.startTime)} →{" "}
                {formatDateTime(detail.endTime)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="np-scroll flex-1 overflow-y-auto p-5">
          {loading && <p className="text-sm text-slate-400">Loading…</p>}
          {error && <p className="text-sm text-rose-400">{error}</p>}
          {detail && (
            <ul className="flex flex-col gap-3">
              {detail.articles.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
                >
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-sky-300 hover:underline"
                  >
                    {a.title}
                  </a>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: sourceColor(a.sourceKey) }}
                    />
                    {a.sourceName}
                    <span>·</span>
                    <span title={formatDateTime(a.publishedAt)}>
                      {relativeTime(a.publishedAt)}
                    </span>
                  </div>
                  {a.summary && (
                    <p className="mt-2 line-clamp-3 text-xs text-slate-400">
                      {a.summary}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
