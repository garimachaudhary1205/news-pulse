// Shapes returned by the News Pulse backend API.

export interface Source {
  key: string;
  name: string;
  articleCount: number;
}

export interface TimelineItem {
  id: number;
  label: string;
  topTerms: string[];
  sources: string[];
  articleCount: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  intensity: number; // 0..1, relative to the busiest cluster
}

export interface TimelineResponse {
  domain: { start: string; end: string } | null;
  count: number;
  items: TimelineItem[];
}

export interface Article {
  id: number;
  title: string;
  url: string;
  sourceKey: string;
  sourceName: string;
  summary: string;
  publishedAt: string | null;
}

export interface ClusterDetail {
  id: number;
  label: string;
  topTerms: string[];
  articleCount: number;
  startTime: string | null;
  endTime: string | null;
  updatedAt: string;
  articles: Article[];
}

export interface ActivitySource {
  key: string;
  name: string;
  counts: Record<string, number>; // "YYYY-MM-DD" -> article count
  total: number;
}

export interface ActivityResponse {
  days: string[]; // days that have at least one article
  sources: ActivitySource[];
  totalsByDay: Record<string, number>;
  maxCell: number;
  maxTotal: number;
}

export interface IngestJob {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  newArticles: number | null;
  clusterCount: number | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}
