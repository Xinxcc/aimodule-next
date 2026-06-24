// Mirror of services/backend/app/schemas.py

export type TaskType =
  | "classification"
  | "object_detection"
  | "anomaly_detection";

export type WorkflowStep =
  | "create_task"
  | "create_images"
  | "label_images"
  | "train"
  | "visualize"
  | "register"
  | "export"
  | "test"
  | "monitor";

export type JobState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TrainConfig {
  model: string;
  epochs: number;
  batch_size: number;
  learning_rate: number;
  convert_gray_to_rgb: boolean;
}

// Mirror of schemas.py DataSourceConfig (step "create_images" — CSV→image).
export interface DataSourceConfig {
  input_dir: string;
  x_column: number | null;
  y_columns: number[];
  x_label: string;
  y_label: string;
  x_limits: [number, number];
  y_limits: [number, number];
  dpi: number;
  downsample: { enabled: boolean; factor: number; random: boolean };
  smoothing: {
    enabled: boolean;
    savgol: { window_length: number; polyorder: number };
    median_kernel: number;
    gaussian_sigma: number;
  };
  moving_window: { enabled: boolean; offset: number };
}

export type ImageFormat = "jpg" | "png";

// Mirror of schemas.py ImageConfig (step "create_images" — image generation).
export interface ImageConfig {
  size: { width: number; height: number };
  crop: { x: number; y: number; width: number; height: number } | null;
  scale: number;
  grayscale: boolean;
  export_format: ImageFormat;
  count: number;
}

// Sections that can be PATCHed individually.
export type ConfigSection =
  | "data_source"
  | "images"
  | "split"
  | "train"
  | "export"
  | "test";

export interface TrainEvent {
  job_id: string;
  state: JobState;
  epoch: number;
  total_epochs: number;
  loss: number | null;
  accuracy: number | null;
  progress: number; // 0..1
  log: string | null;
}

export interface Job {
  id: string;
  task_id: string;
  kind: string;
  state: JobState;
  epoch: number;
  total_epochs: number;
  loss: number | null;
  accuracy: number | null;
  progress: number;
}

// Inference (mirror of schemas.py PredictionOut / BatchSummary / BatchEvent).
export interface ClassScoreOut {
  class_id: number;
  label: string;
  score: number;
}

export interface DetectionOut {
  class_id: number;
  label: string;
  score: number;
  box: [number, number, number, number];
}

export interface PredictionOut {
  file: string;
  task_type: TaskType;
  ok: boolean;
  error: string | null;
  top_label: string | null;
  top_score: number | null;
  scores: ClassScoreOut[];
  detections: DetectionOut[];
  is_anomaly: boolean | null;
  simulated: boolean;
}

export interface BatchSummary {
  batch_id: string;
  task_id: string;
  state: JobState;
  total: number;
  done: number;
  progress: number;
  simulated: boolean;
  label_counts: Record<string, number>;
  results: PredictionOut[];
}

export interface BatchEvent {
  batch_id: string;
  state: JobState;
  done: number;
  total: number;
  progress: number;
  result: PredictionOut | null;
}

export const STEP_META: Record<WorkflowStep, { label: string; index: number }> =
  {
    create_task: { label: "Create Task", index: 1 },
    create_images: { label: "Create Images", index: 2 },
    label_images: { label: "Label Images", index: 3 },
    train: { label: "Train Model", index: 4 },
    visualize: { label: "Visualize", index: 5 },
    register: { label: "Register", index: 6 },
    export: { label: "Export", index: 7 },
    test: { label: "Deploy & Test", index: 8 },
    monitor: { label: "Monitor", index: 9 },
  };

// Inference / registry / monitoring DTOs used by the loop pages.
export interface ModelVersion {
  id: string;
  task_id: string;
  version: number;
  created_at: string;
  model: string;
  format: "onnx" | "torchscript";
  path: string | null;
  size_bytes: number;
  metrics: Record<string, number>;
  classes: Record<number, string>;
  lineage: {
    run_id: string | null;
    dataset_fingerprint: string | null;
    train_summary: string | null;
  };
  active: boolean;
}

export interface DistributionBin {
  label: string;
  reference: number;
  live: number;
}

export interface HardExample {
  file: string;
  predicted: string | null;
  confidence: number;
  reason: string;
}

export interface DriftReport {
  task_id: string;
  samples: number;
  psi: number;
  drifted: boolean;
  avg_confidence: number;
  low_confidence_rate: number;
  distribution: DistributionBin[];
  hard_examples: HardExample[];
}
