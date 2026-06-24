# AIModule

An **offline desktop application for the end-to-end AI model-training workflow** —
classification, object detection and anomaly detection — designed for users who
are not ML specialists. It turns "data → train → evaluate → export → test" into a
guided, reproducible workflow that runs entirely on the local machine.

- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, packaging, API contract.
- [CONFIG.md](CONFIG.md) — the typed, per-task configuration model.

## Highlights

- **Two-process design.** A lightweight Tauri (Rust) desktop shell hosts a
  React/TypeScript UI and supervises a Python backend; they talk over a small
  HTTP + WebSocket contract on loopback.
- **Explicit workflow.** A 7-step wizard (Create Task → Create Images → Label →
  Train → Visualize → Export → Test) backed by a real state machine.
- **Live training.** A cancellable async job queue streams `{epoch, loss, acc,
  progress, log}` over WebSocket straight into the UI charts.
- **Typed config.** One Pydantic config schema per task — no scattered JSON/YAML,
  no absolute paths.
- **Offline-first.** Runs with zero network and zero pre-installed Python; the
  backend is frozen with PyInstaller and shipped as a Tauri sidecar.

## Architecture at a glance

```
┌──────────────────────────────────────────────┐
│  Tauri desktop shell (Rust)                   │
│  native window / dialogs · owns the backend   │
│  ┌────────────────────────────────────────┐   │
│  │ WebView: React + TypeScript frontend    │   │
│  │ design system · 7-step wizard · charts  │   │
│  └────────────────────────────────────────┘   │
└───────────────┬────────────────────────────────┘
        loopback │ HTTP + WebSocket (JSON)
┌───────────────▼────────────────────────────────┐
│  Python backend (FastAPI, Tauri sidecar)        │
│  workflow state machine · async job queue       │
│  WebSocket metrics push · Pydantic config        │
└───────────────┬────────────────────────────────┘
│  Compute layer: PyTorch (+ pluggable backend)   │
└─────────────────────────────────────────────────┘
```

## Stack

- **apps/desktop** — Tauri 2 shell (Rust). Owns the window and launches the
  Python backend as an offline sidecar.
- **apps/web** — React + TypeScript + Tailwind frontend (design system + 7-step
  wizard, live charts fed by WebSocket).
- **services/backend** — FastAPI: REST + WebSocket. Workflow state machine, a
  cancellable async job queue, a single unified Pydantic config.
- **core** — PyTorch compute layer (with a pluggable backend interface).
- **packaging** — PyInstaller spec + Tauri bundler config for the offline build.

## API contract (excerpt)

```
POST /tasks                 create task
PUT  /tasks/{id}/config     unified, validated config
POST /tasks/{id}/train      enqueue training → job_id
WS   /jobs/{job_id}/stream  live {epoch, loss, acc, progress, log}
POST /jobs/{job_id}/cancel  cancel a running job
```

## Develop

```bash
# 1. backend  (http://127.0.0.1:8756)
cd services/backend
python -m venv .venv && . .venv/Scripts/activate   # Windows
pip install -r requirements.txt
python -m app.main

# 2. frontend (http://localhost:5173)
cd apps/web
npm install
npm run dev

# 3. desktop shell (optional, needs Rust + Tauri CLI)
cd apps/desktop
cargo tauri dev
```

The frontend runs standalone against the backend; the Tauri shell is only needed
to test the packaged desktop experience.

## Build the offline installer

```bash
cd services/backend && pyinstaller ../../packaging/aimodule-backend.spec
# copy dist/aimodule-backend(.exe) -> apps/desktop/src-tauri/binaries/aimodule-backend-<triple>(.exe)
cd ../../apps/desktop && cargo tauri build   # produces the NSIS/MSI installer
```

## Status

**Working architecture prototype.** The frontend, the API contract and the
async/WebSocket job pipeline run end-to-end; the training job currently uses a
**simulated loop** so the full UX works before the compute layer is wired to real
training. Swapping the simulated loop for a real `core.train(...)` call is the
next step.

## Tech stack

Rust (Tauri) · TypeScript / React · Tailwind + shadcn/ui · Python · FastAPI ·
Pydantic · WebSocket · PyInstaller

## License

See [`LICENSE`](./LICENSE) — shared for evaluation purposes only.
