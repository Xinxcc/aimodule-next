"""Inference endpoints: single image, async batch over a folder, live WS stream."""
from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from ..predict import predict_service
from ..schemas import BatchRequest, BatchSummary, PredictionOut, WorkflowStep
from ..workflow import task_registry

router = APIRouter(tags=["inference"])


def _require_config(task_id: str):
    task = task_registry.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="task not found")
    return task.config


@router.post("/tasks/{task_id}/predict", response_model=PredictionOut)
async def predict_one(task_id: str, file: UploadFile = File(...)) -> PredictionOut:
    """Run inference on a single uploaded image."""
    config = _require_config(task_id)
    suffix = Path(file.filename or "upload.png").suffix or ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        return predict_service.predict_one(config, tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@router.post("/tasks/{task_id}/predict/batch", response_model=BatchSummary, status_code=202)
def predict_batch(task_id: str, payload: BatchRequest) -> BatchSummary:
    """Start an async batch over a local folder. Poll GET, or subscribe to WS."""
    config = _require_config(task_id)
    batch = predict_service.start_batch(task_id, config, payload.folder)
    task_registry.complete_step(task_id, WorkflowStep.test)
    return batch


@router.get("/predict/batches/{batch_id}", response_model=BatchSummary)
def get_batch(batch_id: str) -> BatchSummary:
    batch = predict_service.get(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="batch not found")
    return batch


@router.websocket("/predict/batches/{batch_id}/stream")
async def stream_batch(websocket: WebSocket, batch_id: str) -> None:
    await websocket.accept()
    if predict_service.get(batch_id) is None:
        await websocket.close(code=4404)
        return
    try:
        async for event in predict_service.stream(batch_id):
            await websocket.send_json(event.model_dump())
    except WebSocketDisconnect:
        pass
