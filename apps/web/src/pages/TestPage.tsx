import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FolderInput,
  Play,
  Square,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import type { JobState, PredictionOut } from "@/lib/types";

const CLASSES = ["Chrom", "Black"];

// One deterministic prediction for index i (shared by the live simulator and
// the synchronous demo fill).
function genResult(i: number): PredictionOut {
  const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453);
  const frac = r - Math.floor(r);
  const cls = frac > 0.5 ? 0 : 1;
  const conf = 0.6 + frac * 0.39;
  return {
    file: `${String(i).padStart(3, "0")}.jpg`,
    task_type: "classification",
    ok: true,
    error: null,
    top_label: CLASSES[cls],
    top_score: Number(conf.toFixed(3)),
    scores: CLASSES.map((label, k) => ({
      class_id: k,
      label,
      score: k === cls ? conf : 1 - conf,
    })),
    detections: [],
    is_anomaly: null,
    simulated: true,
  };
}

// Local simulator mirroring the backend's /predict/batch WS stream so the page
// demos batch inference without a running backend or trained model. Swap
// `run` for api.startBatch + api.streamBatch to drive it from the real service.
function simulateBatch(
  count: number,
  onEvent: (done: number, total: number, r: PredictionOut) => void,
  onDone: (state: JobState) => void,
): () => void {
  let i = 0;
  const id = window.setInterval(() => {
    i += 1;
    onEvent(i, count, genResult(i - 1));
    if (i >= count) {
      window.clearInterval(id);
      onDone("completed");
    }
  }, 90);
  return () => window.clearInterval(id);
}

export function TestPage({ onEnter }: { onEnter?: () => void }) {
  useEffect(() => onEnter?.(), [onEnter]);

  const [folder, setFolder] = useState("test");
  const [state, setState] = useState<JobState | "idle">("idle");
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<PredictionOut[]>([]);
  const stopRef = useRef<(() => void) | null>(null);

  const running = state === "running";

  function start() {
    setResults([]);
    setDone(0);
    const count = 24; // stand-in folder size
    setTotal(count);
    setState("running");
    stopRef.current = simulateBatch(
      count,
      (d, _t, r) => {
        setDone(d);
        setResults((prev) => [...prev, r]);
      },
      (s) => setState(s),
    );
  }

  function cancel() {
    stopRef.current?.();
    setState("cancelled");
  }

  useEffect(() => () => stopRef.current?.(), []);

  // Demo hook: `/test?demo=1` fills a completed batch synchronously (used for
  // static previews / screenshots, no timers).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") === "1") {
      const count = 24;
      setResults(Array.from({ length: count }, (_, i) => genResult(i)));
      setTotal(count);
      setDone(count);
      setState("completed");
    }
  }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of results) if (r.top_label) m[r.top_label] = (m[r.top_label] ?? 0) + 1;
    return m;
  }, [results]);

  const avgConf = useMemo(() => {
    const v = results.filter((r) => r.top_score != null);
    return v.length ? v.reduce((s, r) => s + (r.top_score ?? 0), 0) / v.length : 0;
  }, [results]);

  const progress = total ? done / total : 0;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      {/* Source + controls */}
      <Card>
        <CardHeader
          title="Batch inference"
          subtitle="Run the exported model over a folder of images"
          right={
            state !== "idle" ? (
              <Badge tone="warning">simulated (no model)</Badge>
            ) : undefined
          }
        />
        <div className="flex items-end gap-3 p-5">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Image folder
            </span>
            <div className="flex items-center gap-2">
              <FolderInput className="h-4 w-4 text-slate-400" />
              <Input
                className="flex-1"
                value={folder}
                disabled={running}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="path to a folder of images"
              />
            </div>
          </div>
          {running ? (
            <Button variant="danger" onClick={cancel}>
              <Square className="h-4 w-4" /> Cancel
            </Button>
          ) : (
            <Button onClick={start}>
              <Play className="h-4 w-4" /> Run batch
            </Button>
          )}
        </div>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Summary" />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Processed" value={`${done}/${total || "--"}`} />
              <Stat label="Avg confidence" value={`${(avgConf * 100).toFixed(1)}%`} />
            </div>
            {state !== "idle" && (
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Class distribution
              </span>
              {Object.keys(counts).length === 0 ? (
                <p className="text-xs text-slate-400">No results yet.</p>
              ) : (
                Object.entries(counts).map(([label, n]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-slate-500">{label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${(n / Math.max(1, done)) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-xs tabular-nums text-slate-500">
                      {n}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        {/* Results grid */}
        <Card className="flex flex-col">
          <CardHeader
            title="Results"
            subtitle={`${results.length} prediction(s)`}
            right={
              state === "completed" ? (
                <Badge tone="success">done</Badge>
              ) : running ? (
                <Badge tone="brand">running</Badge>
              ) : undefined
            }
          />
          <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-auto p-5 sm:grid-cols-3">
            {results.length === 0 ? (
              <p className="col-span-3 grid h-40 place-items-center text-sm text-slate-400">
                Run a batch to see predictions.
              </p>
            ) : (
              results.map((r) => <ResultCard key={r.file} r={r} />)
            )}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost">Back</Button>
        <Button variant="ghost" disabled={state !== "completed"}>
          Export results
        </Button>
      </div>
    </div>
  );
}

function ResultCard({ r }: { r: PredictionOut }) {
  const conf = r.top_score ?? 0;
  const tone = !r.ok ? "danger" : conf >= 0.85 ? "success" : "warning";
  return (
    <div className="rounded-control border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 grid h-16 place-items-center rounded bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] text-slate-400 dark:from-slate-800 dark:to-slate-700">
        {r.file}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {r.ok ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-danger" />
          )}
          {r.top_label ?? "error"}
        </div>
        <Badge tone={tone}>{(conf * 100).toFixed(0)}%</Badge>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
