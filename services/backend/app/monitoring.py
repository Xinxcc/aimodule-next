"""Production monitoring + the retraining loop.

Takes a finished deploy batch, compares the live prediction distribution to the
training-set (reference) distribution, computes drift (PSI), mines low-confidence
/ anomalous "hard examples", and lets the user promote those back into the
training set to retrain -- a closed monitoring-to-retraining loop.
"""
from __future__ import annotations

import math
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict

from .jobs import job_manager
from .predict import predict_service
from .schemas import (
    DistributionBin,
    DriftReport,
    HardExample,
    RetrainResponse,
    TaskConfig,
)
from .workspace import Workspace

PSI_DRIFT_THRESHOLD = 0.2  # >0.2 is the usual "significant shift" rule of thumb
_EPS = 1e-6


def reference_distribution(ws: Workspace) -> Dict[str, float]:
    """Class proportions in the training set. Classification stores one subfolder
    per class under dataset/00_training/."""
    counts: Dict[str, int] = {}
    if ws.training.is_dir():
        for sub in sorted(ws.training.iterdir()):
            if sub.is_dir():
                n = sum(1 for p in sub.iterdir() if p.is_file())
                # class folders look like "00_chrom" -> "chrom"
                label = sub.name.split("_", 1)[-1] if "_" in sub.name else sub.name
                counts[label] = n
    total = sum(counts.values())
    return {k: v / total for k, v in counts.items()} if total else {}


def _psi(reference: Dict[str, float], live: Dict[str, float]) -> float:
    labels = set(reference) | set(live)
    psi = 0.0
    for label in labels:
        r = max(reference.get(label, 0.0), _EPS)
        a = max(live.get(label, 0.0), _EPS)
        psi += (a - r) * math.log(a / r)
    return round(psi, 4)


class MonitoringService:
    def __init__(self) -> None:
        self._reports: Dict[str, DriftReport] = {}  # task_id -> latest report

    def get(self, task_id: str) -> DriftReport | None:
        return self._reports.get(task_id)

    def ingest(
        self, task_id: str, config: TaskConfig, batch_id: str, low_conf: float
    ) -> DriftReport:
        batch = predict_service.get(batch_id)
        if batch is None:
            raise KeyError(batch_id)

        ws = Workspace(config.name)
        ref = reference_distribution(ws)
        # fall back to the declared class map (case-insensitive match below)
        if not ref and config.classes:
            n = len(config.classes)
            ref = {v.lower(): 1 / n for v in config.classes.values()}

        # live distribution from the batch results
        live_counts: Dict[str, int] = {}
        confidences: list[float] = []
        hard: list[HardExample] = []
        for r in batch.results:
            label = (r.top_label or "?").lower()
            live_counts[label] = live_counts.get(label, 0) + 1
            if r.top_score is not None:
                confidences.append(r.top_score)
            is_hard = (r.top_score is not None and r.top_score < low_conf) or bool(
                r.is_anomaly
            )
            if is_hard:
                hard.append(
                    HardExample(
                        file=str(Path(batch.folder) / r.file) if batch.folder else r.file,
                        predicted=r.top_label,
                        confidence=r.top_score or 0.0,
                        reason="anomaly" if r.is_anomaly else "low_confidence",
                    )
                )
        total = sum(live_counts.values())
        live = {k: v / total for k, v in live_counts.items()} if total else {}

        labels = sorted(set(ref) | set(live))
        distribution = [
            DistributionBin(label=l, reference=round(ref.get(l, 0.0), 3),
                            live=round(live.get(l, 0.0), 3))
            for l in labels
        ]
        psi = _psi(ref, live)
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
        low_rate = (
            sum(1 for c in confidences if c < low_conf) / len(confidences)
            if confidences else 0.0
        )

        report = DriftReport(
            task_id=task_id,
            samples=total,
            psi=psi,
            drifted=psi > PSI_DRIFT_THRESHOLD,
            avg_confidence=round(avg_conf, 4),
            low_confidence_rate=round(low_rate, 4),
            distribution=distribution,
            hard_examples=hard,
        )
        self._reports[task_id] = report
        return report

    def retrain(
        self, task_id: str, config: TaskConfig, files: list[str], retrain: bool
    ) -> RetrainResponse:
        """Copy selected hard examples into a review folder under the training
        set, then optionally kick off training -- closing the loop."""
        ws = Workspace(config.name)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        review = ws.training / f"_review_{stamp}"
        review.mkdir(parents=True, exist_ok=True)

        added = 0
        for f in files:
            src = Path(f)
            if src.is_file():
                shutil.copy2(src, review / src.name)
                added += 1

        job_id = None
        if retrain:
            job = job_manager.start_training(task_id, config.train)
            job_id = job.id

        return RetrainResponse(
            added=added, training_dir=ws.relativize(review), job_id=job_id
        )


monitoring_service = MonitoringService()
