"""Local inference engine — the production path uses ONNX Runtime; a
deterministic simulation fallback runs when no model / no runtime is present
(so the offline app demos batch inference before a model is trained).

Inference contract:
  * preprocess: RGB -> resize(W,H) -> uint8 -> CHW -> batch dim
  * classification: outputs[0][0] = per-class scores
  * detection:      outputs = [num, boxes(ymin,xmin,ymax,xmax), scores, class_ids]
  * anomaly:        outputs[0][0] = score, outputs[2][0] = is_anomaly

No coupling to the backend: task_type is a plain string and results are
dataclasses (the backend converts them to Pydantic).
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional, Sequence

import numpy as np
from PIL import Image

CLASSIFICATION = "classification"
OBJECT_DETECTION = "object_detection"
ANOMALY_DETECTION = "anomaly_detection"


@dataclass
class ClassScore:
    class_id: int
    label: str
    score: float


@dataclass
class Detection:
    class_id: int
    label: str
    score: float
    box: tuple[int, int, int, int]  # xmin, ymin, xmax, ymax


@dataclass
class Prediction:
    file: str
    task_type: str
    ok: bool = True
    error: Optional[str] = None
    # classification / anomaly
    top_label: Optional[str] = None
    top_score: Optional[float] = None
    scores: list[ClassScore] = field(default_factory=list)
    # detection
    detections: list[Detection] = field(default_factory=list)
    # anomaly
    is_anomaly: Optional[bool] = None
    simulated: bool = False


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x))
    return e / e.sum()


def _seed_for(path: Path) -> int:
    h = hashlib.sha1(path.name.encode("utf-8")).hexdigest()
    return int(h[:8], 16)


class InferenceEngine:
    """Loads an ONNX model once and runs single / batch inference."""

    IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".gif"}

    def __init__(
        self,
        model_path: Optional[str | Path],
        task_type: str,
        image_size: tuple[int, int] = (640, 480),
        class_map: Optional[dict[int, str]] = None,
    ) -> None:
        self.model_path = Path(model_path) if model_path else None
        self.task_type = task_type
        self.width, self.height = image_size
        self.class_map = class_map or {}
        self._session = None
        self._input_name: Optional[str] = None

    # -- model ------------------------------------------------------------- #
    @property
    def has_model(self) -> bool:
        return self.model_path is not None and self.model_path.exists()

    def _ensure_session(self) -> bool:
        """Lazily create the ORT session. Returns False if unavailable (then we
        fall back to simulation)."""
        if self._session is not None:
            return True
        if not self.has_model:
            return False
        try:
            import onnxruntime  # noqa: PLC0415 - optional heavy dep
        except ImportError:
            return False
        self._session = onnxruntime.InferenceSession(
            str(self.model_path), providers=["CPUExecutionProvider"]
        )
        self._input_name = self._session.get_inputs()[0].name
        return True

    def _label(self, class_id: int) -> str:
        return self.class_map.get(class_id, f"class_{class_id}")

    # -- preprocessing ------------------------------------------------------ #
    def preprocess(self, image_path: Path) -> np.ndarray:
        img = Image.open(image_path).convert("RGB").resize((self.width, self.height))
        arr = np.asarray(img, dtype=np.uint8)  # H, W, 3
        arr = np.transpose(arr, (2, 0, 1))  # C, H, W
        return np.expand_dims(arr, axis=0)  # 1, C, H, W

    # -- single image ------------------------------------------------------ #
    def predict(self, image_path: str | Path) -> Prediction:
        path = Path(image_path)
        try:
            if self._ensure_session():
                raw = self._run_model(path)
                pred = self._postprocess(path, raw)
            else:
                pred = self._simulate(path)
            return pred
        except Exception as exc:  # noqa: BLE001 - report per-file, never crash batch
            return Prediction(
                file=path.name, task_type=self.task_type, ok=False, error=str(exc)
            )

    def _run_model(self, path: Path) -> list[np.ndarray]:
        inp = self.preprocess(path)
        return self._session.run(None, {self._input_name: inp})  # type: ignore[union-attr]

    def _postprocess(self, path: Path, raw: list[np.ndarray]) -> Prediction:
        pred = Prediction(file=path.name, task_type=self.task_type)
        if self.task_type == CLASSIFICATION:
            scores = np.asarray(raw[0][0], dtype=float)
            pred.scores = [
                ClassScore(i, self._label(i), float(s)) for i, s in enumerate(scores)
            ]
            best = int(np.argmax(scores))
            pred.top_label, pred.top_score = self._label(best), float(scores[best])
        elif self.task_type == OBJECT_DETECTION:
            num = int(raw[0][0])
            for i in range(num):
                ymin, xmin, ymax, xmax = map(int, raw[1][0][i])
                cid = int(raw[3][0][i])
                pred.detections.append(
                    Detection(cid, self._label(cid), float(raw[2][0][i]),
                              (xmin, ymin, xmax, ymax))
                )
            pred.top_label = f"{num} object(s)"
            pred.top_score = max((d.score for d in pred.detections), default=0.0)
        elif self.task_type == ANOMALY_DETECTION:
            pred.top_score = float(raw[0][0])
            pred.is_anomaly = bool(raw[2][0])
            pred.top_label = "anomaly" if pred.is_anomaly else "normal"
        return pred

    # -- simulation fallback ----------------------------------------------- #
    def _simulate(self, path: Path) -> Prediction:
        rng = np.random.default_rng(_seed_for(path))
        pred = Prediction(file=path.name, task_type=self.task_type, simulated=True)
        labels = self.class_map or {0: "class_0", 1: "class_1"}
        ids = sorted(labels)
        if self.task_type == CLASSIFICATION:
            scores = _softmax(rng.normal(size=len(ids)) * 3)
            pred.scores = [ClassScore(c, labels[c], float(scores[k]))
                           for k, c in enumerate(ids)]
            best = int(np.argmax(scores))
            pred.top_label, pred.top_score = labels[ids[best]], float(scores[best])
        elif self.task_type == OBJECT_DETECTION:
            for i in range(int(rng.integers(1, 4))):
                cid = int(rng.choice(ids))
                x, y = int(rng.integers(0, self.width // 2)), int(rng.integers(0, self.height // 2))
                pred.detections.append(
                    Detection(cid, labels[cid], float(rng.uniform(0.6, 0.99)),
                              (x, y, x + int(rng.integers(40, self.width // 2)),
                               y + int(rng.integers(40, self.height // 2))))
                )
            pred.top_label = f"{len(pred.detections)} object(s)"
            pred.top_score = max((d.score for d in pred.detections), default=0.0)
        else:  # anomaly
            score = float(rng.uniform(0, 1))
            pred.top_score, pred.is_anomaly = score, score > 0.7
            pred.top_label = "anomaly" if pred.is_anomaly else "normal"
        return pred

    # -- batch ------------------------------------------------------------- #
    def list_images(self, folder: str | Path) -> list[Path]:
        folder = Path(folder)
        if not folder.is_dir():
            return []
        return sorted(
            p for p in folder.iterdir()
            if p.is_file() and p.suffix.lower() in self.IMAGE_EXTS
        )

    def predict_batch(
        self,
        paths: Sequence[str | Path],
        on_result: Optional[Callable[[int, int, Prediction], None]] = None,
    ) -> list[Prediction]:
        total = len(paths)
        results: list[Prediction] = []
        for idx, p in enumerate(paths, start=1):
            pred = self.predict(p)
            results.append(pred)
            if on_result:
                on_result(idx, total, pred)
        return results


__all__ = [
    "InferenceEngine", "Prediction", "ClassScore", "Detection",
    "CLASSIFICATION", "OBJECT_DETECTION", "ANOMALY_DETECTION",
]
