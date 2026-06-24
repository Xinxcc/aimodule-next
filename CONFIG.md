# Configuration & paths

One typed configuration per task, with every section mapped to a workflow step
and every path derived at runtime (never stored as an absolute path).

## The rule

**One task = one `task.json`.** It is typed (Pydantic, see `schemas.py`),
sectioned by workflow step, and stores **no absolute paths**. Paths are derived
at runtime by `workspace.py` from `tasks_root` (an app setting) + the task name.

## Canonical workspace layout

```
<tasks_root>/<task_name>/
+- task.json                 the single config (sectioned)
+- input/                    raw CSV / source data
+- dataset/
|   +- 00_training/
|   +- 01_validation/
|   +- 02_test/
+- image_output/             preprocessed images (temp)
+- output/<run_id>/          training runs (checkpoints + config snapshot)
+- export/                   exported models (onnx / torchscript)
+- test/                     test runs + result json
```

`task.json` stores only relative references, e.g.
`export.checkpoint = "output/2025-07-07_19-40-50/epoch_00050.pth"`. Move or back
up the folder and everything still resolves. `Workspace.resolve()` also rejects
any reference that escapes the task root.

## Sections map 1:1 to workflow steps

| Step | Section in `task.json` | API |
|---|---|---|
| Create Task | `name`, `task_type`, `workflow` | `POST /tasks` |
| Create Images (CSV→img) | `data_source` | `PATCH /tasks/{id}/config/data_source` |
| Create Images (gen) | `images` | `PATCH .../images` |
| (split) | `split` | `PATCH .../split` |
| Train | `train` | `PATCH .../train`, `POST .../train` |
| Train output | `classes` (learned) | — |
| Export | `export` | `PATCH .../export` |
| Test | `test.ring_buffer` | `PATCH .../test` |

Each step touches only its own slice; the whole document is re-validated on every
write, so a bad value is rejected at the source instead of blowing up
mid-pipeline.

## Design choices

- **Typed enums** for task type, export format and workflow step (no magic ints).
- **Structured value objects** for sizes, crops, limits and augmentation (no
  values stuffed into strings like `"640x480"`).
- **Derived paths** — task folder, input, image output and test folders are all
  computed from `tasks_root + name`, so a config is portable across machines.
- **One source of truth** — training parameters live only in `train`; there is no
  parallel config to keep in sync.

## Importing an external flat config

The backend also accepts a flat key/value config (e.g. produced by another tool)
via `POST /tasks/import`. It maps the flat keys onto the sectioned `TaskConfig`,
strips absolute paths, parses stringly-typed values, and returns a validated
`task.json`.
