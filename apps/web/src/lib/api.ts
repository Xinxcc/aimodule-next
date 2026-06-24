// Thin client for the FastAPI backend. The base URL points at the loopback
// sidecar; in dev it is the same host that uvicorn binds to.
import type {
  BatchEvent,
  BatchSummary,
  ConfigSection,
  DriftReport,
  Job,
  ModelVersion,
  PredictionOut,
  TaskType,
  TrainConfig,
  TrainEvent,
} from "./types";

export interface TaskDTO {
  id: string;
  config: { name: string; task_type: TaskType };
}

const BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8756";
const WS_BASE = BASE.replace(/^http/, "ws");

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  async createTask(name: string, taskType: TaskType): Promise<TaskDTO> {
    const res = await fetch(`${BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, task_type: taskType }),
    });
    return json<TaskDTO>(res);
  },

  // Update one config section (one workflow step's slice). The whole document
  // is re-validated server-side; a 422 carries the field errors.
  async patchSection<T>(
    taskId: string,
    section: ConfigSection,
    data: T,
  ): Promise<void> {
    const res = await fetch(`${BASE}/tasks/${taskId}/config/${section}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  },

  async startTraining(taskId: string, config: TrainConfig): Promise<Job> {
    const res = await fetch(`${BASE}/tasks/${taskId}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
    return json<Job>(res);
  },

  async cancelJob(jobId: string): Promise<Job> {
    const res = await fetch(`${BASE}/jobs/${jobId}/cancel`, { method: "POST" });
    return json<Job>(res);
  },

  // --- inference ---
  async predictOne(taskId: string, file: File): Promise<PredictionOut> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/tasks/${taskId}/predict`, {
      method: "POST",
      body: form,
    });
    return json<PredictionOut>(res);
  },

  async startBatch(taskId: string, folder: string): Promise<BatchSummary> {
    const res = await fetch(`${BASE}/tasks/${taskId}/predict/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder }),
    });
    return json<BatchSummary>(res);
  },

  // Live batch stream. Returns an unsubscribe fn.
  streamBatch(
    batchId: string,
    onEvent: (e: BatchEvent) => void,
    onClose?: () => void,
  ): () => void {
    const ws = new WebSocket(`${WS_BASE}/predict/batches/${batchId}/stream`);
    ws.onmessage = (msg) => onEvent(JSON.parse(msg.data) as BatchEvent);
    ws.onclose = () => onClose?.();
    return () => ws.close();
  },

  // --- model registry ---
  async listModels(taskId: string): Promise<ModelVersion[]> {
    return json<ModelVersion[]>(await fetch(`${BASE}/tasks/${taskId}/models`));
  },
  async registerModel(
    taskId: string,
    body: { model: string; metrics: Record<string, number>; run_id?: string },
  ): Promise<ModelVersion> {
    const res = await fetch(`${BASE}/tasks/${taskId}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return json<ModelVersion>(res);
  },
  async promoteModel(taskId: string, versionId: string): Promise<ModelVersion> {
    const res = await fetch(
      `${BASE}/tasks/${taskId}/models/${versionId}/promote`,
      { method: "POST" },
    );
    return json<ModelVersion>(res);
  },

  // --- monitoring / retrain loop ---
  async getMonitoring(taskId: string): Promise<DriftReport> {
    return json<DriftReport>(await fetch(`${BASE}/tasks/${taskId}/monitoring`));
  },
  async ingestMonitoring(taskId: string, batchId: string): Promise<DriftReport> {
    const res = await fetch(`${BASE}/tasks/${taskId}/monitoring/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    });
    return json<DriftReport>(res);
  },
  async retrain(
    taskId: string,
    files: string[],
    retrain = true,
  ): Promise<{ added: number; training_dir: string; job_id: string | null }> {
    const res = await fetch(`${BASE}/tasks/${taskId}/monitoring/retrain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files, retrain }),
    });
    return json(res);
  },

  // Live training stream. Returns an unsubscribe fn.
  streamJob(
    jobId: string,
    onEvent: (e: TrainEvent) => void,
    onClose?: () => void,
  ): () => void {
    const ws = new WebSocket(`${WS_BASE}/jobs/${jobId}/stream`);
    ws.onmessage = (msg) => onEvent(JSON.parse(msg.data) as TrainEvent);
    ws.onclose = () => onClose?.();
    return () => ws.close();
  },
};
