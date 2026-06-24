import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, PenLine, Tag } from "lucide-react";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";
import { cn } from "@/lib/cn";

// Object-detection labeling step. In the full app this launches labelme via
// POST /tasks/{id}/label and reads back the per-image annotation status.
const DEFAULT_CLASSES = ["defect", "scratch"];

export function LabelImagesPage({ onEnter }: { onEnter?: () => void }) {
  useEffect(() => onEnter?.(), [onEnter]);

  const [classes, setClasses] = useState<string[]>(DEFAULT_CLASSES);
  const [newClass, setNewClass] = useState("");

  // Synthetic image set with labeled/unlabeled status.
  const images = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        file: `${String(i).padStart(3, "0")}.jpg`,
        labeled: Math.abs(Math.sin((i + 1) * 5.3)) > 0.35,
        boxes: Math.floor(Math.abs(Math.sin((i + 1) * 3.1)) * 4),
      })),
    [],
  );
  const labeled = images.filter((i) => i.labeled).length;
  const progress = labeled / images.length;

  function addClass() {
    const c = newClass.trim();
    if (c && !classes.includes(c)) setClasses([...classes, c]);
    setNewClass("");
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.6fr]">
        {/* Left: classes + launch */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Labels" subtitle="Classes to annotate" />
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                {classes.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
                  >
                    <Tag className="h-3 w-3" />
                    {c}
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={newClass}
                  placeholder="add class…"
                  onChange={(e) => setNewClass(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addClass()}
                />
                <Button variant="ghost" onClick={addClass}>
                  Add
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Progress" />
            <div className="space-y-4 p-5">
              <div className="flex items-end justify-between">
                <span className="text-3xl font-semibold tabular-nums">
                  {labeled}
                  <span className="text-base text-slate-400">/{images.length}</span>
                </span>
                <Badge tone={progress === 1 ? "success" : "warning"}>
                  {Math.round(progress * 100)}%
                </Badge>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-brand-600 transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <Button className="w-full">
                <PenLine className="h-4 w-4" /> Open labeling tool
              </Button>
              <p className="text-[11px] text-slate-400">
                Launches labelme on the dataset; status refreshes on return.
              </p>
            </div>
          </Card>
        </div>

        {/* Right: image grid */}
        <Card className="flex flex-col">
          <CardHeader
            title="Dataset"
            subtitle={`${images.length} images`}
            right={
              <Badge tone="neutral">
                {images.length - labeled} unlabeled
              </Badge>
            }
          />
          <div className="grid max-h-[440px] grid-cols-3 gap-3 overflow-auto p-5 sm:grid-cols-4">
            {images.map((img) => (
              <div
                key={img.file}
                className={cn(
                  "rounded-control border p-2",
                  img.labeled
                    ? "border-success/40"
                    : "border-dashed border-slate-300 dark:border-slate-600",
                )}
              >
                <div className="relative mb-1.5 grid h-16 place-items-center rounded bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] text-slate-400 dark:from-slate-800 dark:to-slate-700">
                  {img.file}
                  {img.labeled && (
                    <span className="absolute right-1 top-1 rounded bg-success px-1 text-[9px] font-medium text-white">
                      {img.boxes} box
                    </span>
                  )}
                </div>
                <div className="text-center text-[11px]">
                  {img.labeled ? (
                    <span className="text-success">labeled</span>
                  ) : (
                    <span className="text-slate-400">unlabeled</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="ghost" disabled={progress < 1}>
          Next <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
