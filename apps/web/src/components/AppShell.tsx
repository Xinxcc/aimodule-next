import { NavLink } from "react-router-dom";
import {
  Check,
  Circle,
  Minus,
  Lock,
  Cpu,
  Moon,
  Sun,
  Settings,
} from "lucide-react";
import { useState } from "react";
import { STEP_META, type WorkflowStep } from "@/lib/types";
import { cn } from "@/lib/cn";

// Object detection is the only mode that includes label_images.
const ALL_STEPS: WorkflowStep[] = [
  "create_task",
  "create_images",
  "label_images",
  "train",
  "visualize",
  "register",
  "export",
  "test",
  "monitor",
];

type StepStatus = "done" | "current" | "skipped" | "locked" | "available";

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done")
    return <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />;
  if (status === "current")
    return <Circle className="h-3.5 w-3.5 fill-brand-600 text-brand-600" />;
  if (status === "skipped") return <Minus className="h-3.5 w-3.5 text-slate-300" />;
  if (status === "locked") return <Lock className="h-3 w-3 text-slate-300" />;
  return <Circle className="h-3.5 w-3.5 text-slate-300" />;
}

export function AppShell({
  current,
  completed,
  taskMode,
  children,
}: {
  current: WorkflowStep;
  completed: WorkflowStep[];
  taskMode: "object_detection" | "classification" | "anomaly_detection";
  children: React.ReactNode;
}) {
  const [dark, setDark] = useState(false);
  const order = ALL_STEPS.filter(
    (s) => s !== "label_images" || taskMode === "object_detection",
  );
  const currentIdx = order.indexOf(current);

  function statusOf(step: WorkflowStep): StepStatus {
    if (step === "label_images" && taskMode !== "object_detection")
      return "skipped";
    if (completed.includes(step)) return "done";
    if (step === current) return "current";
    return order.indexOf(step) <= currentIdx + 1 ? "available" : "locked";
  }

  return (
    <div className={cn(dark && "dark")}>
      <div className="flex h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {/* Left step rail */}
        <aside className="flex w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 px-5 py-5">
            <div className="grid h-8 w-8 place-items-center rounded-control bg-brand-600 text-sm font-bold text-white">
              AI
            </div>
            <span className="text-sm font-semibold">AIModule</span>
          </div>

          <nav className="flex-1 space-y-1 px-3">
            {ALL_STEPS.map((step) => {
              const status = statusOf(step);
              const locked = status === "locked" || status === "skipped";
              return (
                <NavLink
                  key={step}
                  to={`/${step}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-control px-3 py-2 text-sm",
                      locked && "pointer-events-none opacity-50",
                      isActive
                        ? "bg-brand-50 font-medium text-brand-700 dark:bg-slate-800 dark:text-brand-500"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                    )
                  }
                >
                  <span className="grid h-5 w-5 place-items-center">
                    <StepIcon status={status} />
                  </span>
                  <span className="tabular-nums text-slate-400">
                    {STEP_META[step].index}
                  </span>
                  {STEP_META[step].label}
                </NavLink>
              );
            })}
          </nav>

          {/* Persistent GPU / status footer */}
          <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Cpu className="h-3.5 w-3.5" />
              GPU
              <span className="ml-auto font-medium text-slate-700 dark:text-slate-200">
                73%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full w-[73%] rounded-full bg-brand-600" />
            </div>
          </div>
        </aside>

        {/* Right content area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 items-center justify-between border-b border-slate-200 px-8 dark:border-slate-800">
            <h1 className="text-base font-semibold">{STEP_META[current].label}</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDark((d) => !d)}
                className="grid h-8 w-8 place-items-center rounded-control text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Toggle theme"
              >
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                className="grid h-8 w-8 place-items-center rounded-control text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-auto p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
