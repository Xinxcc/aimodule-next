"""Centralized logging + typed error codes.

Provides an `ErrorCode` enum and a module-level logger singleton; callers do
`from aimodule_core.log import logger`.
"""
from __future__ import annotations

import logging
from enum import IntEnum

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger("aimodule")


class ErrorCode(IntEnum):
    """Named error codes used across the compute layer."""

    READ_CSV = 10
    PLOT_FIGURE = 11
    SAVE_IMAGE = 12
    READ_CONFIG = 16
    LOAD_MODEL = 20
    INFERENCE = 21
    TRAIN = 35
    EXPORT = 34
    CREATE_LAYOUT = 41


__all__ = ["logger", "ErrorCode"]
