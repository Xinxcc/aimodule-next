"""Canonical task workspace layout + path resolution.

This is the ONLY place that turns a task root into concrete paths. Persisted
config (`task.json`) stores nothing machine-absolute -- only the tasks root
(an app setting) and per-task relative references. Everything else is derived
here, so a task folder can be moved or backed up and still resolve correctly.

Layout:

    <tasks_root>/<task_name>/
    +- task.json                 the single config (sectioned)
    +- input/                    raw CSV / source data
    +- dataset/
    |   +- 00_training/
    |   +- 01_validation/
    |   +- 02_test/
    +- image_output/             preprocessed images (temp)
    +- output/<run_id>/          training runs (checkpoints + config snapshot)
    +- export/                   exported models (onnx / torchscript)
    +- test/                     test runs + result json
"""
from __future__ import annotations

import os
from pathlib import Path

# App-level setting (not per-task). Resolved from env or a default; never stored
# inside task.json.
TASKS_ROOT = Path(
    os.environ.get("AIMODULE_TASKS_ROOT", str(Path.home() / "AIModule" / "Tasks"))
)

CONFIG_FILE = "task.json"

# Fixed sub-folders -- single source of truth for these names.
INPUT_DIR = "input"
DATASET_DIR = "dataset"
TRAINING_DIR = "dataset/00_training"
VALIDATION_DIR = "dataset/01_validation"
TEST_SPLIT_DIR = "dataset/02_test"
IMAGE_OUTPUT_DIR = "image_output"
OUTPUT_DIR = "output"
EXPORT_DIR = "export"
TEST_DIR = "test"


class Workspace:
    """Resolves all paths for a single task from its root."""

    def __init__(self, task_name: str, tasks_root: Path | None = None) -> None:
        self.name = task_name
        self.tasks_root = tasks_root or TASKS_ROOT

    # -- core anchors ------------------------------------------------------- #
    @property
    def root(self) -> Path:
        return self.tasks_root / self.name

    @property
    def config_path(self) -> Path:
        return self.root / CONFIG_FILE

    # -- derived folders ---------------------------------------------------- #
    @property
    def input(self) -> Path:
        return self.root / INPUT_DIR

    @property
    def dataset(self) -> Path:
        return self.root / DATASET_DIR

    @property
    def training(self) -> Path:
        return self.root / TRAINING_DIR

    @property
    def validation(self) -> Path:
        return self.root / VALIDATION_DIR

    @property
    def test_split(self) -> Path:
        return self.root / TEST_SPLIT_DIR

    @property
    def image_output(self) -> Path:
        return self.root / IMAGE_OUTPUT_DIR

    @property
    def output(self) -> Path:
        return self.root / OUTPUT_DIR

    @property
    def export(self) -> Path:
        return self.root / EXPORT_DIR

    @property
    def test(self) -> Path:
        return self.root / TEST_DIR

    # -- helpers ------------------------------------------------------------ #
    def run_dir(self, run_id: str) -> Path:
        """A single training run, e.g. output/2025-07-07_19-40-50/."""
        return self.output / run_id

    def resolve(self, relative: str) -> Path:
        """Turn a config-stored relative reference into an absolute path.
        Rejects anything that tries to escape the task root."""
        p = (self.root / relative).resolve()
        if self.root.resolve() not in p.parents and p != self.root.resolve():
            raise ValueError(f"path escapes task workspace: {relative}")
        return p

    def relativize(self, absolute: str | Path) -> str:
        """Inverse of resolve(): store a path relative to the task root."""
        return str(Path(absolute).resolve().relative_to(self.root.resolve())).replace(
            "\\", "/"
        )

    def ensure_layout(self) -> None:
        for folder in (
            self.input,
            self.training,
            self.validation,
            self.test_split,
            self.image_output,
            self.output,
            self.export,
            self.test,
        ):
            folder.mkdir(parents=True, exist_ok=True)
