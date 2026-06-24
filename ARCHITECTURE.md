# AIModule — Architecture

> A modern, offline desktop application for the AI model-training workflow
> (classification / object detection / anomaly detection).

---

## 1. Design goals

- **Offline-first.** Runs on a single machine with no network and no
  pre-installed Python.
- **Guided & reproducible.** A non-specialist can go from raw data to an exported
  model through an explicit, validated workflow.
- **Observable.** Training progress is pushed live to the UI, not scraped from
  logs.
- **Typed & path-safe.** One validated config per task; no absolute paths baked
  into files.
- **Small, clear surface.** Each language does one job; the UI and the compute
  talk through a single documented contract.

## 2. Architecture

Two processes and one contract:

```
+---------------------------------------------------------------+
|  Tauri desktop shell (Rust, ~5 MB)                            |
|  - native window / menu / file dialogs                        |
|  - owns the Python sidecar lifecycle                          |
|  +---------------------------------------------------------+  |
|  |  WebView: React + TypeScript frontend                   |  |
|  |  - design-system component library                      |  |
|  |  - wizard state machine (7 steps)                       |  |
|  |  - live charts fed by WebSocket                         |  |
|  +---------------------------------------------------------+  |
+----------------------------+----------------------------------+
            loopback 127.0.0.1   HTTP + WebSocket (JSON)
+----------------------------v----------------------------------+
|  Python backend (FastAPI) - launched as a Tauri sidecar       |
|  - workflow engine (explicit state machine)                   |
|  - job queue (async training, cancellable)                    |
|  - WebSocket push: epoch / loss / acc / progress / log        |
|  - Pydantic config model (one typed schema per task)          |
|  - imports the training logic directly                        |
+---------------------------------------------------------------+
|  Compute layer: PyTorch (+ pluggable compute backend)         |
+---------------------------------------------------------------+
```

### Language responsibilities

| Concern | Language |
|---|---|
| UI | TypeScript / React |
| Orchestration / service / config | Python (FastAPI / Pydantic) |
| Desktop shell / packaging | Rust (Tauri, almost no hand-written code) |
| Compute | Python (PyTorch + pluggable backend) |

## 3. Offline packaging (hard requirement)

The app must run with **zero network and zero pre-installed Python**.

1. **Freeze the backend** with PyInstaller (or Nuitka) into a single
   `aimodule-backend.exe` that bundles Python + FastAPI + the compute-backend
   `.whl` + PyTorch. Ship it as a **Tauri sidecar**.
2. **Tauri static bundle.** The React build is embedded in the binary; the
   WebView uses the system WebView2 (present on Windows 11, works offline).
3. **GPU.** Bundle the CUDA build of PyTorch for local-GPU training; fall back
   to CPU automatically when no GPU is present.
4. **Artifact.** One NSIS/MSI installer containing `app.exe` (Tauri) +
   `aimodule-backend.exe` (sidecar). Double-click to run.

## 4. Workflow and API contract

The workflow is an explicit REST + WebSocket contract. Steps:

```
Create Task -> Create Images -> [Label Images, OD only] -> Train
            -> Visualize -> Export -> Test     (+ Summary)
```

```
POST   /tasks                      create task
GET    /tasks/{id}                 task status / current step
PUT    /tasks/{id}/config          unified config (Pydantic-validated, no abs paths)
POST   /tasks/{id}/images          data preprocessing (csv->image, resize/crop)
POST   /tasks/{id}/label           launch labeling (object detection)
POST   /tasks/{id}/train           enqueue training -> returns job_id
POST   /jobs/{job_id}/cancel       cancel a running job
POST   /tasks/{id}/export          export model
POST   /tasks/{id}/test            inference test
WS     /jobs/{job_id}/stream       live {epoch, loss, acc, progress, log}
```

Loss/acc curves come from the WebSocket stream straight into React charts.

## 5. Repository layout

```
aimodule/
+- apps/desktop/        # Tauri shell (Rust, src-tauri/)
+- apps/web/            # React + TS frontend (design system + 7-step wizard)
+- services/backend/    # FastAPI: routers / workflow / jobs / schemas (Pydantic)
+- core/                # training logic (compute)
+- packaging/           # PyInstaller spec + Tauri bundler config
+- ARCHITECTURE.md
```

## 6. UI design system

A clean light workbench: a **vertical step rail on the left** + a **large content
area on the right**, which suits the linear wizard.

### Design tokens

```
Color    Primary #4F46E5 (indigo)   Success #16A34A   Warning #D97706   Danger #DC2626
         Neutral slate 9-step  #0F172A -> #F8FAFC   Background #F8FAFC   Card #FFFFFF
Type     Inter / system UI   12 / 14 / 16 / 20 / 28 px   line-height 1.5
Radius   8px (controls) / 12px (cards) / 6px (inputs)
Shadow   sm: 0 1 2 rgba(0,0,0,.06)   md: 0 4 12 rgba(0,0,0,.08)
Spacing  multiples of 4 (4/8/12/16/24/32)
```

Implemented with **Tailwind + shadcn/ui** (Radix, accessible). All tokens live in
`tailwind.config`; light/dark switch with one toggle.

### Layout skeleton

```
+--------------+----------------------------------------------+
|  AIModule    |  Train Model                        theme  * |
|              |  ------------------------------------------- |
| 1 Task    v  |   +-- Config card -----+ +-- Live monitor -+ |
| 2 Images  v  |   | Model  [EffNet  v] | |  Loss  \___      | |
| 3 Label   -  |   | Epochs [  50    ]  | |          \____   | |
| 4 Train   *  |   | Batch  [  16    ]  | |  Acc  ___/--     | |
| 5 Visualize  |   | LR     [ 0.001  ]  | |                  | |
| 6 Export     |   | Split 80/10/10     | +-----------------+ |
| 7 Test       |   +--------------------+                     |
|              |   +-- Log (live WS) ----------------------+  |
|  status:     |   | epoch 12/50 loss 0.214 acc 0.91 ...   |  |
|  training    |   +---------------------------------------+  |
|  GPU 73%     |                      [ <- Back ] [ Train ] |
+--------------+----------------------------------------------+
```

- Left rail step icons: done / current / skipped / locked.
- Content area uses **cards** (config / monitor / log), no absolute positioning.
- Sticky **Back / Next** primary actions at the bottom.
- Persistent **GPU / status** in the lower-left.
- During training the button becomes "Cancel"; progress is WS-driven.

### Per-step notes

- **Create Task**: task name + the three task types as large radio cards.
- **Create Images**: parameter form on the left, live preview on the right.
- **Visualize**: training curves + confusion matrix + sample-prediction grid,
  inline.
- **Test**: drag-drop image upload, instant class / confidence / boxes.
