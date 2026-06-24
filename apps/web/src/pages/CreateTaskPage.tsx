import { useEffect, useState } from "react";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Pencil,
  RotateCcw,
  ScanSearch,
  Tags,
} from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { TaskType } from "@/lib/types";

const TASK_TYPES: {
  value: TaskType;
  label: string;
  desc: string;
  icon: typeof Tags;
  addsLabeling?: boolean;
}[] = [
  {
    value: "classification",
    label: "Classification",
    desc: "Assign each image to one of several classes.",
    icon: Tags,
  },
  {
    value: "object_detection",
    label: "Object Detection",
    desc: "Locate and label objects with bounding boxes.",
    icon: Boxes,
    addsLabeling: true,
  },
  {
    value: "anomaly_detection",
    label: "Anomaly Detection",
    desc: "Flag images that deviate from the normal.",
    icon: ScanSearch,
  },
];

const NAME_RE = /^[A-Za-z0-9_-]+$/;

export function CreateTaskPage({
  onEnter,
  onCreated,
  task,
  onReset,
  onContinue,
}: {
  onEnter?: () => void;
  onCreated?: (name: string, taskType: TaskType) => void;
  task?: { name: string; type: TaskType } | null;
  onReset?: () => void;
  onContinue?: () => void;
}) {
  useEffect(() => onEnter?.(), [onEnter]);

  const [name, setName] = useState("");
  const [type, setType] = useState<TaskType>("classification");
  const nameValid = NAME_RE.test(name);
  const showNameError = name.length > 0 && !nameValid;

  // A task already exists -> show a read-only summary, not a blank create form.
  // This removes the confusion of "Create Task" looking creatable after one is
  // already made.
  if (task) {
    const meta = TASK_TYPES.find((t) => t.value === task.type);
    const Icon = meta?.icon ?? Tags;
    return (
      <div className="mx-auto flex h-full max-w-3xl flex-col gap-6">
        <Card>
          <CardHeader
            title="Task"
            subtitle="This task is already created"
            right={<Badge tone="success">created</Badge>}
          />
          <div className="flex items-center gap-4 p-5">
            <span className="grid h-12 w-12 place-items-center rounded-control bg-brand-600 text-white">
              <Icon className="h-6 w-6" />
            </span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{task.name}</span>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <div className="text-sm text-slate-500">{meta?.label}</div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800">
            <Button variant="ghost" onClick={onReset}>
              <RotateCcw className="h-4 w-4" /> Start a new task
            </Button>
            <Button onClick={onContinue}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
        <p className="px-1 text-xs text-slate-400">
          <Pencil className="mr-1 inline h-3 w-3" />
          Changing the task type creates a new task. To re-run with the same
          data, just continue and adjust later steps.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader title="New task" subtitle="Name the task and pick its type" />
        <div className="space-y-6 p-5">
          <Field
            label="Task name"
            hint="Letters, numbers, _ and - only. Used as the workspace folder name."
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. classification_demo"
              aria-invalid={showNameError}
            />
          </Field>
          {showNameError && (
            <p className="-mt-3 text-xs text-danger">
              Only letters, numbers, underscore and hyphen are allowed.
            </p>
          )}

          <div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Task type
            </span>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {TASK_TYPES.map((t) => {
                const Icon = t.icon;
                const active = type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-card border p-4 text-left transition-colors",
                      active
                        ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600 dark:bg-slate-800"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-control",
                        active
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-700",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-semibold">{t.label}</span>
                    <span className="text-xs text-slate-500">{t.desc}</span>
                    {t.addsLabeling && (
                      <Badge tone="brand">+ Label Images step</Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end">
        <Button disabled={!nameValid} onClick={() => onCreated?.(name, type)}>
          Create task <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
