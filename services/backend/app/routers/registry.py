"""Model registry endpoints: register a version, list, promote (set active)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..registry import model_registry
from ..schemas import ModelVersion, RegisterRequest, WorkflowStep
from ..workflow import task_registry

router = APIRouter(prefix="/tasks/{task_id}/models", tags=["registry"])


def _require(task_id: str):
    task = task_registry.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.get("", response_model=list[ModelVersion])
def list_models(task_id: str) -> list[ModelVersion]:
    return model_registry.list(_require(task_id).config)


@router.post("", response_model=ModelVersion, status_code=201)
def register_model(task_id: str, payload: RegisterRequest) -> ModelVersion:
    config = _require(task_id).config
    version = model_registry.register(task_id, config, payload)
    task_registry.complete_step(task_id, WorkflowStep.register)
    return version


@router.post("/{version_id}/promote", response_model=ModelVersion)
def promote_model(task_id: str, version_id: str) -> ModelVersion:
    config = _require(task_id).config
    version = model_registry.promote(config, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="version not found")
    return version
