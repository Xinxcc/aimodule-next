"""Import a flat key/value config (+ optional training YAML) into the sectioned
TaskConfig.

Absolute paths are dropped (paths are derived by workspace.py), stringly-typed
values are parsed into typed objects, and integer codes are mapped to enums.

Use via POST /tasks/import to bring an externally produced flat config into the app.
"""
from __future__ import annotations

import re
from typing import Any

from .schemas import (
    Crop,
    DataSourceConfig,
    DataSplit,
    Downsample,
    ExportConfig,
    ImageConfig,
    ImageFormat,
    MovingWindow,
    Savgol,
    Size,
    Smoothing,
    TaskConfig,
    TaskType,
    TrainConfig,
    WorkflowState,
    WorkflowStep,
)

_TASK_MODE = {
    0: TaskType.classification,
    1: TaskType.object_detection,
    2: TaskType.anomaly_detection,
}

_STATE_TO_STEP = {
    0: WorkflowStep.create_task,
    1: WorkflowStep.create_images,
    2: WorkflowStep.label_images,
    3: WorkflowStep.train,
    4: WorkflowStep.visualize,
    5: WorkflowStep.export,
    6: WorkflowStep.test,
}


def _parse_size(value: Any, default: Size) -> Size:
    # "640x480" -> Size(640, 480)
    if isinstance(value, str) and re.fullmatch(r"\d+x\d+", value.strip()):
        w, h = value.split("x")
        return Size(width=int(w), height=int(h))
    return default


def _parse_crop(value: Any) -> Crop | None:
    # "[0, 0]; [622, 467]" -> Crop(x=0, y=0, width=622, height=467)
    if not isinstance(value, str) or not value.strip():
        return None
    nums = [int(n) for n in re.findall(r"-?\d+", value)]
    if len(nums) == 4:
        x, y, x2, y2 = nums
        w, h = abs(x2 - x), abs(y2 - y)
        if w > 0 and h > 0:
            return Crop(x=min(x, x2), y=min(y, y2), width=w, height=h)
    return None


def _parse_scale(value: Any) -> float:
    try:
        s = float(value)
        return s if s > 0 else 1.0
    except (TypeError, ValueError):
        return 1.0


def _basename(path: Any) -> str | None:
    # A flat config may store an absolute checkpoint path; keep only the file
    # name and let workspace.resolve() re-anchor it under output/ later.
    if isinstance(path, str) and path:
        return re.split(r"[\\/]", path)[-1]
    return None


def import_flat_config(flat: dict[str, Any], yaml_cfg: dict[str, Any] | None = None) -> TaskConfig:
    """Map a flat dict (+ optional parsed training-YAML dict) onto TaskConfig."""
    yaml_cfg = yaml_cfg or {}
    tp = yaml_cfg.get("training_parameters", {})

    task_type = _TASK_MODE.get(int(flat.get("TaskMode", 0)), TaskType.classification)
    current_step = _STATE_TO_STEP.get(
        int(flat.get("CurrentState", 0)), WorkflowStep.create_task
    )

    data_source = DataSourceConfig(
        x_column=None if flat.get("XColumnID", -1) in (-1, None) else int(flat["XColumnID"]),
        y_columns=list(flat.get("YColumnID", [0])) or [0],
        x_label=str(flat.get("XLabel", "X")),
        y_label=str(flat.get("YLabel", "Y")),
        x_limits=(float(flat.get("XlimStart", 0)), float(flat.get("XlimEnd", 100))),
        y_limits=(float(flat.get("YlimStart", 0)), float(flat.get("YlimEnd", 100))),
        dpi=int(flat.get("DPI", 100)),
        downsample=Downsample(
            enabled=bool(flat.get("Downsample", False)),
            factor=int(flat.get("DownsampleFactor", 5)),
            random=bool(flat.get("DownsampleRandom", False)),
        ),
        smoothing=Smoothing(
            enabled=bool(flat.get("SmoothData", False)),
            savgol=Savgol(
                window_length=int(flat.get("SavgolWindowLength", 200)),
                polyorder=int(flat.get("SavgolPolyorder", 2)),
            ),
            median_kernel=int(flat.get("MedianFilterKernelSize", 5)),
            gaussian_sigma=float(flat.get("GaussianSigma", 5)),
        ),
        moving_window=MovingWindow(
            enabled=bool(flat.get("MovingWindow", False)),
            offset=int(flat.get("MovingWindowOffset", 1)),
        ),
    )

    images = ImageConfig(
        size=_parse_size(flat.get("ImageSize"), Size()),
        crop=_parse_crop(flat.get("ImageCrop")),
        scale=_parse_scale(flat.get("ImageScale")),
        grayscale=bool(flat.get("UseForGrayscale", False)),
        export_format=ImageFormat.jpg if int(flat.get("ImagesExportFormat", 0)) == 0 else ImageFormat.png,
        count=int(flat.get("NumberOfImages", 100)),
    )

    train = TrainConfig(
        model=str(yaml_cfg.get("model_name", "efficientnet_v2")),
        epochs=int(tp.get("epochs", flat.get("epochs", 50))),
        batch_size=int(tp.get("batch_size", 16)),
        learning_rate=float(tp.get("lr", 0.001)),
        device=str(tp.get("device", "cuda:0")),
        freeze=str(tp.get("freeze", "stage3")),
    )

    # ClassMapping uses string keys ("0","1"); normalize to int keys.
    classes = {int(k): str(v) for k, v in (flat.get("ClassMapping") or {}).items()}

    ckpt = _basename(flat.get("Checkpoint"))

    return TaskConfig(
        name=str(flat.get("TaskName", "imported_task")),
        task_type=task_type,
        workflow=WorkflowState(current_step=current_step),
        data_source=data_source,
        images=images,
        split=DataSplit(
            training=int(flat.get("SplitTraining", 80)),
            validation=int(flat.get("SplitValidation", 10)),
            test=int(flat.get("SplitTest", 10)),
        ),
        train=train,
        export=ExportConfig(
            checkpoint=f"output/{ckpt}" if ckpt else None,
            external_script=flat.get("ExternalScript") or None,
        ),
        classes=classes,
    )
