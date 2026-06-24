import { useEffect, useState } from "react";
import { CheckCircle2, GitBranch, Plus, Star } from "lucide-react";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { ModelVersion } from "@/lib/types";

// Seed versions (in the full app: GET /tasks/{id}/models). Demonstrates the
// versioned model registry + lineage.
const SEED: ModelVersion[] = [
  {
    id: "fd5ae6561671",
    task_id: "t1",
    version: 2,
    created_at: "2026-06-18 17:54",
    model: "efficientnet_v2",
    format: "onnx",
    path: "output/2025-07-07_19-40-50/epoch_00050.onnx",
    size_bytes: 45_900_000,
    metrics: { accuracy: 0.95, loss: 0.038 },
    classes: { 0: "Chrom", 1: "Black" },
    lineage: {
      run_id: "2025-07-07_19-40-50",
      dataset_fingerprint: "cab8ab3eeadb",
      train_summary: "retrained with 16 hard examples",
    },
    active: true,
  },
  {
    id: "a13c90ff21bd",
    task_id: "t1",
    version: 1,
    created_at: "2026-06-15 11:02",
    model: "efficientnet_v2",
    format: "onnx",
    path: "output/2025-07-05_09-12-30/epoch_00050.onnx",
    size_bytes: 45_800_000,
    metrics: { accuracy: 0.93, loss: 0.041 },
    classes: { 0: "Chrom", 1: "Black" },
    lineage: {
      run_id: "2025-07-05_09-12-30",
      dataset_fingerprint: "7be1029ad334",
      train_summary: "initial training",
    },
    active: false,
  },
];

const mb = (b: number) => `${(b / 1_000_000).toFixed(1)} MB`;

export function RegisterPage({ onEnter }: { onEnter?: () => void }) {
  useEffect(() => onEnter?.(), [onEnter]);

  const [versions, setVersions] = useState<ModelVersion[]>(SEED);
  const [selected, setSelected] = useState<string>(SEED[0].id);
  const detail = versions.find((v) => v.id === selected) ?? versions[0];

  function promote(id: string) {
    setVersions((vs) => vs.map((v) => ({ ...v, active: v.id === id })));
  }

  function registerCurrent() {
    const next = Math.max(...versions.map((v) => v.version)) + 1;
    const v: ModelVersion = {
      ...SEED[0],
      id: Math.random().toString(16).slice(2, 14),
      version: next,
      created_at: new Date().toISOString().slice(0, 16).replace("T", " "),
      metrics: { accuracy: 0.96, loss: 0.034 },
      active: false,
      lineage: { ...SEED[0].lineage, train_summary: "current run" },
    };
    setVersions((vs) => [v, ...vs]);
    setSelected(v.id);
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Versions */}
        <Card className="flex flex-col">
          <CardHeader
            title="Model versions"
            subtitle="Every trained model, versioned"
            right={
              <Button onClick={registerCurrent}>
                <Plus className="h-4 w-4" /> Register current run
              </Button>
            }
          />
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => setSelected(v.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-5 py-3 text-left transition-colors",
                  selected === v.id
                    ? "bg-brand-50 dark:bg-slate-800"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
                )}
              >
                <span className="grid h-8 w-8 place-items-center rounded-control bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-700">
                  v{v.version}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {v.model}
                    {v.active && <Badge tone="success">active</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {v.created_at} · {mb(v.size_bytes)} · {v.format}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums text-success">
                    {(v.metrics.accuracy * 100).toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-400">accuracy</div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Lineage detail */}
        <Card className="flex flex-col">
          <CardHeader title={`v${detail.version} lineage`} subtitle="Reproducibility trail" />
          <div className="flex-1 space-y-3 p-5 text-sm">
            <Row label="Architecture" value={detail.model} />
            <Row label="Format" value={detail.format} />
            <Row label="Accuracy" value={`${(detail.metrics.accuracy * 100).toFixed(1)}%`} />
            <Row label="Loss" value={detail.metrics.loss?.toFixed(3) ?? "—"} />
            <Row label="Classes" value={Object.values(detail.classes).join(", ")} />
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <GitBranch className="h-3.5 w-3.5" /> Lineage
              </div>
              <Row label="Run" value={detail.lineage.run_id ?? "—"} mono />
              <Row label="Dataset" value={detail.lineage.dataset_fingerprint ?? "—"} mono />
              <Row label="Note" value={detail.lineage.train_summary ?? "—"} />
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              {detail.path}
            </div>
          </div>
          <div className="border-t border-slate-100 p-4 dark:border-slate-800">
            {detail.active ? (
              <div className="flex items-center justify-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> Active version
              </div>
            ) : (
              <Button className="w-full" onClick={() => promote(detail.id)}>
                <Star className="h-4 w-4" /> Promote to active
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className={cn("truncate font-medium", mono && "font-mono text-xs")}>
        {value}
      </span>
    </div>
  );
}
