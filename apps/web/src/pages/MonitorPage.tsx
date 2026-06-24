import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DriftReport, HardExample } from "@/lib/types";

// Seed drift report (in the full app: POST /monitoring/ingest after a deploy
// batch, then GET /monitoring). Shows the production drift + hard-example
// mining that feeds the retraining loop.
const REPORT: DriftReport = {
  task_id: "t1",
  samples: 320,
  psi: 0.27,
  drifted: true,
  avg_confidence: 0.78,
  low_confidence_rate: 0.18,
  distribution: [
    { label: "chrom", reference: 0.5, live: 0.34 },
    { label: "black", reference: 0.5, live: 0.66 },
  ],
  hard_examples: Array.from({ length: 9 }, (_, i) => ({
    file: `live/${String(i).padStart(3, "0")}.jpg`,
    predicted: i % 2 ? "Black" : "Chrom",
    confidence: 0.4 + (Math.abs(Math.sin((i + 1) * 3.7)) % 1) * 0.28,
    reason: i % 3 === 0 ? "anomaly" : "low_confidence",
  })) as HardExample[],
};

export function MonitorPage({ onEnter }: { onEnter?: () => void }) {
  useEffect(() => onEnter?.(), [onEnter]);

  const report = REPORT;
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(report.hard_examples.map((h) => h.file)),
  );
  const [retrained, setRetrained] = useState(false);

  const maxBin = useMemo(
    () => Math.max(...report.distribution.flatMap((d) => [d.reference, d.live]), 0.1),
    [report],
  );

  function toggle(file: string) {
    setPicked((s) => {
      const n = new Set(s);
      n.has(file) ? n.delete(file) : n.add(file);
      return n;
    });
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Predictions" value={`${report.samples}`} icon={<Activity className="h-4 w-4" />} />
        <Metric
          label="Drift (PSI)"
          value={report.psi.toFixed(2)}
          tone={report.drifted ? "danger" : "success"}
        />
        <Metric label="Avg confidence" value={`${(report.avg_confidence * 100).toFixed(0)}%`} />
        <Metric label="Low-conf rate" value={`${(report.low_confidence_rate * 100).toFixed(0)}%`} />
      </div>

      {report.drifted && (
        <div className="flex items-center gap-3 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          Distribution drift detected (PSI {report.psi.toFixed(2)} &gt; 0.20). The
          live class mix has shifted from training — consider retraining with the
          hard examples below.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Distribution: reference vs live */}
        <Card>
          <CardHeader title="Distribution shift" subtitle="Training vs production" />
          <div className="space-y-4 p-5">
            {report.distribution.map((d) => (
              <div key={d.label} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{d.label}</span>
                  <span className="text-slate-400">
                    ref {(d.reference * 100).toFixed(0)}% → live{" "}
                    {(d.live * 100).toFixed(0)}%
                  </span>
                </div>
                <Bar value={d.reference} max={maxBin} className="bg-slate-300" />
                <Bar value={d.live} max={maxBin} className="bg-brand-600" />
              </div>
            ))}
            <div className="flex gap-4 pt-1 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300" /> training
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-brand-600" /> production
              </span>
            </div>
          </div>
        </Card>

        {/* Hard examples + retrain */}
        <Card className="flex flex-col">
          <CardHeader
            title="Hard examples"
            subtitle="Low-confidence / anomalous predictions"
            right={<Badge tone="warning">{report.hard_examples.length} found</Badge>}
          />
          <div className="grid max-h-72 grid-cols-3 gap-3 overflow-auto p-5">
            {report.hard_examples.map((h) => {
              const on = picked.has(h.file);
              return (
                <button
                  key={h.file}
                  onClick={() => toggle(h.file)}
                  className={cn(
                    "rounded-control border p-2 text-left transition-colors",
                    on
                      ? "border-brand-600 ring-1 ring-brand-600"
                      : "border-slate-200 dark:border-slate-700",
                  )}
                >
                  <div className="relative mb-1.5 grid h-14 place-items-center rounded bg-gradient-to-br from-slate-100 to-slate-200 text-[9px] text-slate-400 dark:from-slate-800 dark:to-slate-700">
                    {h.file.split("/").pop()}
                    {on && (
                      <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-brand-600 text-[10px] text-white">
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium">{h.predicted}</span>
                    <span className="text-slate-400">
                      {(h.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <Badge tone={h.reason === "anomaly" ? "danger" : "warning"}>
                    {h.reason === "anomaly" ? "anomaly" : "low conf"}
                  </Badge>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800">
            <span className="text-xs text-slate-400">
              {picked.size} selected for retraining
            </span>
            {retrained ? (
              <Badge tone="success">added to training · retraining…</Badge>
            ) : (
              <Button disabled={picked.size === 0} onClick={() => setRetrained(true)}>
                <Sparkles className="h-4 w-4" /> Add to training set & retrain
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost">
          <RefreshCw className="h-4 w-4" /> Refresh from latest deploy
        </Button>
        <span className="text-xs text-slate-400">
          Closes the loop: monitor → mine hard cases → retrain
        </span>
      </div>
    </div>
  );
}

function Bar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className: string;
}) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className={cn("h-full rounded-full", className)}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success";
  icon?: React.ReactNode;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="flex items-center gap-1 text-[11px] text-slate-400">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-2xl font-semibold tabular-nums",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </div>
    </Card>
  );
}
