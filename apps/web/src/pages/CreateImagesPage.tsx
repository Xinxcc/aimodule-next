import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FolderOpen, ImageDown, Save } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Toggle,
} from "@/components/ui";
import type { DataSourceConfig, ImageConfig } from "@/lib/types";

// Folders that commonly hold the raw input, relative to the task root.
const FOLDER_PRESETS = ["input", "raw_csv", "imported", "data"];

const DEFAULT_SOURCE: DataSourceConfig = {
  input_dir: "input",
  x_column: null,
  y_columns: [0],
  x_label: "Time",
  y_label: "Value",
  x_limits: [0, 100],
  y_limits: [0, 100],
  dpi: 100,
  downsample: { enabled: true, factor: 5, random: true },
  smoothing: {
    enabled: true,
    savgol: { window_length: 200, polyorder: 2 },
    median_kernel: 5,
    gaussian_sigma: 5,
  },
  moving_window: { enabled: false, offset: 1 },
};

const DEFAULT_IMAGE: ImageConfig = {
  size: { width: 640, height: 480 },
  crop: null,
  scale: 1,
  grayscale: false,
  export_format: "jpg",
  count: 100,
};

function signal(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 6;
    const noise = Math.sin(i * 12.9898) * 43758.5453;
    out.push(Math.sin(t) * 0.6 + (noise - Math.floor(noise) - 0.5) * 0.5);
  }
  return out;
}
function movingAvg(data: number[], win: number): number[] {
  if (win <= 1) return data;
  return data.map((_, i) => {
    const s = data.slice(Math.max(0, i - win), i + 1);
    return s.reduce((a, v) => a + v, 0) / s.length;
  });
}

