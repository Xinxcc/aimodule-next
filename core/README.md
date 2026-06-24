# core/ — compute layer

The training logic lives here: `functional.py` (train / predict / eval / export),
`visualization.py` and `versioning.py`, plus a pluggable compute-backend wheel.

The backend (`services/backend`) imports from this package directly.

**Integration point:** replace the simulated loop in
`services/backend/app/jobs.py::JobManager._run` with a real call into
`core.train(cfg, on_epoch=...)` that yields per-epoch `{loss, accuracy}`, so the
WebSocket stream carries real metrics to the UI.
