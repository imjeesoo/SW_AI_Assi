"""
Session CRUD endpoints.
All routes require Bearer token auth.
"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import get_current_user
from app.logger import get_logger
from app.services.session import create_session, list_sessions, load_session

log = get_logger("router.sessions")
router = APIRouter(tags=["sessions"])


@router.get("/sessions")
async def get_sessions(_user=Depends(get_current_user)):
    """Return all sessions sorted by created_at DESC (summary only, no messages)."""
    sessions = await list_sessions()
    return sessions


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def new_session(_user=Depends(get_current_user)):
    """Create a new empty session and return it."""
    session = await create_session()
    log.info(f"SESSION_API_CREATE | id={session['id'][:8]}")
    return session


@router.get("/sessions/{session_id}")
async def get_session(session_id: str, _user=Depends(get_current_user)):
    """Return full session data including messages."""
    session = await load_session(session_id)
    if session is None:
        log.warning(f"SESSION_NOT_FOUND | id={session_id[:8] if len(session_id) >= 8 else session_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="세션을 찾을 수 없습니다.",
        )
    return session
