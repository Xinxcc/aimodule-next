"""FastAPI entry point. Runs as the offline Tauri sidecar
(`aimodule-backend.exe`) bound to 127.0.0.1 only."""
from __future__ import annotations

import argparse

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import inference, jobs, monitoring, registry, tasks

app = FastAPI(title="AIModule Backend", version="2.0.0")

# The frontend is served from the Tauri WebView (and the Vite dev server during
# development); allow the loopback origins it uses.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tasks.router)
app.include_router(jobs.router)
app.include_router(inference.router)
app.include_router(registry.router)
app.include_router(monitoring.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def run() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8756)
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    run()
