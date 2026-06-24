"""Task + workflow + config REST endpoints.

Replaces create_project_AI_Module.py and the config-persistence half of the old
C++ confighandler. Config is read/written per section so each workflow step
touches only its own slice of the single task.json.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from ..jobs import job_manager
from ..migrate import import_flat_config
from ..schemas import (
    Job,
    Task,
    TaskConfig,
    TaskCreate,
    TrainRequest,
    WorkflowStep,
)
from ..workflow import steps_for, task_registry

router = APIRouter(prefix="/tasks", tags=["tasks"])

# Sections that can be PATCHed individually -- one per workflow step.
_SECTIONS = {
    "data_source",
    "images",
    "split",
    "train",
    "export",
    "test",
}


@router.get("", response_model=list[Task])
def list_tasks() -> list[Task]:
    return task_registry.list()


@router.post("", response_model=Task, status_code=201)
def create_task(payload: TaskCreate) -> Task:
    return task_registry.create(payload)


@router.post("/import", response_model=Task, status_code=201)
def import_config(payload: dict[str, Any]) -> Task:
    """Import a flat config (optionally with a parsed training YAML under `yaml`)
    into the sectioned model."""
    flat = payload.get("config", payload)
    yaml_cfg = payload.get("yaml")
    try:
        config = import_flat_config(flat, yaml_cfg)
    except (ValueError, TypeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"import failed: {exc}")
    return task_registry.register_config(config)


def _require(task_id: str) -> Task:
    task = task_registry.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.get("/{task_id}", response_model=Task)
def get_task(task_id: str) -> Task:
    return _require(task_id)


@router.get("/{task_id}/steps", response_model=list[WorkflowStep])
def get_steps(task_id: str) -> list[WorkflowStep]:
    return steps_for(_require(task_id).config.task_type)


@router.get("/{task_id}/config", response_model=TaskConfig)
def get_config(task_id: str) -> TaskConfig:
    return _require(task_id).config


@router.put("/{task_id}/config", response_model=Task)
def replace_config(task_id: str, config: TaskConfig) -> Task:
    _require(task_id)
    return task_registry.replace_config(task_id, config)  # type: ignore[return-value]


@router.patch("/{task_id}/config/{section}", response_model=Task)
def update_section(task_id: str, section: str, data: dict[str, Any]) -> Task:
    _require(task_id)
    if section not in _SECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"unknown section '{section}'; expected one of {sorted(_SECTIONS)}",
        )
    try:
        return task_registry.update_section(task_id, section, data)  # type: ignore[return-value]
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors())


@router.post("/{task_id}/train", response_model=Job, status_code=202)
def start_training(task_id: str, payload: TrainRequest) -> Job:
    task = _require(task_id)
    cfg = payload.config or task.config.train
    job = job_manager.start_training(task_id, cfg)
    task_registry.complete_step(task_id, WorkflowStep.train)
    return job
