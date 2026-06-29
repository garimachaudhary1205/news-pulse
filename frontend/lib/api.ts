// Thin typed client for the News Pulse backend.
import type {
  ActivityResponse,
  ClusterDetail,
  IngestJob,
  Source,
  TimelineResponse,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`GET ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function getSources() {
  return get<{ sources: Source[] }>("/sources").then((r) => r.sources);
}

export function getTimeline(opts: { days?: number; source?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.days !== undefined) params.set("days", String(opts.days));
  if (opts.source) params.set("source", opts.source);
  const qs = params.toString();
  return get<TimelineResponse>(`/timeline${qs ? `?${qs}` : ""}`);
}

export function getActivity(opts: { days?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.days !== undefined) params.set("days", String(opts.days));
  const qs = params.toString();
  return get<ActivityResponse>(`/activity${qs ? `?${qs}` : ""}`);
}

export function getCluster(id: number) {
  return get<ClusterDetail>(`/clusters/${id}`);
}

export async function triggerIngest(): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/ingest/trigger`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Trigger failed: ${res.status}`);
  }
  return res.json();
}

export function getIngestStatus(jobId: string) {
  return get<IngestJob>(`/ingest/status/${jobId}`);
}
