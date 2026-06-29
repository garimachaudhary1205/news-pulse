"use client";

import { useMemo } from "react";
import type { ActivityResponse } from "@/lib/types";
import { sourceColor, withAlpha } from "@/lib/sourceColors";

interface Props {
  data: ActivityResponse;
  // Source keys to show as rows (driven by the source filter).
  selected: Set<string>;
}

const SKY = "#38bdf8";

// Build a continuous list of YYYY-MM-DD strings from first to last day so the
// calendar has no gaps even on days with no articles.
function dateRange(days: string[]): string[] {
  if (days.length === 0) return [];
  const start = new Date(days[0] + "T00:00:00Z");
  const end = new Date(days[days.length - 1] + "T00:00:00Z");
  const out: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function shortLabel(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function Heatmap({ data, selected }: Props) {
  const cols = useMemo(() => dateRange(data.days), [data.days]);
  const rows = useMemo(
    () => data.sources.filter((s) => selected.has(s.key)),
    [data.sources, selected]
  );

  if (cols.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-white/10 text-slate-400">
        No activity in this window. Try refreshing the data.
      </div>
    );
  }

  // Label only a handful of columns to avoid clutter.
  const labelEvery = Math.ceil(cols.length / 8);
  const gridCols = `120px repeat(${cols.length}, minmax(14px, 1fr))`;

  const cell = (count: number, base: string, max: number, title: string) => {
    const alpha = count > 0 ? 0.18 + 0.82 * (count / (max || 1)) : 0;
    return (
      <div
        key={title}
        title={title}
        className="aspect-square rounded-[3px] border border-white/[0.03]"
        style={{
          background: count > 0 ? withAlpha(base, alpha) : "rgba(255,255,255,0.03)",
        }}
      >
        {count > 0 && (
          <span className="flex h-full items-center justify-center text-[9px] font-medium text-white/80">
            {count}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="np-scroll overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Total row — overall daily pulse */}
          <div className="grid items-center gap-1" style={{ gridTemplateColumns: gridCols }}>
            <div className="pr-2 text-xs font-semibold text-slate-200">All sources</div>
            {cols.map((day) =>
              cell(
                data.totalsByDay[day] || 0,
                SKY,
                data.maxTotal,
                `All · ${shortLabel(day)}: ${data.totalsByDay[day] || 0} articles`
              )
            )}
          </div>

          {/* One row per selected source */}
          {rows.map((src) => (
            <div
              key={src.key}
              className="mt-1 grid items-center gap-1"
              style={{ gridTemplateColumns: gridCols }}
            >
              <div className="flex items-center gap-2 pr-2 text-xs text-slate-300">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: sourceColor(src.key) }}
                />
                <span className="truncate">{src.name}</span>
              </div>
              {cols.map((day) =>
                cell(
                  src.counts[day] || 0,
                  sourceColor(src.key),
                  data.maxCell,
                  `${src.name} · ${shortLabel(day)}: ${src.counts[day] || 0} articles`
                )
              )}
            </div>
          ))}

          {/* Column date labels */}
          <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: gridCols }}>
            <div />
            {cols.map((day, i) => (
              <div key={day} className="text-center text-[9px] text-slate-500">
                {i % labelEvery === 0 ? shortLabel(day) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <span>less</span>
        <span className="flex gap-0.5">
          {[0.18, 0.4, 0.6, 0.8, 1].map((a) => (
            <span
              key={a}
              className="h-3 w-3 rounded-[3px]"
              style={{ background: withAlpha(SKY, a) }}
            />
          ))}
        </span>
        <span>more articles per day · hover a cell for the count</span>
      </div>
    </div>
  );
}
