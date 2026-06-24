import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CreateTaskPage } from "@/pages/CreateTaskPage";
import { CreateImagesPage } from "@/pages/CreateImagesPage";
import { LabelImagesPage } from "@/pages/LabelImagesPage";
import { TrainPage } from "@/pages/TrainPage";
import { VisualizePage } from "@/pages/VisualizePage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ExportPage } from "@/pages/ExportPage";
import { TestPage } from "@/pages/TestPage";
import { MonitorPage } from "@/pages/MonitorPage";
import type { TaskType, WorkflowStep } from "@/lib/types";

export default function App() {
  const navigate = useNavigate();
  // In the full app this comes from GET /tasks/{id}. Kept in local state here
  // so the scaffold runs without a live backend.
  const [current, setCurrent] = useState<WorkflowStep>("create_task");
  const [completed, setCompleted] = useState<WorkflowStep[]>([]);
  const [taskMode, setTaskMode] = useState<TaskType>("classification");
  // The created task (null until the user creates one). Returning to step 1
  // after this shows a read-only summary instead of a blank "create" form.
  const [task, setTask] = useState<{ name: string; type: TaskType } | null>(null);

  function handleCreated(name: string, type: TaskType) {
    setTask({ name, type });
    setTaskMode(type);
    setCompleted((c) => (c.includes("create_task") ? c : [...c, "create_task"]));
    setCurrent("create_images");
    navigate("/create_images");
  }

  function handleResetTask() {
    setTask(null);
    setCompleted([]);
    setCurrent("create_task");
    navigate("/create_task");
  }

  return (
    <AppShell current={current} completed={completed} taskMode={taskMode}>
      <Routes>
        <Route path="/" element={<Navigate to="/create_task" replace />} />
        <Route
          path="/create_task"
          element={
            <CreateTaskPage
              onEnter={() => setCurrent("create_task")}
              onCreated={handleCreated}
              task={task}
              onReset={handleResetTask}
              onContinue={() => navigate("/create_images")}
            />
          }
        />
        <Route
          path="/create_images"
          element={<CreateImagesPage onEnter={() => setCurrent("create_images")} />}
        />
        <Route
          path="/label_images"
          element={<LabelImagesPage onEnter={() => setCurrent("label_images")} />}
        />
        <Route
          path="/train"
          element={<TrainPage onEnter={() => setCurrent("train")} />}
        />
        <Route
          path="/visualize"
          element={<VisualizePage onEnter={() => setCurrent("visualize")} />}
        />
        <Route
          path="/register"
          element={<RegisterPage onEnter={() => setCurrent("register")} />}
        />
        <Route
          path="/export"
          element={<ExportPage onEnter={() => setCurrent("export")} />}
        />
        <Route
          path="/test"
          element={<TestPage onEnter={() => setCurrent("test")} />}
        />
        <Route
          path="/monitor"
          element={<MonitorPage onEnter={() => setCurrent("monitor")} />}
        />
      </Routes>
    </AppShell>
  );
}
