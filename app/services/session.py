"""
Session service — async CRUD for data/sessions/{uuid}.json.
All file I/O uses aiofiles to avoid blocking the event loop.
Path safety: session IDs are validated as UUID strings before path construction.
"""
import json
import re
import uuid
from datetime import datetime
from pathlib import Path

import aiofiles

from app.logger import get_logger

log = get_logger("session")

SESSIONS_DIR = Path("data") / "sessions"
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def _safe_path(session_id: str) -> Path:
    """Validate session_id is a UUID and return its file path (SEC-05)."""
    if not _UUID_RE.match(session_id):
        raise ValueError(f"Invalid session ID format: {session_id!r}")
    path = (SESSIONS_DIR / f"{session_id}.json").resolve()
    if not str(path).startswith(str(SESSIONS_DIR.resolve())):
        raise ValueError("Path traversal detected")
    return path


async def create_session() -> dict:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "title": "",
        "summarized": False,
        "messages": [],
    }
    await save_session(session)
    log.info(f"SESSION_CREATE | id={session_id[:8]}")
    return session


async def load_session(session_id: str) -> dict | None:
    try:
        path = _safe_path(session_id)
    except ValueError as e:
        log.error(f"SESSION_LOAD_FAIL | id={session_id[:8]} error={str(e)!r}")
        return None

    if not path.exists():
        return None

    try:
        async with aiofiles.open(path, "r", encoding="utf-8") as f:
            content = await f.read()
        session = json.loads(content)
        log.info(f"SESSION_LOAD | id={session_id[:8]} msg_count={len(session.get('messages', []))}")
        return session
    except Exception as e:
        log.error(f"SESSION_LOAD_FAIL | id={session_id[:8]} error={str(e)!r}")
        return None


async def save_session(session: dict) -> None:
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    sid = session["id"]
    try:
        path = _safe_path(sid)
        payload = json.dumps(session, indent=2, ensure_ascii=False)
        async with aiofiles.open(path, "w", encoding="utf-8") as f:
            await f.write(payload)
        log.info(
            f"SESSION_SAVE | id={sid[:8]} "
            f"msg_count={len(session.get('messages', []))} "
            f"bytes={len(payload.encode('utf-8'))}"
        )
    except Exception as e:
        log.error(f"SESSION_SAVE_FAIL | id={sid[:8]} error={str(e)!r}")
        raise


async def list_sessions() -> list:
    """Return session summary list sorted by created_at DESC."""
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    sessions = []
    for path in SESSIONS_DIR.glob("*.json"):
        try:
            async with aiofiles.open(path, "r", encoding="utf-8") as f:
                content = await f.read()
            data = json.loads(content)
            sessions.append({
                "id": data["id"],
                "created_at": data["created_at"],
                "title": data.get("title", ""),
                "summarized": data.get("summarized", False),
                "message_count": len(data.get("messages", [])),
            })
        except Exception:
            pass  # Skip malformed session files silently
    sessions.sort(key=lambda s: s["created_at"], reverse=True)
    log.info(f"SESSION_LIST | count={len(sessions)}")
    return sessions
