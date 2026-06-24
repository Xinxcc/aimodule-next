"""Monitoring + retraining-loop endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..monitoring import monitoring_service
from ..schemas import (
    DriftReport,
    IngestRequest,
    RetrainRequest,
    RetrainResponse,
    WorkflowStep,
)
from ..workflow import task_registry

router = APIRouter(prefix="/tasks/{task_id}/monitoring", tags=["monitoring"])


def _require(task_id: str):
    task = task_registry.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return task


@router.get("", response_model=DriftReport)
def get_report(task_id: str) -> DriftReport:
    report = monitoring_service.get(task_id)
    if report is None:
        raise HTTPException(status_code=404, detail="no monitoring data yet")
    return report


@router.post("/ingest", response_model=DriftReport)
def ingest(task_id: str, payload: IngestRequest) -> DriftReport:
    """Feed a finished deploy batch into monitoring -> drift report + hard cases."""
    config = _require(task_id).config
    try:
        return monitoring_service.ingest(
            task_id, config, payload.batch_id, payload.low_confidence_threshold
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="batch not found")


@router.post("/retrain", response_model=RetrainResponse, status_code=202)
def retrain(task_id: str, payload: RetrainRequest) -> RetrainResponse:
    """Promote hard examples into the training set and (optionally) retrain."""
    config = _require(task_id).config
    resp = monitoring_service.retrain(task_id, config, payload.files, payload.retrain)
    task_registry.complete_step(task_id, WorkflowStep.monitor)
    return resp
