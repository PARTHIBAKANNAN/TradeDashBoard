"""
One-time logging setup, imported first thing in main.py. `journalctl -u
tradedashboard-backend` already captures stdout on the VM (used throughout
this project for diagnostics), so a plain StreamHandler is a drop-in
replacement for the print() calls it's replacing — no file handler needed.
"""

import logging


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
