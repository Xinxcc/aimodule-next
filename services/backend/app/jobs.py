"""In-process async job queue with cancellation and a per-job event stream.

A real training run calls into `core/` (PyTorch + compute backend) here; this
module ships with a simulated training loop so the full UI works end-to-end
before the compute layer is wired.
"""
from __future__ import annotations

import asyncio
import random
import uuid
from typing import AsyncIterator, Dict

from .schemas import Job, JobState, TrainConfig, TrainEvent


class JobManager:
    def __init__(self) -> None:
        self._jobs: Dict[str, Job] = {}
        self._queues: Dict[str, asyncio.Queue[TrainEvent]] = {}
        self._tasks: Dict[str, asyncio.Task] = {}

    def get(self, job_id: str) -> Job | None:
        return self._jobs.get(job_id)

    def start_training(self, task_id: str, cfg: TrainConfig) -> Job:
        job = Job(
            id=uuid.uuid4().hex[:12],
            task_id=task_id,
            kind="train",
            state=JobState.queued,
            total_epochs=cfg.epochs,
        )
        self._jobs[job.id] = job
        self._queues[job.id] = asyncio.Queue()
        self._tasks[job.id] = asyncio.create_task(self._run(job, cfg))
        return job

    def cancel(self, job_id: str) -> bool:
        task = self._tasks.get(job_id)
        if task and not task.done():
            task.cancel()
            return True
        return False

    async def stream(self, job_id: str) -> AsyncIterator[TrainEvent]:
        queue = self._queues.get(job_id)
        if queue is None:
            return
        while True:
            event = await queue.get()
            yield event
            if event.state in (
                JobState.completed,
                JobState.failed,
                JobState.cancelled,
            ):
                break

    async def _emit(self, job: Job, log: str | None = None) -> None:
        await self._queues[job.id].put(
            TrainEvent(
                job_id=job.id,
                state=job.state,
                epoch=job.epoch,
                total_epochs=job.total_epochs,
                loss=job.loss,
                accuracy=job.accuracy,
                progress=job.progress,
                log=log,
            )
        )

    async def _run(self, job: Job, cfg: TrainConfig) -> None:
        """Simulated training loop. Swap the body for a real call into
        core.train(...) that yields per-epoch metrics."""
        try:
            job.state = JobState.running
            await self._emit(job, log=f"Starting training: {cfg.model}")
            loss, acc = 1.2, 0.4
            for epoch in range(1, cfg.epochs + 1):
                await asyncio.sleep(0.2)  # stand-in for one epoch of work
                loss = max(0.02, loss * random.uniform(0.86, 0.97))
                acc = min(0.999, acc + (1 - acc) * random.uniform(0.05, 0.2))
                job.epoch = epoch
                job.loss = round(loss, 4)
                job.accuracy = round(acc, 4)
                job.progress = epoch / cfg.epochs
                await self._emit(
                    job,
                    log=f"epoch {epoch}/{cfg.epochs}  loss {job.loss}  acc {job.accuracy}",
                )
            job.state = JobState.completed
            await self._emit(job, log="Training complete")
        except asyncio.CancelledError:
            job.state = JobState.cancelled
            await self._emit(job, log="Training cancelled")
        except Exception as exc:  # noqa: BLE001 - surface any failure to the UI
            job.state = JobState.failed
            await self._emit(job, log=f"Training failed: {exc}")


job_manager = JobManager()
