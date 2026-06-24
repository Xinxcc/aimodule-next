import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, Package } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Select, Toggle } from "@/components/ui";

type Format = "onnx" | "torchscript";

// Synthetic checkpoint list (in the full app: read from output/<run>/*.pth).
const CHECKPOINTS = [
  "2025-07-07_19-40-50 · epoch_00050 (best)",
  "2025-07-07_19-40-50 · epoch_00040",
  "2025-07-07_19-40-50 · epoch_00030",
];

export function ExportPage({ onEnter }: { onEnter?: () => void }) {
  useEffect(() => onEnter?.(), [onEnter]);

  const [format, setFormat] = useState<Format>("onnx");
  const [checkpoint, setCheckpoint] = useState(CHECKPOINTS[0]);
  const [quantize, setQuantize] = useState(false);
  const [state, setState] = useState<"idle" | "exporting" | "done">("idle");

  function exportModel() {
    setState("exporting");
    window.setTimeout(() => setState("done"), 1400);
  }

  const ext = format === "onnx" ? ".onnx" : ".pt";
  const size = quantize ? "11.4 MB" : "43.8 MB";
  const fileName = `2025-07-07_19-40-50_efficientnet_v2${quantize ? "_int8" : ""}${ext}`;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Config */}
        <Card>
          <CardHeader title="Export options" subtitle="Produce a deployable model" />
          <div className="space-y-4 p-5">
            <Field label="Format">
              <Select
                value={format}
                disabled={state === "exporting"}
                onChange={(e) => setFormat(e.target.value as Format)}
              >
                <option value="onnx">ONNX (.onnx)</option>
                <option value="torchscript">TorchScript (.pt)</option>
              </Select>
            </Field>
            <Field label="Checkpoint">
              <Select
                value={checkpoint}
                disabled={state === "exporting"}
                onChange={(e) => setCheckpoint(e.target.value)}
              >
                {CHECKPOINTS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                <div className="text-sm font-medium">INT8 quantization</div>
                <div className="text-[11px] text-slate-400">
                  Smaller & faster for edge devices.
                </div>
              </div>
              <Toggle
                checked={quantize}
                onChange={setQuantize}
                disabled={state === "exporting"}
              />
            </div>
          </div>
        </Card>

        {/* Summary + result */}
        <Card className="flex flex-col">
          <CardHeader title="Model" subtitle="Summary & artifact" />
          <div className="flex-1 space-y-3 p-5 text-sm">
            <Row label="Task" value="Classification" />
            <Row label="Architecture" value="efficientnet_v2" />
            <Row label="Classes" value="Chrom, Black" />
            <Row label="Input size" value="640 × 480" />
            <Row label="Est. size" value={size} />

            {state === "done" && (
              <div className="mt-2 flex items-center gap-3 rounded-control border border-success/30 bg-green-50 p-3 dark:bg-green-950/30">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-success">Exported</div>
                  <div className="truncate font-mono text-[11px] text-slate-500">
                    export/{fileName}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 p-4 dark:border-slate-800">
            {state === "done" ? (
              <Badge tone="success">done · export/{fileName}</Badge>
            ) : (
              <Button
                className="w-full"
                disabled={state === "exporting"}
                onClick={exportModel}
              >
                {state === "exporting" ? (
                  <>
                    <Package className="h-4 w-4 animate-pulse" /> Exporting…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" /> Export model
                  </>
                )}
              </Button>
            )}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="ghost" disabled={state !== "done"}>
          Continue to Test
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
