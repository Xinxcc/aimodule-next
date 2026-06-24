"""Task registry + explicit workflow state machine, with on-disk persistence.

Each task is the single `task.json` under its workspace -- no duplicate copies.
The label_images step is only part of the workflow for object detection.
"""
from __future__ import annotations

import uuid
from typing import Dict, List

from pydantic import ValidationError

from .schemas import (
    SCHEMA_VERSION,
    Task,
    TaskConfig,
    TaskCreate,
    TaskType,
    WorkflowStep,
)
from .workspace import Workspace


def steps_for(task_type: TaskType) -> List[WorkflowStep]:
    from .schemas import WORKFLOW_ORDER

    steps = list(WORKFLOW_ORDER)
    if task_type != TaskType.object_detection:
        steps.remove(WorkflowStep.label_images)
    return steps


def _persist(config: TaskConfig) -> None:
    ws = Workspace(config.name)
    ws.root.mkdir(parents=True, exist_ok=True)
    ws.config_path.write_text(config.model_dump_json(indent=2), encoding="utf-8")


class TaskRegistry:
    def __init__(self) -> None:
        # task_id -> Task. The durable copy lives in <task_root>/task.json.
        self._tasks: Dict[str, Task] = {}

    def list(self) -> List[Task]:
        return list(self._tasks.values())

    def get(self, task_id: str) -> Task | None:
        return self._tasks.get(task_id)

    def create(self, payload: TaskCreate) -> Task:
        config = TaskConfig(name=payload.name, task_type=payload.task_type)
        task = Task(id=uuid.uuid4().hex[:12], config=config)
        Workspace(config.name).ensure_layout()
        _persist(config)
        self._tasks[task.id] = task
        return task

    def register_config(self, config: TaskConfig) -> Task:
        """Adopt an already-built config (e.g. from an imported flat config)."""
        task = Task(id=uuid.uuid4().hex[:12], config=config)
        Workspace(config.name).ensure_layout()
        _persist(config)
        self._tasks[task.id] = task
        return task

    def replace_config(self, task_id: str, config: TaskConfig) -> Task | None:
        task = self._tasks.get(task_id)
        if task is None:
            return None
        config.schema_version = SCHEMA_VERSION
        task.config = config
        _persist(config)
        return task

    def update_section(self, task_id: str, section: str, data: dict) -> Task | None:
        """Update a single config section (one workflow step's slice) and
        re-validate the whole document."""
        task = self._tasks.get(task_id)
        if task is None:
            return None
        merged = task.config.model_dump()
        if section not in merged:
            raise KeyError(section)
        merged[section] = data
        task.config = TaskConfig.model_validate(merged)  # may raise ValidationError
        _persist(task.config)
        return task

    def complete_step(self, task_id: str, step: WorkflowStep) -> Task | None:
        task = self._tasks.get(task_id)
        if task is None:
            return None
        wf = task.config.workflow
        if step not in wf.completed_steps:
            wf.completed_steps.append(step)
        order = steps_for(task.config.task_type)
        idx = order.index(step)
        if idx + 1 < len(order):
            wf.current_step = order[idx + 1]
        _persist(task.config)
        return task


task_registry = TaskRegistry()

__all__ = ["task_registry", "steps_for", "ValidationError"]
