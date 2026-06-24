"""Local model registry: versioned models with lineage + metrics, persisted per
task. Every exported model is kept with its history, metrics and traceability.

Persisted at <task_root>/registry.json. Each entry records what the model came
from (run, dataset fingerprint, config snapshot) so a version is reproducible
and can be rolled back / promoted.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from .schemas import (
    ExportFormat,
    Lineage,
    ModelVersion,
    RegisterRequest,
    TaskConfig,
)
from .workspace import Workspace

REGISTRY_FILE = "registry.json"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def dataset_fingerprint(ws: Workspace) -> str:
    """Cheap, stable hash of the training set (names + sizes) so two registered
    models can be told apart by the data they saw."""
    h = hashlib.sha1()
    if ws.training.is_dir():
        for p in sorted(ws.training.rglob("*")):
            if p.is_file():
                h.update(p.name.encode("utf-8"))
                h.update(str(p.stat().st_size).encode("utf-8"))
    return h.hexdigest()[:12]


class ModelRegistry:
    def _path(self, task_name: str) -> Path:
        return Workspace(task_name).root / REGISTRY_FILE

    def _load(self, task_name: str) -> List[ModelVersion]:
        path = self._path(task_name)
        if not path.exists():
            return []
        raw = json.loads(path.read_text(encoding="utf-8"))
        return [ModelVersion.model_validate(v) for v in raw]

    def _save(self, task_name: str, versions: List[ModelVersion]) -> None:
        path = self._path(task_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps([v.model_dump() for v in versions], indent=2),
            encoding="utf-8",
        )

    def list(self, config: TaskConfig) -> List[ModelVersion]:
        return self._load(config.name)

    def register(
        self, task_id: str, config: TaskConfig, req: RegisterRequest
    ) -> ModelVersion:
        ws = Workspace(config.name)
        versions = self._load(config.name)
        next_version = max((v.version for v in versions), default=0) + 1

        # resolve the artifact (the exported model next to the checkpoint)
        path_rel = None
        size = 0
        if config.export.checkpoint:
            ckpt = ws.resolve(config.export.checkpoint)
            artifact = ckpt.with_suffix(
                ".onnx" if req.format == ExportFormat.onnx else ".pt"
            )
            if artifact.exists():
                path_rel = ws.relativize(artifact)
                size = artifact.stat().st_size

        version = ModelVersion(
            id=uuid.uuid4().hex[:12],
            task_id=task_id,
            version=next_version,
            created_at=_now(),
            model=req.model,
            format=req.format,
            path=path_rel,
            size_bytes=size,
            metrics=req.metrics,
            classes=dict(config.classes),
            lineage=Lineage(
                run_id=req.run_id,
                dataset_fingerprint=dataset_fingerprint(ws),
                config_snapshot=config.model_dump(),
                train_summary=req.notes,
            ),
            active=not versions,  # first one is active by default
        )
        versions.append(version)
        self._save(config.name, versions)
        return version

    def promote(self, config: TaskConfig, version_id: str) -> ModelVersion | None:
        versions = self._load(config.name)
        found = None
        for v in versions:
            v.active = v.id == version_id
            if v.active:
                found = v
        if found is None:
            return None
        self._save(config.name, versions)
        return found


model_registry = ModelRegistry()