export function CreateImagesPage({ onEnter }: { onEnter?: () => void }) {
  useEffect(() => onEnter?.(), [onEnter]);

  const [src, setSrc] = useState<DataSourceConfig>(DEFAULT_SOURCE);
  const [img, setImg] = useState<ImageConfig>(DEFAULT_IMAGE);
  const [dirty, setDirty] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);

  function patchSrc(p: Partial<DataSourceConfig>) {
    setSrc((s) => ({ ...s, ...p }));
    setDirty(true);
  }
  function patchImg(p: Partial<ImageConfig>) {
    setImg((s) => ({ ...s, ...p }));
    setDirty(true);
  }

  // Native folder browse (offline desktop / Chromium). Falls back to the
  // dropdown presets when unsupported.
  function onBrowse(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const rel = (file as unknown as { webkitRelativePath?: string })
      ?.webkitRelativePath;
    if (rel) patchSrc({ input_dir: rel.split("/")[0] });
  }

  const raw = useMemo(() => signal(220), []);
  const processed = useMemo(() => {
    let d = raw;
    if (src.downsample.enabled)
      d = d.filter((_, i) => i % Math.max(1, src.downsample.factor) === 0);
    if (src.smoothing.enabled)
      d = movingAvg(d, Math.max(2, Math.round(src.smoothing.gaussian_sigma)));
    return d;
  }, [raw, src.downsample, src.smoothing]);

  const folderOptions = FOLDER_PRESETS.includes(src.input_dir)
    ? FOLDER_PRESETS
    : [src.input_dir, ...FOLDER_PRESETS];

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6">
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left: parameters, cleanly grouped */}
        <div className="space-y-6">
          {/* 1. Source */}
          <Card>
            <CardHeader title="1 · Source" subtitle="Where the raw data is" />
            <div className="grid grid-cols-2 gap-4 p-5">
              <div className="col-span-2">
                <Field label="Input folder" hint="relative to the task workspace">
                  <div className="flex gap-2">
                    <Select
                      className="flex-1"
                      value={src.input_dir}
                      onChange={(e) => patchSrc({ input_dir: e.target.value })}
                    >
                      {folderOptions.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      onClick={() => folderInput.current?.click()}
                    >
                      <FolderOpen className="h-4 w-4" /> Browse
                    </Button>
                    <input
                      ref={folderInput}
                      type="file"
                      // @ts-expect-error non-standard but supported in Chromium/WebView2
                      webkitdirectory=""
                      directory=""
                      hidden
                      onChange={onBrowse}
                    />
                  </div>
                </Field>
              </div>
              <Field label="X column" hint="empty = use row index">
                <Input
                  type="number"
                  placeholder="index"
                  value={src.x_column ?? ""}
                  onChange={(e) =>
                    patchSrc({
                      x_column: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Y column(s)" hint="comma-separated">
                <Input
                  value={src.y_columns.join(", ")}
                  onChange={(e) =>
                    patchSrc({
                      y_columns: e.target.value
                        .split(",")
                        .map((s) => Number(s.trim()))
                        .filter((n) => !Number.isNaN(n)),
                    })
                  }
                />
              </Field>
            </div>
          </Card>

          {/* 2. Signal processing */}
          <Card>
            <CardHeader
              title="2 · Signal processing"
              subtitle="Applied before rendering"
            />
            <div className="divide-y divide-slate-100 p-5 dark:divide-slate-800">
              <ToggleSection
                label="Downsample"
                checked={src.downsample.enabled}
                onChange={(v) =>
                  patchSrc({ downsample: { ...src.downsample, enabled: v } })
                }
              >
                <Field label="Factor">
                  <Input
                    type="number"
                    min={1}
                    value={src.downsample.factor}
                    onChange={(e) =>
                      patchSrc({
                        downsample: {
                          ...src.downsample,
                          factor: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
                <div className="flex items-end justify-between pb-1">
                  <span className="text-xs text-slate-500">Random sampling</span>
                  <Toggle
                    checked={src.downsample.random}
                    onChange={(v) =>
                      patchSrc({ downsample: { ...src.downsample, random: v } })
                    }
                  />
                </div>
              </ToggleSection>

              <ToggleSection
                label="Smoothing"
                checked={src.smoothing.enabled}
                onChange={(v) =>
                  patchSrc({ smoothing: { ...src.smoothing, enabled: v } })
                }
              >
                <Field label="Savgol window">
                  <Input
                    type="number"
                    min={1}
                    value={src.smoothing.savgol.window_length}
                    onChange={(e) =>
                      patchSrc({
                        smoothing: {
                          ...src.smoothing,
                          savgol: {
                            ...src.smoothing.savgol,
                            window_length: Number(e.target.value),
                          },
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Gaussian σ">
                  <Input
                    type="number"
                    min={0}
                    value={src.smoothing.gaussian_sigma}
                    onChange={(e) =>
                      patchSrc({
                        smoothing: {
                          ...src.smoothing,
                          gaussian_sigma: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
              </ToggleSection>

              <ToggleSection
                label="Moving window"
                checked={src.moving_window.enabled}
                onChange={(v) =>
                  patchSrc({ moving_window: { ...src.moving_window, enabled: v } })
                }
              >
                <Field label="Offset">
                  <Input
                    type="number"
                    value={src.moving_window.offset}
                    onChange={(e) =>
                      patchSrc({
                        moving_window: {
                          ...src.moving_window,
                          offset: Number(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
              </ToggleSection>
            </div>
          </Card>

          {/* 3. Output image */}
          <Card>
            <CardHeader title="3 · Output image" subtitle="Generated image properties" />
            <div className="grid grid-cols-2 gap-4 p-5">
              <Field label="Width">
                <Input
                  type="number"
                  value={img.size.width}
                  onChange={(e) =>
                    patchImg({ size: { ...img.size, width: Number(e.target.value) } })
                  }
                />
              </Field>
              <Field label="Height">
                <Input
                  type="number"
                  value={img.size.height}
                  onChange={(e) =>
                    patchImg({ size: { ...img.size, height: Number(e.target.value) } })
                  }
                />
              </Field>
              <Field label="Scale">
                <Input
                  type="number"
                  step="0.1"
                  value={img.scale}
                  onChange={(e) => patchImg({ scale: Number(e.target.value) })}
                />
              </Field>
              <Field label="Format">
                <Select
                  value={img.export_format}
                  onChange={(e) =>
                    patchImg({
                      export_format: e.target.value as ImageConfig["export_format"],
                    })
                  }
                >
                  <option value="jpg">jpg</option>
                  <option value="png">png</option>
                </Select>
              </Field>
              <Field label="Image count">
                <Input
                  type="number"
                  value={img.count}
                  onChange={(e) => patchImg({ count: Number(e.target.value) })}
                />
              </Field>
              <div className="flex items-end justify-between pb-1">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Grayscale
                </span>
                <Toggle
                  checked={img.grayscale}
                  onChange={(v) => patchImg({ grayscale: v })}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Right: live preview */}
        <Card className="flex h-fit flex-col lg:sticky lg:top-0">
          <CardHeader
            title="Preview"
            subtitle={`${img.size.width}×${img.size.height} · ${processed.length} pts`}
            right={dirty ? <Badge tone="warning">unsaved</Badge> : undefined}
          />
          <div className="flex flex-1 items-center justify-center p-6">
            <div
              className="w-full overflow-hidden rounded-control border border-slate-200 bg-white shadow-sm dark:border-slate-700"
              style={{
                aspectRatio: `${img.size.width} / ${img.size.height}`,
                filter: img.grayscale ? "grayscale(1)" : undefined,
                maxHeight: 360,
              }}
            >
              <PlotPreview data={processed} xLabel={src.x_label} yLabel={src.y_label} />
            </div>
          </div>
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 dark:border-slate-800">
            Reflects downsample / smoothing. Real images render server-side via{" "}
            <code>core.resize_crop_scale</code>.
          </div>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="ghost">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => setDirty(false)}>
            <Save className="h-4 w-4" /> Save config
          </Button>
          <Button onClick={() => setDirty(false)}>
            <ImageDown className="h-4 w-4" /> Generate images
          </Button>
          <Button variant="ghost">
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToggleSection({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Toggle checked={checked} onChange={onChange} />
      </div>
      {checked && <div className="mt-3 grid grid-cols-2 gap-4">{children}</div>}
    </div>
  );
}

function PlotPreview({
  data,
  xLabel,
  yLabel,
}: {
  data: number[];
  xLabel: string;
  yLabel: string;
}) {
  const W = 400;
  const H = 300;
  const pad = 28;
  const max = Math.max(...data.map(Math.abs), 1);
  const pts = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (W - 2 * pad);
      const y = H / 2 - (v / max) * (H / 2 - pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#cbd5e1" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#cbd5e1" />
      <polyline points={pts} fill="none" stroke="#4F46E5" strokeWidth={1.5} />
      <text x={W / 2} y={H - 6} fontSize={10} fill="#94a3b8" textAnchor="middle">
        {xLabel}
      </text>
      <text
        x={10}
        y={H / 2}
        fontSize={10}
        fill="#94a3b8"
        textAnchor="middle"
        transform={`rotate(-90 10 ${H / 2})`}
      >
        {yLabel}
      </text>
    </svg>
  );
}
