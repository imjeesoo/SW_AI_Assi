"""
System-prompt configuration endpoints.
GET /api/system-prompt  — read system_prompt.txt
PUT /api/system-prompt  — overwrite system_prompt.txt
All routes require Bearer token auth.
Logs: PROMPT_LOAD, PROMPT_LOAD_FAIL, PROMPT_SAVE, PROMPT_SAVE_FAIL (§14 Phase 5)
"""
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.auth import get_current_user
from app.logger import get_logger
from app.services.claude import SYSTEM_PROMPT_PATH, load_system_prompt

log = get_logger("router.config")
router = APIRouter(tags=["config"])


class SystemPromptRequest(BaseModel):
    content: str


@router.get("/system-prompt")
async def get_system_prompt(_user=Depends(get_current_user)):
    """
    Return the current system_prompt.txt content.
    If the file does not exist yet, creates it with the default prompt.
    """
    try:
        if not SYSTEM_PROMPT_PATH.exists():
            # Lazy-create with defaults (same as claude.py does on first chat)
            content = load_system_prompt()
            log.info(f"PROMPT_LOAD | len={len(content)} (created default)")
            return {"content": content}

        async with aiofiles.open(SYSTEM_PROMPT_PATH, "r", encoding="utf-8") as f:
            content = await f.read()
        log.info(f"PROMPT_LOAD | len={len(content)}")
        return {"content": content}

    except Exception as e:
        log.error(f"PROMPT_LOAD_FAIL | error={str(e)!r}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="시스템 프롬프트 파일을 읽을 수 없습니다.",
        )


@router.put("/system-prompt")
async def update_system_prompt(
    body: SystemPromptRequest,
    _user=Depends(get_current_user),
):
    """
    Overwrite system_prompt.txt with the provided content.
    Change takes effect on the next Claude API call (no cache).
    """
    try:
        SYSTEM_PROMPT_PATH.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(SYSTEM_PROMPT_PATH, "w", encoding="utf-8") as f:
            await f.write(body.content)
        log.info(f"PROMPT_SAVE | len={len(body.content)}")
        return {"status": "saved", "len": len(body.content)}

    except Exception as e:
        log.error(f"PROMPT_SAVE_FAIL | error={str(e)!r}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="시스템 프롬프트 저장에 실패했습니다.",
        )
