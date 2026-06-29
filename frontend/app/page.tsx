"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getActivity, getSources, getTimeline } from "@/lib/api";
import type { ActivityResponse, Source, TimelineItem } from "@/lib/types";
import { relativeTime } from "@/lib/time";
import Timeline from "@/components/Timeline";
import Heatmap from "@/components/Heatmap";
import SourceFilter from "@/components/SourceFilter";
import RefreshButton from "@/components/RefreshButton";
import ClusterDetail from "@/components/ClusterDetail";

const WINDOW_DAYS = 30;
const AUTO_REFRESH_MS = 30_000;
// Cap rows when browsing all clusters so the timeline doesn't render a wall of
// single-article markers. Multi-article topics are never this many.
const ROW_CAP = 60;

type SortKey = "active" | "recent";
type View = "timeline" | "heatmap";

export default function Home() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [view, setView] = useState<View>("timeline");
  const [selectedCluster, setSelectedCluster] = useState<number | null>(null);
  const [multiOnly, setMultiOnly] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [tl, act] = await Promise.all([
      getTimeline({ days: WINDOW_DAYS }),
      getActivity({ days: WINDOW_DAYS }),
    ]);
    setItems(tl.items);
    setActivity(act);
  }, []);

  // Deep-link support: ?cluster=<id> opens a cluster, ?view=heatmap picks a view.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("cluster");
    if (id && /^\d+$/.test(id)) setSelectedCluster(Number(id));
    const v = params.get("view");
    if (v === "heatmap" || v === "timeline") setView(v);
  }, []);

  // Initial load: sources + timeline.
  useEffect(() => {
    let active = true;
    Promise.all([
      getSources(),
      getTimeline({ days: WINDOW_DAYS }),
      getActivity({ days: WINDOW_DAYS }),
    ])
      .then(([srcs, tl, act]) => {
        if (!active) return;
        setSources(srcs);
        setSelected(new Set(srcs.map((s) => s.key)));
        setItems(tl.items);
        setActivity(act);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Stretch goal: auto-refresh the timeline view on an interval.
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      loadData().catch(() => {});
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, loadData]);

  const toggleSource = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Filter (source + multi-article + keyword), then sort, then cap.
  const { visible, totalMatching } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = items.filter((it) => {
      if (multiOnly && it.articleCount < 2) return false;
      const srcs = it.sources || [];
      if (!srcs.some((s) => selected.has(s))) return false;
      if (q) {
        const hay = `${it.label} ${(it.topTerms || []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    matched.sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
      }
      // "active": biggest topics first, then most recent.
      return (
        b.articleCount - a.articleCount ||
        new Date(b.endTime).getTime() - new Date(a.endTime).getTime()
      );
    });

    return { visible: matched.slice(0, ROW_CAP), totalMatching: matched.length };
  }, [items, multiOnly, selected, query, sortBy]);

  const stats = useMemo(() => {
    const multi = items.filter((i) => i.articleCount > 1).length;
    const articles = items.reduce((n, i) => n + i.articleCount, 0);
    return { clusters: items.length, multi, articles };
  }, [items]);

  // Most recent article time across the dataset — a freshness indicator.
  const latest = useMemo(() => {
    let max = "";
    for (const it of items) if (it.endTime > max) max = it.endTime;
    return max || null;
  }, [items]);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <span className="text-sky-400">●</span> News Pulse
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Live news clustered into topics and plotted on a timeline.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <RefreshButton onComplete={loadData} />
          {latest && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Latest article {relativeTime(latest)}
            </span>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Topics (30d)" value={stats.clusters} />
        <Stat label="Multi-article" value={stats.multi} />
        <Stat label="Articles" value={stats.articles} />
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SourceFilter sources={sources} selected={selected} onToggle={toggleSource} />
          <div className="flex items-center gap-4 text-sm">
            <ViewSwitch view={view} onChange={setView} />
            {view === "timeline" && (
              <Toggle
                checked={multiOnly}
                onChange={() => setMultiOnly((v) => !v)}
                label="Multi-article only"
              />
            )}
            <Toggle
              checked={autoRefresh}
              onChange={() => setAutoRefresh((v) => !v)}
              label="Auto-refresh"
            />
          </div>
        </div>
        {view === "timeline" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-xs">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search topics…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-400/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <span>Sort</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-slate-100 focus:border-sky-400/50 focus:outline-none"
            >
              <option value="active">Most active</option>
              <option value="recent">Most recent</option>
            </select>
          </div>
        </div>
        )}
      </div>

      {/* Legend (timeline view) */}
      {view === "timeline" && (
        <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded bg-gradient-to-r from-sky-500 to-sky-300" />
            single-source topic
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-6 rounded bg-gradient-to-r from-amber-500 to-amber-300" />
            cross-source story
          </span>
          <span>· bar width = active window · size = article count · click for articles</span>
        </div>
      )}

      {/* Result count + cap note (timeline view) */}
      {view === "timeline" && !loading && !error && (
        <div className="mb-2 text-xs text-slate-500">
          Showing {visible.length} of {totalMatching} topic
          {totalMatching !== 1 ? "s" : ""}
          {totalMatching > ROW_CAP && (
            <span className="text-slate-400">
              {" "}
              — capped at {ROW_CAP}; refine with search or the source filter
            </span>
          )}
        </div>
      )}

      {/* Visualization */}
      {loading ? (
        <div className="flex h-64 items-center justify-center text-slate-400">
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          Failed to load: {error}. Is the backend running at{" "}
          {process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}?
        </div>
      ) : view === "heatmap" ? (
        activity && <Heatmap data={activity} selected={selected} />
      ) : (
        <Timeline
          items={visible}
          selectedId={selectedCluster}
          onSelect={setSelectedCluster}
        />
      )}

      <ClusterDetail
        clusterId={selectedCluster}
        onClose={() => setSelectedCluster(null)}
      />
    </main>
  );
}

function ViewSwitch({
  view,
  onChange,
}: {
  view: View;
  onChange: (v: View) => void;
}) {
  return (
    <div className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {(["timeline", "heatmap"] as View[]).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
            view === v
              ? "bg-sky-500 text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onChange}
      role="switch"
      aria-checked={checked}
      className="group flex items-center gap-2 text-slate-300 hover:text-slate-100"
    >
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 ${
          checked
            ? "border-sky-400/60 bg-sky-500"
            : "border-white/10 bg-white/10 group-hover:bg-white/20"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-[18px]" : "translate-x-[3px]"
          }`}
        />
      </span>
      <span className="select-none">{label}</span>
    </button>
  );
}
