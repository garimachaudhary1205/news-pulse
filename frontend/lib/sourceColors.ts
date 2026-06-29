// Stable colour per source for dots/badges. Known sources get hand-picked
// colours; anything else falls back to a hash so new feeds still render
// distinctly without code changes.

const KNOWN: Record<string, string> = {
  bbc: "#e11d48", // rose
  npr: "#f59e0b", // amber
  guardian: "#3b82f6", // blue
  aljazeera: "#10b981", // emerald
};

const FALLBACK = [
  "#a855f7",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#ec4899",
  "#f97316",
];

export function sourceColor(key: string): string {
  if (KNOWN[key]) return KNOWN[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return FALLBACK[hash % FALLBACK.length];
}

// Convert a #rrggbb colour to an rgba() string at the given alpha.
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
