import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, ArrowRight, Play, Square } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
} from "@/components/ui";
import type { JobState, TrainConfig, TrainEvent } from "@/lib/types";

const MODELS = [
  "efficientnet_v2",
  "efficientnet_b0",
  "resnet50",
  "mininet",
];

interface Point {
  epoch: number;
  loss: number;
  acc: number;
}

// Local simulator mirroring the backend's TrainEvent stream, so the prototype
// shows live charts with `npm run dev` alone. Swap `runTraining` for
// api.startTraining + api.streamJob to drive it from the real backend.
function simulate(
  cfg: TrainConfig,
  onEvent: (e: TrainEvent) => void,
): () => void {
  let epoch = 0;
  let loss = 1.2;
  let acc = 0.4;
  const id = window.setInterval(() => {
    epoch += 1;
    loss = Math.max(0.02, loss * (0.86 + Math.random() * 0.11));
    acc = Math.min(0.999, acc + (1 - acc) * (0.05 + Math.random() * 0.15));
    const done = epoch >= cfg.epochs;
    onEvent({
      job_id: "sim",
      state: (done ? "completed" : "running") as JobState,
      epoch,
      total_epochs: cfg.epochs,
      loss: Number(loss.toFixed(4)),
      accuracy: Number(acc.toFixed(4)),
      progress: epoch / cfg.epochs,
      log: `epoch ${epoch}/${cfg.epochs}  loss ${loss.toFixed(4)}  acc ${acc.toFixed(4)}`,
    });
    if (done) window.clearInterval(id);
  }, 250);
  return () => window.clearInterval(id);
}

export function TrainPage({ onEnter }: { onEnter?: () => void }) {
  useEffect(() => onEnter?.(), [onEnter]);

  const [cfg, setCfg] = useState<TrainConfig>({
    model: "efficientnet_v2",
    epochs: 50,
    batch_size: 16,
    learning_rate: 0.001,
    convert_gray_to_rgb: false,
  });
  const [split] = useState({ training: 80, validation: 10, test: 10 });
  const [state, setState] = useState<JobState | "idle">("idle");
  const [points, setPoints] = useState<Point[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [latest, setLatest] = useState<TrainEvent | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const logBox = useRef<HTMLDivElement>(null);

  const running = state === "running";

  function start() {
    setPoints([]);
    setLogs([]);
    setLatest(null);
    setState("running");
    stopRef.current = simulate(cfg, (e) => {
      setLatest(e);
      setState(e.state);
      if (e.loss != null && e.accuracy != null) {
        setPoints((p) => [
          ...p,
          { epoch: e.epoch, loss: e.loss!, acc: e.accuracy! },
        ]);
      }
      if (e.log) setLogs((l) => [...l, e.log!]);
    });
  }

  function cancel() {
    stopRef.current?.();
    setState("cancelled");
    setLogs((l) => [...l, "Training cancelled"]);
  }

  useEffect(() => () => stopRef.current?.(), []);
  useEffect(() => {
    logBox.current?.scrollTo({ top: logBox.current.scrollHeight });
  }, [logs]);

  const progress = latest?.progress ?? 0;

  function num(key: keyof TrainConfig) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setCfg((c) => ({ ...c, [key]: Number(e.target.value) }));
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Config */}
        <Card>
          <CardHeader title="Configuration" subtitle="Training hyper-parameters" />
          <div className="grid grid-cols-2 gap-4 p-5">
            <div className="col-span-2">
              <Field label="Model architecture">
                <Select
                  value={cfg.model}
                  disabled={running}
                  onChange={(e) =>
                    setCfg((c) => ({ ...c, model: e.target.value }))
                  }
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Epochs">
              <Input
                type="number"
                min={1}
                value={cfg.epochs}
                disabled={running}
                onChange={num("epochs")}
              />
            </Field>
            <Field label="Batch size">
              <Input
                type="number"
                min={1}
                value={cfg.batch_size}
                disabled={running}
                onChange={num("batch_size")}
              />
            </Field>
            <Field label="Learning rate">
              <Input
                type="number"
                step="0.0001"
                value={cfg.learning_rate}
                disabled={running}
                onChange={num("learning_rate")}
              />
            </Field>
            <Field label="Grayscale -> RGB">
              <button
                type="button"
                disabled={running}
                onClick={() =>
                  setCfg((c) => ({
                    ...c,
                    convert_gray_to_rgb: !c.convert_gray_to_rgb,
                  }))
                }
                className={`flex h-9 w-14 items-center rounded-full px-1 transition-colors ${
                  cfg.convert_gray_to_rgb ? "bg-brand-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`h-7 w-7 rounded-full bg-white shadow transition-transform ${
                    cfg.convert_gray_to_rgb ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </Field>

            <div className="col-span-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Dataset split {split.training}/{split.validation}/{split.test}
              </span>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
                <div
                  className="bg-brand-600"
                  style={{ width: `${split.training}%` }}
                />
                <div
                  className="bg-brand-500/60"
                  style={{ width: `${split.validation}%` }}
                />
                <div
                  className="bg-slate-300"
                  style={{ width: `${split.test}%` }}
                />
              </div>
              <div className="mt-1.5 flex gap-4 text-[11px] text-slate-400">
                <span>Train</span>
                <span>Validation</span>
                <span>Test</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Live monitor */}
        <Card>
          <CardHeader
            title="Live monitor"
            subtitle="Streamed per epoch over WebSocket"
            right={
              <Badge
                tone={
                  state === "running"
                    ? "brand"
                    : state === "completed"
                      ? "success"
                      : state === "cancelled"
                        ? "warning"
                        : "neutral"
                }
              >
                {state}
              </Badge>
            }
          />
          <div className="space-y-4 p-5">
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="Epoch"
                value={
                  latest ? `${latest.epoch}/${latest.total_epochs}` : "--"
                }
              />
              <Stat label="Loss" value={latest?.loss?.toFixed(4) ?? "--"} />
              <Stat
                label="Accuracy"
                value={
                  latest?.accuracy != null
                    ? `${(latest.accuracy * 100).toFixed(1)}%`
                    : "--"
                }
              />
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ left: -20, top: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="epoch" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="loss"
                    stroke="#DC2626"
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="acc"
                    stroke="#16A34A"
                    dot={false}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-danger" /> loss
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success" /> accuracy
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Log */}
      <Card>
        <CardHeader title="Log" subtitle="Live training output" />
        <div
          ref={logBox}
          className="h-32 overflow-auto px-5 py-3 font-mono text-xs leading-relaxed text-slate-600 dark:text-slate-300"
        >
          {logs.length === 0 ? (
            <span className="text-slate-400">Waiting to start...</span>
          ) : (
            logs.map((l, i) => <div key={i}>{l}</div>)
          )}
        </div>
      </Card>

      {/* Sticky actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {running && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              {Math.round(progress * 100)}%
            </div>
          )}
          {running ? (
            <Button variant="danger" onClick={cancel}>
              <Square className="h-4 w-4" /> Cancel
            </Button>
          ) : (
            <Button onClick={start}>
              <Play className="h-4 w-4" /> Start training
            </Button>
          )}
          <Button variant="ghost" disabled={state !== "completed"}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
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
