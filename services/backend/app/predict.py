"""Local inference service: build an InferenceEngine from a task's config, run
single or async batch prediction over a local folder, stream progress over WS.

This is the piece that turns the app from a *training* tool into a tool whose
models can actually be *used* on the line (batch a folder, get results).
"""
from __future__ import annotations

import asyncio
import sys
import uuid
from pathlib import Path
from typing import AsyncIterator, Dict

# core/ lives outside the backend package; make it importable.
_CORE = Path(__file__).resolve().parents[3] / "core"
if str(_CORE) not in sys.path:
    sys.path.insert(0, str(_CORE))

from aimodule_core.inference import InferenceEngine, Prediction  # noqa: E402

from .schemas import (  # noqa: E402
    BatchEvent,
    BatchSummary,
    ClassScoreOut,
    DetectionOut,
    JobState,
    PredictionOut,
    TaskConfig,
)
from .workspace import Workspace  # noqa: E402


def engine_for(config: TaskConfig) -> InferenceEngine:
    """Resolve the exported ONNX model + class map + image size from config."""
    ws = Workspace(config.name)
    model_path = None
    if config.export.checkpoint:
        # config stores e.g. "output/<run>/epoch_00050.pth"; the served model is
        # the .onnx next to it.
        pth = ws.resolve(config.export.checkpoint)
        onnx = pth.with_suffix(".onnx")
        model_path = onnx if onnx.exists() else None
    return InferenceEngine(
        model_path=model_path,
        task_type=config.task_type.value,
        image_size=(config.images.size.width, config.images.size.height),
        class_map=dict(config.classes),
    )


def to_out(p: Prediction) -> PredictionOut:
    return PredictionOut(
        file=p.file,
        task_type=p.task_type,  # type: ignore[arg-type]
        ok=p.ok,
        error=p.error,
        top_label=p.top_label,
        top_score=p.top_score,
        scores=[ClassScoreOut(class_id=s.class_id, label=s.label, score=s.score)
                for s in p.scores],
        detections=[DetectionOut(class_id=d.class_id, label=d.label, score=d.score,
                                 box=d.box) for d in p.detections],
        is_anomaly=p.is_anomaly,
        simulated=p.simulated,
    )


def _resolve_folder(config: TaskConfig, folder: str) -> Path:
    p = Path(folder)
    if p.is_absolute() and p.exists():
        return p
    return Workspace(config.name).resolve(folder)


class PredictService:
    def __init__(self) -> None:
        self._summaries: Dict[str, BatchSummary] = {}
        self._queues: Dict[str, asyncio.Queue[BatchEvent]] = {}
        self._tasks: Dict[str, asyncio.Task] = {}

    # -- single ------------------------------------------------------------ #
    def predict_one(self, config: TaskConfig, image_path: str) -> PredictionOut:
        eng = engine_for(config)
        path = image_path if Path(image_path).is_absolute() else str(
            _resolve_folder(config, image_path)
        )
        return to_out(eng.predict(path))

    # -- batch ------------------------------------------------------------- #
    def get(self, batch_id: str) -> BatchSummary | None:
        return self._summaries.get(batch_id)

    def start_batch(self, task_id: str, config: TaskConfig, folder: str) -> BatchSummary:
        eng = engine_for(config)
        resolved = _resolve_folder(config, folder)
        files = eng.list_images(resolved)
        batch = BatchSummary(
            batch_id=uuid.uuid4().hex[:12],
            task_id=task_id,
            state=JobState.queued,
            folder=str(resolved),
            total=len(files),
            simulated=not eng.has_model,
        )
        self._summaries[batch.batch_id] = batch
        self._queues[batch.batch_id] = asyncio.Queue()
        self._tasks[batch.batch_id] = asyncio.create_task(
            self._run(batch, eng, files)
        )
        return batch

    async def stream(self, batch_id: str) -> AsyncIterator[BatchEvent]:
        queue = self._queues.get(batch_id)
        if queue is None:
            return
        while True:
            event = await queue.get()
            yield event
            if event.state in (JobState.completed, JobState.failed, JobState.cancelled):
                break

    async def _run(self, batch: BatchSummary, eng: InferenceEngine, files: list) -> None:
        batch.state = JobState.running
        try:
            for idx, f in enumerate(files, start=1):
                # offload the (blocking) inference call off the event loop
                pred = await asyncio.to_thread(eng.predict, f)
                out = to_out(pred)
                batch.results.append(out)
                batch.done = idx
                batch.progress = idx / max(1, batch.total)
                if out.top_label:
                    batch.label_counts[out.top_label] = (
                        batch.label_counts.get(out.top_label, 0) + 1
                    )
                await self._queues[batch.batch_id].put(
                    BatchEvent(
                        batch_id=batch.batch_id,
                        state=JobState.running,
                        done=batch.done,
                        total=batch.total,
                        progress=batch.progress,
                        result=out,
                    )
                )
            batch.state = JobState.completed
        except Exception as exc:  # noqa: BLE001
            batch.state = JobState.failed
        await self._queues[batch.batch_id].put(
            BatchEvent(
                batch_id=batch.batch_id,
                state=batch.state,
                done=batch.done,
                total=batch.total,
                progress=batch.progress,
            )
        )


predict_service = PredictService()
