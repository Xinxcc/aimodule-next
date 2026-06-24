"""Path helpers built on `pathlib.Path`.

`pathlib.Path` already joins with `/` and prints forward slashes via
`as_posix()`, so no manual backslash handling is needed.
"""
from __future__ import annotations

from pathlib import Path


def posix(path: str | Path) -> str:
    """Forward-slash string form. Replaces `str(...).replace("\\","/")`."""
    return Path(path).as_posix()


def from_module(module_file: str, *parts: str) -> Path:
    """Resolve a path relative to a module's location.

    Was: os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
    "..", ...)).replace("\\","/")   -- repeated in ~10 files.
    Now: from_module(__file__, "..", "config")
    """
    return Path(module_file).resolve().parent.joinpath(*parts).resolve()


__all__ = ["posix", "from_module"]
