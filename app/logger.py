"""
Logging setup for SIWOO AI.
Format: [YYYY-MM-DD HH:MM:SS.mmm] [LEVEL] [file:line           ] EVENT | key=value
Daily rotating file in data/logs/YYYY-MM-DD.log + stdout.
"""
import logging
import os
import sys
from datetime import datetime
from pathlib import Path


class _Formatter(logging.Formatter):
    _LEVELS = {
        "DEBUG": "DEBUG",
        "INFO": "INFO ",
        "WARNING": "WARN ",
        "ERROR": "ERROR",
        "CRITICAL": "ERROR",
    }

    def format(self, record: logging.LogRecord) -> str:
        dt = datetime.fromtimestamp(record.created)
        ts = dt.strftime("%Y-%m-%d %H:%M:%S") + f".{int(record.msecs):03d}"
        lv = self._LEVELS.get(record.levelname, record.levelname[:5])
        loc = f"{record.filename}:{record.lineno}"
        return f"[{ts}] [{lv}] [{loc:<20}] {record.getMessage()}"


class _DailyFileHandler(logging.Handler):
    """Write to data/logs/YYYY-MM-DD.log, rotating at midnight.
    Opens and closes the file per emit() to avoid stale-handle issues
    when uvicorn or atexit closes file descriptors under us.
    """

    def __init__(self, log_dir: Path):
        super().__init__()
        self._log_dir = log_dir

    def emit(self, record: logging.LogRecord):
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            log_path = self._log_dir / f"{today}.log"
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(self.format(record) + "\n")
        except Exception:
            self.handleError(record)


_initialized = False


def setup_logger() -> None:
    global _initialized
    if _initialized:
        return
    _initialized = True

    level_name = os.environ.get("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger("siwoo")
    root.setLevel(level)
    root.propagate = False

    fmt = _Formatter()

    file_handler = _DailyFileHandler(Path("data/logs"))
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    root.addHandler(console)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"siwoo.{name}")
