"""Image transforms + ring-buffer file management.

Replaces:
  * scripts/Tab2/function_resize_crop_scale.py  (verbatim resize/scale/crop block)
  * scripts/Tab2/function_create_template.py     (same block + a labelme launch)
  * scripts/file_manager.py                      (ring buffer, with the "/n" bug)

One implementation each, typed via the schema value objects (Crop/Size) instead
of positional left/top/right/bottom + stringly-typed sizes.
"""
from __future__ import annotations

import glob
import os
from pathlib import Path
from typing import TYPE_CHECKING, Iterable, Optional

if TYPE_CHECKING:  # PIL is a compute-layer dep; keep import optional for tooling.
    from PIL import Image as PILImage


def resize_crop_scale(
    image: "PILImage.Image",
    *,
    width: int,
    height: int,
    scale: float = 1.0,
    crop: Optional[tuple[int, int, int, int]] = None,
) -> "PILImage.Image":
    """Resize to (width, height), apply a uniform scale, then optionally crop.

    `crop` is (x, y, w, h) in pre-scale pixels; it is scaled with the image.
    Returns the transformed image; callers decide where to save it.
    """
    sw, sh = int(width * scale), int(height * scale)
    out = image.resize((int(width), int(height))).resize((sw, sh))
    if crop is not None:
        x, y, w, h = crop
        left, top = int(x * scale), int(y * scale)
        out = out.crop((left, top, left + int(w * scale), top + int(h * scale)))
    return out


def manage_ring_buffer(
    directory: str | Path,
    *,
    max_files: int,
    file_suffix: str = ".json",
    watch_suffixes: Iterable[str] = (".png", ".jpg", ".jpeg", ".gif", ".csv"),
) -> list[Path]:
    """Keep at most `max_files` primary files in `directory` (oldest removed
    first); for each removed file also remove sidecars with the same stem and
    any of `watch_suffixes`. Returns the list of removed paths.

    Cleanup of scripts/file_manager.py: pathlib, returns results instead of
    printing, and fixes the "/n" -> proper logging.
    """
    directory = Path(directory)
    if not directory.is_dir():
        return []

    primary = sorted(
        (Path(p) for p in glob.glob(str(directory / f"*{file_suffix}"))),
        key=lambda p: p.stat().st_ctime,
    )
    overflow = len(primary) - max_files
    if overflow <= 0:
        return []

    removed: list[Path] = []
    for path in primary[:overflow]:
        path.unlink(missing_ok=True)
        removed.append(path)
        for suffix in watch_suffixes:
            sidecar = directory / f"{path.stem}{suffix}"
            if sidecar.exists():
                sidecar.unlink()
                removed.append(sidecar)
    return removed


def launch_labelme(template_path: str | Path) -> None:
    """Open labelme on a template image. Was inlined in function_create_template.py."""
    import subprocess

    subprocess.run(["labelme", str(template_path)], check=False)


__all__ = ["resize_crop_scale", "manage_ring_buffer", "launch_labelme"]
