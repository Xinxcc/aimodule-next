"""Unified, validated data models.

ONE typed, sectioned, workspace-relative config (`task.json`) per task: a single
source of truth covering data source, images, split, training, export and test.

Design rules (see CONFIG.md):
  * One config per task -> `<task_root>/task.json`. No duplicate copies.
  * Sections map 1:1 to the workflow steps, so each step reads/writes only its
    own slice.
  * No absolute paths are ever persisted. Paths are stored relative to the task
    workspace and resolved at runtime by `workspace.py`.
  * Magic ints (TaskMode 0/1/2, ImagesExportFormat 0, CurrentState int) become
    typed enums. Stringly-typed values ("640x480", "[0,0]; [622,467]") become
    typed objects.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

SCHEMA_VERSION = 2


# --------------------------------------------------------------------------- #
# Enums (typed task types, formats and workflow steps)
# --------------------------------------------------------------------------- #
class TaskType(str, Enum):
    """Was the magic int `TaskMode` (0/1/2)."""

    classification = "classification"      # 0
    object_detection = "object_detection"  # 1
    anomaly_detection = "anomaly_detection"  # 2


class WorkflowStep(str, Enum):
    """The data-centric closed-loop workflow. (register/monitor added to turn the
    one-way pipeline into a loop: deploy -> monitor -> mine hard cases ->
    retrain.)"""

    create_task = "create_task"
    create_images = "create_images"
    label_images = "label_images"
    train = "train"
    visualize = "visualize"
    register = "register"   # model registry: version + lineage + metrics
    export = "export"
    test = "test"           # deploy / batch inference
    monitor = "monitor"     # drift monitoring + hard-example mining + retrain


# Object detection is the only mode that needs the labeling step.
WORKFLOW_ORDER: list[WorkflowStep] = [
    WorkflowStep.create_task,
    WorkflowStep.create_images,
    WorkflowStep.label_images,
    WorkflowStep.train,
    WorkflowStep.visualize,
    WorkflowStep.register,
    WorkflowStep.export,
    WorkflowStep.test,
    WorkflowStep.monitor,
]


class JobState(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class ImageFormat(str, Enum):
    """Was the magic int `ImagesExportFormat` (0)."""

    jpg = "jpg"
    png = "png"


class ExportFormat(str, Enum):
    onnx = "onnx"
    torchscript = "torchscript"


# --------------------------------------------------------------------------- #
# Shared typed value objects (sizes, crops, limits, augmentation)
# --------------------------------------------------------------------------- #
class Size(BaseModel):
    """Was the string "640x480"."""

    width: int = Field(640, ge=1)
    height: int = Field(480, ge=1)


class Crop(BaseModel):
    """Was the string "[0, 0]; [622, 467]"."""

    x: int = Field(0, ge=0)
    y: int = Field(0, ge=0)
    width: int = Field(..., ge=1)
    height: int = Field(..., ge=1)


# --------------------------------------------------------------------------- #
# Step 2a -- data source / CSV -> image preprocessing
# --------------------------------------------------------------------------- #
class Downsample(BaseModel):
    enabled: bool = False
    factor: int = Field(5, ge=1)
    random: bool = False


class Savgol(BaseModel):
    window_length: int = Field(200, ge=1)
    polyorder: int = Field(2, ge=0)


class Smoothing(BaseModel):
    enabled: bool = False
    savgol: Savgol = Field(default_factory=Savgol)
    median_kernel: int = Field(5, ge=1)
    gaussian_sigma: float = Field(5.0, ge=0)


class MovingWindow(BaseModel):
    enabled: bool = False
    offset: int = 1


class DataSourceConfig(BaseModel):
    """CSV -> image generation parameters: column selection, axis labels &
    limits, downsampling, smoothing (Savgol / median / Gaussian) and moving
    window."""

    input_dir: str = "input"  # relative to task root
    x_column: Optional[int] = None  # None -> use the row index as X
    y_columns: list[int] = Field(default_factory=lambda: [0])
    x_label: str = "X"
    y_label: str = "Y"
    x_limits: tuple[float, float] = (0.0, 100.0)
    y_limits: tuple[float, float] = (0.0, 100.0)
    dpi: int = Field(100, ge=1)
    downsample: Downsample = Field(default_factory=Downsample)
    smoothing: Smoothing = Field(default_factory=Smoothing)
    moving_window: MovingWindow = Field(default_factory=MovingWindow)


# --------------------------------------------------------------------------- #
# Step 2b -- image generation
# --------------------------------------------------------------------------- #
class ImageConfig(BaseModel):
    """Image generation parameters: size, crop, scale, grayscale, export format
    and number of images."""

    size: Size = Field(default_factory=Size)
    crop: Optional[Crop] = None
    scale: float = Field(1.0, gt=0)
    grayscale: bool = False
    export_format: ImageFormat = ImageFormat.jpg
    count: int = Field(100, ge=0)


# --------------------------------------------------------------------------- #
# Step 3 -- dataset split
# --------------------------------------------------------------------------- #
class DataSplit(BaseModel):
    training: int = Field(80, ge=0, le=100)
    validation: int = Field(10, ge=0, le=100)
    test: int = Field(10, ge=0, le=100)

    def normalized(self) -> "DataSplit":
        total = self.training + self.validation + self.test
        return self if total == 100 else self


# --------------------------------------------------------------------------- #
# Step 4 -- training (replaces config.yml entirely)
# --------------------------------------------------------------------------- #
class Augmentation(BaseModel):
    flip_up_down: bool = False
    flip_left_right: bool = False
    gaussian_blur: bool = False
    brightness: float = 0.0
    contrast: float = 0.0
    saturation: float = 0.0
    hue: float = 0.0
    sharpen: bool = False
    clahe: bool = False
    degrees: float = 0.0
    translate_x: float = 0.0
    translate_y: float = 0.0
    scale: float = 0.0
    shear_x: float = 0.0
    shear_y: float = 0.0


class Checkpoints(BaseModel):
    keep_n: int = Field(100, ge=1)
    save_best_only: bool = False


class ResumeFrom(BaseModel):
    timestamp: str
    epoch: int = Field(0, ge=0)


class TrainConfig(BaseModel):
    """Replaces config.yml (model_name, training_parameters, data_augmentation,
    ckpts) plus the stray `epochs` that also lived in c_config.json."""

    model: str = "efficientnet_v2"
    epochs: int = Field(50, ge=1, le=10_000)
    batch_size: int = Field(16, ge=1, le=4096)
    learning_rate: float = Field(1e-3, gt=0, le=1.0)
    device: str = "cuda:0"
    freeze: str = "stage3"
    convert_gray_to_rgb: bool = False
    resume: Optional[ResumeFrom] = None
    augmentation: Augmentation = Field(default_factory=Augmentation)
    checkpoints: Checkpoints = Field(default_factory=Checkpoints)


# --------------------------------------------------------------------------- #
# Step 6 -- export
# --------------------------------------------------------------------------- #
class ExportConfig(BaseModel):
    """Export parameters: checkpoint (relative under output/) + optional external script."""

    format: ExportFormat = ExportFormat.onnx
    # relative to task root, e.g. "output/2025-07-07_19-40-50/epoch_00050.pth"
    checkpoint: Optional[str] = None
    external_script: Optional[str] = None


# --------------------------------------------------------------------------- #
# Step 7 -- test / inference
# --------------------------------------------------------------------------- #
class RingBuffer(BaseModel):
    """Merges the two divergent ring_buffer_settings.json schemas."""

    max_files: int = Field(1000, ge=1)
    file_suffix: str = ".json"
    watch_suffixes: list[str] = Field(
        default_factory=lambda: [".png", ".jpg", ".jpeg", ".gif", ".csv"]
    )


class TestConfig(BaseModel):
    ring_buffer: RingBuffer = Field(default_factory=RingBuffer)


# --------------------------------------------------------------------------- #
# Workflow position (was the bare-int CurrentState)
# --------------------------------------------------------------------------- #
class WorkflowState(BaseModel):
    current_step: WorkflowStep = WorkflowStep.create_task
    completed_steps: list[WorkflowStep] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# THE task config -- the single source of truth, one file per task
# --------------------------------------------------------------------------- #
class TaskConfig(BaseModel):
    schema_version: int = SCHEMA_VERSION
    name: str = Field(..., min_length=1, pattern=r"^[A-Za-z0-9_\-]+$")
    task_type: TaskType = TaskType.classification

    workflow: WorkflowState = Field(default_factory=WorkflowState)
    data_source: DataSourceConfig = Field(default_factory=DataSourceConfig)
    images: ImageConfig = Field(default_factory=ImageConfig)
    split: DataSplit = Field(default_factory=DataSplit)
    train: TrainConfig = Field(default_factory=TrainConfig)
    export: ExportConfig = Field(default_factory=ExportConfig)
    test: TestConfig = Field(default_factory=TestConfig)

    # Learned at training time (class-id -> class-name).
    classes: dict[int, str] = Field(default_factory=dict)


# --------------------------------------------------------------------------- #
# API request / response shapes
# --------------------------------------------------------------------------- #
class TaskCreate(BaseModel):
    name: str = Field(..., min_length=1, pattern=r"^[A-Za-z0-9_\-]+$")
    task_type: TaskType = TaskType.classification


class Task(BaseModel):
    id: str
    config: TaskConfig

    @property
    def current_step(self) -> WorkflowStep:
        return self.config.workflow.current_step


class TrainRequest(BaseModel):
    config: Optional[TrainConfig] = None


class Job(BaseModel):
    id: str
    task_id: str
    kind: str = "train"
    state: JobState = JobState.queued
    epoch: int = 0
    total_epochs: int = 0
    loss: Optional[float] = None
    accuracy: Optional[float] = None
    progress: float = 0.0  # 0..1


class TrainEvent(BaseModel):
    """One frame on the WS /jobs/{id}/stream channel."""

    job_id: str
    state: JobState
    epoch: int
    total_epochs: int
    loss: Optional[float] = None
    accuracy: Optional[float] = None
    progress: float = 0.0
    log: Optional[str] = None


# --------------------------------------------------------------------------- #
# Inference (step 7 -- test / production prediction)
# --------------------------------------------------------------------------- #
class ClassScoreOut(BaseModel):
    class_id: int
    label: str
    score: float


class DetectionOut(BaseModel):
    class_id: int
    label: str
    score: float
    box: tuple[int, int, int, int]  # xmin, ymin, xmax, ymax


class PredictionOut(BaseModel):
    file: str
    task_type: TaskType
    ok: bool = True
    error: Optional[str] = None
    top_label: Optional[str] = None
    top_score: Optional[float] = None
    scores: list[ClassScoreOut] = Field(default_factory=list)
    detections: list[DetectionOut] = Field(default_factory=list)
    is_anomaly: Optional[bool] = None
    simulated: bool = False


class BatchRequest(BaseModel):
    """Batch over a local folder (absolute, or relative to the task root)."""

    folder: str


class BatchSummary(BaseModel):
    batch_id: str
    task_id: str
    state: JobState
    folder: str = ""  # resolved source folder (for hard-example retrieval)
    total: int = 0
    done: int = 0
    progress: float = 0.0
    simulated: bool = False
    # class label -> count (classification/detection) for a quick distribution view
    label_counts: dict[str, int] = Field(default_factory=dict)
    results: list[PredictionOut] = Field(default_factory=list)


class BatchEvent(BaseModel):
    """One frame on WS /predict/batches/{id}/stream."""

    batch_id: str
    state: JobState
    done: int
    total: int
    progress: float
    result: Optional[PredictionOut] = None


# --------------------------------------------------------------------------- #
# Model registry (step "register" -- versioning + lineage for exported models)
# --------------------------------------------------------------------------- #
class Lineage(BaseModel):
    """What this model version came from -- the reproducibility trail."""

    run_id: Optional[str] = None          # training run directory
    dataset_fingerprint: Optional[str] = None  # hash of the dataset used
    config_snapshot: Optional[dict] = None  # the task.json at train time
    train_summary: Optional[str] = None


class ModelVersion(BaseModel):
    id: str
    task_id: str
    version: int                          # monotonically increasing per task
    created_at: str
    model: str                            # architecture, e.g. efficientnet_v2
    format: ExportFormat = ExportFormat.onnx
    path: Optional[str] = None            # relative artifact path under task root
    size_bytes: int = 0
    metrics: dict[str, float] = Field(default_factory=dict)  # accuracy, loss...
    classes: dict[int, str] = Field(default_factory=dict)
    lineage: Lineage = Field(default_factory=Lineage)
    active: bool = False                  # the version currently deployed


class RegisterRequest(BaseModel):
    model: str = "efficientnet_v2"
    format: ExportFormat = ExportFormat.onnx
    metrics: dict[str, float] = Field(default_factory=dict)
    run_id: Optional[str] = None
    notes: Optional[str] = None


# --------------------------------------------------------------------------- #
# Monitoring (step "monitor" -- drift + hard-example mining -> retrain loop)
# --------------------------------------------------------------------------- #
class DistributionBin(BaseModel):
    label: str
    reference: float   # training-set proportion (0..1)
    live: float        # production proportion (0..1)


class HardExample(BaseModel):
    file: str
    predicted: Optional[str] = None
    confidence: float
    reason: str        # "low_confidence" | "anomaly" | "out_of_distribution"


class DriftReport(BaseModel):
    task_id: str
    samples: int = 0                # production predictions observed
    psi: float = 0.0                # population stability index
    drifted: bool = False           # psi over threshold
    avg_confidence: float = 0.0
    low_confidence_rate: float = 0.0
    distribution: list[DistributionBin] = Field(default_factory=list)
    hard_examples: list[HardExample] = Field(default_factory=list)


class IngestRequest(BaseModel):
    """Feed a finished deploy batch into monitoring."""

    batch_id: str
    low_confidence_threshold: float = 0.7


class RetrainRequest(BaseModel):
    """Promote selected hard examples into the training set and (optionally)
    kick off retraining -- closes the loop."""

    files: list[str]
    retrain: bool = True


class RetrainResponse(BaseModel):
    added: int
    training_dir: str
    job_id: Optional[str] = None
