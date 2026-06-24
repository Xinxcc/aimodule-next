"""Job control + live WebSocket stream: cancel a running job and push live
training progress to the UI over WebSocket."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..jobs import job_manager
from ..schemas import Job

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}", response_model=Job)
def get_job(job_id: str) -> Job:
    job = job_manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.post("/{job_id}/cancel", response_model=Job)
def cancel_job(job_id: str) -> Job:
    job = job_manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    job_manager.cancel(job_id)
    return job


@router.websocket("/{job_id}/stream")
async def stream_job(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    if job_manager.get(job_id) is None:
        await websocket.close(code=4404)
        return
    try:
        async for event in job_manager.stream(job_id):
            await websocket.send_json(event.model_dump())
    except WebSocketDisconnect:
        pass
