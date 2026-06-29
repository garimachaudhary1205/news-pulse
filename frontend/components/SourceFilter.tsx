"use client";

import type { Source } from "@/lib/types";
import { sourceColor } from "@/lib/sourceColors";

interface Props {
  sources: Source[];
  selected: Set<string>;
  onToggle: (key: string) => void;
}

export default function SourceFilter({ sources, selected, onToggle }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
        Sources
      </span>
      {sources.map((s) => {
        const on = selected.has(s.key);
        return (
          <button
            key={s.key}
            onClick={() => onToggle(s.key)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors ${
              on
                ? "border-white/20 bg-white/10 text-slate-100"
                : "border-white/5 bg-transparent text-slate-500 line-through"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: sourceColor(s.key), opacity: on ? 1 : 0.4 }}
            />
            {s.name}
            <span className="text-[11px] text-slate-500">{s.articleCount}</span>
          </button>
        );
      })}
    </div>
  );
}
