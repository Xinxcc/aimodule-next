import { useEffect, useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";

const CLASSES = ["Chrom", "Black"];

// Synthetic last-run metrics (in the full app these come from the training run
// directory / WS history).
function curve(epochs: number) {
  const out = [];
  let loss = 1.2;
  let acc = 0.45;
  for (let e = 1; e <= epochs; e++) {
    loss = Math.max(0.04, loss * 0.93);
    acc = Math.min(0.99, acc + (1 - acc) * 0.12);
    out.push({
      epoch: e,
      loss: Number(loss.toFixed(3)),
      val_loss: Number((loss * 1.15).toFixed(3)),
      acc: Number(acc.toFixed(3)),
    });
  }
  return out;
}

// 2x2 confusion matrix (rows = true, cols = predicted).
const CONFUSION = [
  [48, 4],
  [3, 45],
];

interface ClassMetric {
  label: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

// Derive proper classification metrics from the confusion matrix.
function metricsFromConfusion(m: number[][], labels: string[]) {
  const n = m.length;
  const total = m.flat().reduce((a, b) => a + b, 0);
  const correct = m.reduce((s, row, i) => s + row[i], 0);
  const perClass: ClassMetric[] = labels.map((label, i) => {
    const tp = m[i][i];
    const predicted = m.reduce((s, row) => s + row[i], 0); // column sum
    const actual = m[i].reduce((a, b) => a + b, 0); // row sum
    const precision = predicted ? tp / predicted : 0;
    const recall = actual ? tp / actual : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { label, precision, recall, f1, support: actual };
  });
  const macro = (k: keyof Omit<ClassMetric, "label" | "support">) =>
    perClass.reduce((s, c) => s + c[k], 0) / n;
  return {
    accuracy: total ? correct / total : 0,
    precision: macro("precision"),
    recall: macro("recall"),
    f1: macro("f1"),
    perClass,
  };
}

export function VisualizePage({ onEnter }: { onEnter?: () => void }) {
  useEffect(() => onEnter?.(), [onEnter]);

  const data = useMemo(() => curve(50), []);
  const m = useMemo(() => metricsFromConfusion(CONFUSION, CLASSES), []);
  const total = CONFUSION.flat().reduce((a, b) => a + b, 0);
  const maxCell = Math.max(...CONFUSION.flat());

  const samples = Array.from({ length: 8 }, (_, i) => {
    const r = Math.abs(Math.sin((i + 1) * 7.13)) % 1;
    const trueCls = i % 2;
    const correctPred = r > 0.2;
    const predCls = correctPred ? trueCls : 1 - trueCls;
    return {
      file: `${String(i).padStart(3, "0")}.jpg`,
      truth: CLASSES[trueCls],
      pred: CLASSES[predCls],
      conf: 0.6 + r * 0.39,
      correct: correctPred,
    };
  });

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      {/* Metric headline — proper classification metrics, not just accuracy */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Accuracy" value={`${(m.accuracy * 100).toFixed(1)}%`} hint={`${total} samples`} />
        <Metric label="Precision" value={`${(m.precision * 100).toFixed(1)}%`} hint="macro avg" />
        <Metric label="Recall" value={`${(m.recall * 100).toFixed(1)}%`} hint="macro avg" />
        <Metric label="F1 score" value={`${(m.f1 * 100).toFixed(1)}%`} hint="macro avg" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Curves */}
        <Card>
          <CardHeader title="Training curves" subtitle="Loss & accuracy per epoch" />
          <div className="h-64 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: -18, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="epoch" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip />
                <Line type="monotone" dataKey="loss" stroke="#DC2626" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="val_loss" stroke="#D97706" dot={false} strokeWidth={2} strokeDasharray="4 3" isAnimationActive={false} />
                <Line type="monotone" dataKey="acc" stroke="#16A34A" dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400 dark:border-slate-800">
            <Legend color="bg-danger" label="loss" />
            <Legend color="bg-warning" label="val loss" />
            <Legend color="bg-success" label="accuracy" />
          </div>
        </Card>

        {/* Confusion matrix */}
        <Card>
          <CardHeader title="Confusion matrix" subtitle="Rows: true · Cols: predicted" />
          <div className="p-5">
            <div className="flex">
              <div className="flex flex-col justify-around pr-2 text-[11px] text-slate-400">
                {CLASSES.map((c) => (
                  <span key={c} className="h-16 leading-[4rem]">{c}</span>
                ))}
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-2 gap-1">
                  {CONFUSION.map((row, i) =>
                    row.map((v, j) => {
                      const intensity = v / maxCell;
                      const diag = i === j;
                      return (
                        <div
                          key={`${i}-${j}`}
                          className={cn(
                            "grid h-16 place-items-center rounded text-sm font-semibold",
                            diag ? "text-white" : "text-slate-700 dark:text-slate-200",
                          )}
                          style={{
                            backgroundColor: diag
                              ? `rgba(22,163,74,${0.25 + intensity * 0.75})`
                              : `rgba(220,38,38,${0.12 + intensity * 0.6})`,
                          }}
                        >
                          {v}
                        </div>
                      );
                    }),
                  )}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-center text-[11px] text-slate-400">
                  {CLASSES.map((c) => (
                    <span key={c}>{c}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Per-class metrics */}
      <Card>
        <CardHeader title="Per-class metrics" subtitle="Precision / Recall / F1 by class" />
        <div className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Class</th>
                <th className="pb-2 text-right font-medium">Precision</th>
                <th className="pb-2 text-right font-medium">Recall</th>
                <th className="pb-2 text-right font-medium">F1</th>
                <th className="pb-2 text-right font-medium">Support</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {m.perClass.map((c) => (
                <tr key={c.label}>
                  <td className="py-2 font-medium">{c.label}</td>
                  <td className="py-2 text-right tabular-nums">
                    {(c.precision * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {(c.recall * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {(c.f1 * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 text-right tabular-nums text-slate-400">
                    {c.support}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Sample predictions */}
      <Card>
        <CardHeader title="Sample predictions" subtitle="Validation set" />
        <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
          {samples.map((s) => (
            <div
              key={s.file}
              className="rounded-control border border-slate-200 p-3 dark:border-slate-700"
            >
              <div className="mb-2 grid h-16 place-items-center rounded bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] text-slate-400 dark:from-slate-800 dark:to-slate-700">
                {s.file}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{s.pred}</span>
                <Badge tone={s.correct ? "success" : "danger"}>
                  {s.correct ? "✓" : `≠ ${s.truth}`}
                </Badge>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                conf {(s.conf * 100).toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] text-slate-400">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-full", color)} /> {label}
    </span>
  );
}
