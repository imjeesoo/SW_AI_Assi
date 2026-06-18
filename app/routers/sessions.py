"""
Session CRUD endpoints + session end (summarize → memory).
All routes require Bearer token auth.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user
from app.config import load_config
from app.logger import get_logger
from app.services.memory import (
    add_summary,
    compress_memory,
    load_memory,
    save_memory,
    summarize_session,
    total_count,
)
from app.services.session import create_session, list_sessions, load_session, save_session

log = get_logger("router.sessions")
router = APIRouter(tags=["sessions"])


class EndSessionRequest(BaseModel):
    save_summary: bool


@router.get("/sessions")
async def get_sessions(_user=Depends(get_current_user)):
    """Return all sessions sorted by created_at DESC (summary only, no messages)."""
    sessions = await list_sessions()
    return sessions


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def new_session(_user=Depends(get_current_user)):
    """Create a new empty session. Response includes memory_count for frontend chip."""
    session = await create_session()
    log.info(f"SESSION_API_CREATE | id={session['id'][:8]}")
    # Include memory count so frontend can show memory chip
    mem_data = await load_memory()
    return {**session, "memory_count": total_count(mem_data), "message_count": 0}


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, _user=Depends(get_current_user)):
    """Return full session data including messages."""
    session = await load_session(session_id)
    if session is None:
        short = session_id[:8] if len(session_id) >= 8 else session_id
        log.warning(f"SESSION_NOT_FOUND | id={short}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="세션을 찾을 수 없습니다.",
        )
    return session


@router.post("/sessions/{session_id}/end")
async def end_session(
    session_id: str,
    body: EndSessionRequest,
    _user=Depends(get_current_user),
):
    """
    End a session.
    - save_summary=True  → Claude generates summary → saved to memory.json
                         → compression check → returns summarized status
    - save_summary=False → session marked done, no summarization
    """
    session = await load_session(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="세션을 찾을 수 없습니다.")

    sid = session_id[:8]

    if not body.save_summary:
        log.info(f"SESSION_END | id={sid} save_summary=false")
        return {"status": "ended"}

    messages = session.get("messages", [])
    if not messages:
        log.info(f"SESSION_END_EMPTY | id={sid} (no messages to summarize)")
        return {"status": "ended", "reason": "no_messages"}

    # Generate summary via Claude
    summary_text = await summarize_session(session_id, messages)

    # Persist summary to memory.json
    mem_id, mem_total = await add_summary(session_id, summary_text)

    # Check whether compression is needed
    config = load_config()
    threshold = config.get("memory_compress_threshold", 15)
    mem_data = await load_memory()

    if len(mem_data.get("summaries", [])) > threshold:
        mem_data = await compress_memory(mem_data)
        await save_memory(mem_data)
        mem_total = total_count(mem_data)

    # Mark session as summarized
    session["summarized"] = True
    await save_session(session)
    log.info(f"SESSION_END | id={sid} save_summary=true mem_id={mem_id}")

    return {
        "status": "summarized",
        "summary_id": mem_id,
        "summary": summary_text,
        "memory_count": mem_total,
    }
