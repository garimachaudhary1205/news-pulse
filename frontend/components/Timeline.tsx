"use client";

import { useMemo } from "react";
import type { TimelineItem } from "@/lib/types";
import { sourceColor } from "@/lib/sourceColors";

interface Props {
  items: TimelineItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const LABEL_W = 240; // px — left label column

function fmtTick(ms: number, spanDays: number) {
  const d = new Date(ms);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  // For short spans include the hour so ticks aren't ambiguous.
  if (spanDays <= 3) {
    const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  }
  return date;
}

export default function Timeline({ items, selectedId, onSelect }: Props) {
  // Compute the axis domain from the rendered items so the chart zooms to
  // whatever the active filters leave on screen.
  const { domStart, span, ticks, spanDays } = useMemo(() => {
    if (items.length === 0) {
      const now = Date.now();
      return { domStart: now, span: 1, ticks: [] as number[], spanDays: 1 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const it of items) {
      min = Math.min(min, new Date(it.startTime).getTime());
      max = Math.max(max, new Date(it.endTime).getTime());
    }
    if (max <= min) max = min + 60 * 60 * 1000; // 1h floor for all-instant data
    const pad = (max - min) * 0.04;
    const start = min - pad;
    const end = max + pad;
    const totalSpan = end - start;
    const sDays = totalSpan / (1000 * 60 * 60 * 24);

    const TICKS = 6;
    const tk: number[] = [];
    for (let i = 0; i <= TICKS; i++) tk.push(start + (totalSpan * i) / TICKS);
    return { domStart: start, span: totalSpan, ticks: tk, spanDays: sDays };
  }, [items]);

  const pct = (iso: string) =>
    ((new Date(iso).getTime() - domStart) / span) * 100;

  if (items.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-white/10 text-slate-400">
        No topics in this view. Try clearing filters or refreshing the data.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02]">
      {/* Axis header */}
      <div className="flex border-b border-white/10">
        <div
          style={{ width: LABEL_W }}
          className="shrink-0 px-4 py-2 text-xs font-medium uppercase tracking-wider text-slate-500"
        >
          Topic
        </div>
        <div className="relative h-8 flex-1">
          {ticks.map((t, i) => (
            <div
              key={i}
              className="absolute top-0 flex h-full items-center"
              style={{ left: `${((t - domStart) / span) * 100}%` }}
            >
              <span className="-translate-x-1/2 whitespace-nowrap text-[10px] text-slate-500">
                {fmtTick(t, spanDays)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div className="np-scroll max-h-[60vh] overflow-y-auto">
        {items.map((it) => {
          const left = pct(it.startTime);
          const width = Math.max(pct(it.endTime) - left, 0);
          const isInstant = width < 0.4; // negligible span → render a marker
          const multiSource = (it.sources?.length || 0) > 1;
          const selected = it.id === selectedId;
          const opacity = 0.45 + it.intensity * 0.55;

          return (
            <div
              key={it.id}
              className={`flex items-stretch border-b border-white/5 transition-colors hover:bg-white/[0.04] ${
                selected ? "bg-white/[0.06]" : ""
              }`}
            >
              {/* Label */}
              <button
                onClick={() => onSelect(it.id)}
                style={{ width: LABEL_W }}
                className="flex shrink-0 cursor-pointer flex-col gap-1 px-4 py-2 text-left"
              >
                <span className="truncate text-sm font-medium text-slate-100">
                  {it.label}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">
                    {it.articleCount} article{it.articleCount !== 1 ? "s" : ""}
                  </span>
                  <span className="flex gap-1">
                    {(it.sources || []).map((s) => (
                      <span
                        key={s}
                        title={s}
                        className="h-2 w-2 rounded-full"
                        style={{ background: sourceColor(s) }}
                      />
                    ))}
                  </span>
                  {multiSource && (
                    <span className="rounded bg-amber-400/15 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                      cross-source
                    </span>
                  )}
                </span>
              </button>

              {/* Track */}
              <button
                onClick={() => onSelect(it.id)}
                className="relative h-12 flex-1 cursor-pointer"
                title={`${it.label} — ${new Date(it.startTime).toLocaleString()} → ${new Date(it.endTime).toLocaleString()}`}
              >
                {/* gridlines */}
                {ticks.map((t, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full w-px bg-white/5"
                    style={{ left: `${((t - domStart) / span) * 100}%` }}
                  />
                ))}

                {isInstant ? (
                  <span
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ${
                      selected ? "ring-white" : "ring-transparent"
                    }`}
                    style={{
                      left: `${left}%`,
                      width: 12 + it.intensity * 8,
                      height: 12 + it.intensity * 8,
                      background: multiSource ? "#fbbf24" : "#38bdf8",
                      opacity,
                    }}
                  />
                ) : (
                  <span
                    className={`absolute top-1/2 -translate-y-1/2 rounded-md ring-1 ${
                      selected ? "ring-white" : "ring-white/20"
                    }`}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      minWidth: 10,
                      height: 14 + it.intensity * 14,
                      background: multiSource
                        ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                        : "linear-gradient(90deg, #0ea5e9, #38bdf8)",
                      opacity,
                    }}
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
