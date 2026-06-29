"use client";

import { useEffect, useRef, useState } from "react";
import { getIngestStatus, triggerIngest } from "@/lib/api";

interface Props {
  // Called when a triggered ingest run finishes successfully, so the parent
  // can refetch the timeline.
  onComplete: () => void;
}

type Phase = "idle" | "working" | "error";

export default function RefreshButton({ onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function run() {
    if (phase === "working") return;
    setPhase("working");
    setMessage("Starting…");
    try {
      const { jobId } = await triggerIngest();
      setMessage("Scraping & clustering…");
      pollRef.current = setInterval(async () => {
        try {
          const job = await getIngestStatus(jobId);
          if (job.status === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase("idle");
            setMessage(
              `Updated · ${job.newArticles ?? 0} new, ${job.clusterCount ?? 0} clusters`
            );
            onComplete();
          } else if (job.status === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase("error");
            setMessage(job.error || "Ingest failed");
          }
        } catch {
          // transient poll error — keep polling
        }
      }, 2500);
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Failed to start");
    }
  }

  const working = phase === "working";
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={working}
        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
          working
            ? "cursor-not-allowed bg-sky-500/40 text-white/70"
            : "bg-sky-500 text-white hover:bg-sky-400"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white ${
            working ? "animate-spin" : ""
          }`}
        />
        {working ? "Refreshing…" : "Refresh data"}
      </button>
      {message && (
        <span
          className={`text-xs ${
            phase === "error" ? "text-rose-400" : "text-slate-400"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
