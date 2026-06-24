# PyInstaller spec -> single offline backend executable shipped as a Tauri sidecar.
# Build (from services/backend/):
#   pyinstaller ../../packaging/aimodule-backend.spec
# Then copy dist/aimodule-backend(.exe) to
#   apps/desktop/src-tauri/binaries/aimodule-backend-<target-triple>(.exe)
# (Tauri requires the platform target triple suffix on externalBin sidecars.)

# -*- mode: python ; coding: utf-8 -*-
block_cipher = None

a = Analysis(
    ["app/main.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    # PyTorch / the compute backend pull in submodules PyInstaller can miss; collect them.
    hiddenimports=[
        "uvicorn.logging",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="aimodule-backend",
    console=True,
    onefile=True,
)
