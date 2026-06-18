"""
Chat streaming endpoint.
POST /api/chat returns a text/event-stream SSE response.
Frontend reads via fetch() + response.body.getReader() (not EventSource).
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.auth import get_current_user
from app.logger import get_logger
from app.services.claude import stream_chat
from app.services.session import load_session, save_session

log = get_logger("router.chat")
router = APIRouter(tags=["chat"])

_TITLE_MAX_LEN = 20


class ChatRequest(BaseModel):
    session_id: str
    message: str


@router.post("/chat")
async def chat(
    request: Request,
    body: ChatRequest,
    _user=Depends(get_current_user),
):
    session = await load_session(body.session_id)
    if session is None:
        log.warning(f"CHAT_SESSION_NOT_FOUND | id={body.session_id[:8]}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="세션을 찾을 수 없습니다.",
        )

    sid = body.session_id[:8]

    # Append user message
    user_msg = {"role": "user", "content": body.message}
    session["messages"].append(user_msg)

    # Auto-set title from first user message
    if not session.get("title"):
        title = body.message[:_TITLE_MAX_LEN]
        session["title"] = title
        log.info(f"SESSION_TITLE_SET | id={sid} title={title!r}")

    messages = session["messages"]

    async def event_generator():
        full_text      = ""
        aborted        = False
        accumulated_len = 0  # tracks chars received for STREAM_ABORT log

        try:
            async for chunk in stream_chat(body.session_id, messages):
                # Check for client disconnect on each chunk
                if await request.is_disconnected():
                    log.warning(f"STREAM_ABORT | session={sid} resp_len={accumulated_len}")
                    aborted = True
                    break

                yield chunk

                # Parse our own SSE line to track accumulated text and full_text
                if chunk.startswith("data: "):
                    try:
                        payload = json.loads(chunk[6:])
                        if payload.get("delta"):
                            accumulated_len += len(payload["delta"])
                        elif payload.get("done"):
                            full_text = payload.get("full_text", "")
                    except (json.JSONDecodeError, KeyError):
                        pass

        except Exception as e:
            log.error(f"CHAT_GENERATOR_ERROR | session={sid} error={str(e)!r}")
            yield f'data: {json.dumps({"error": "스트리밍 중 오류가 발생했습니다."})}\n\n'

        finally:
            # Save assistant message only if we received a complete response
            if full_text and not aborted:
                session["messages"].append({"role": "assistant", "content": full_text})
                await save_session(session)
                log.info(f"CHAT_SAVED | session={sid} resp_len={len(full_text)}")
            elif aborted:
                # Save partial progress if user message was appended but no response saved
                # Roll back the user message so session stays consistent
                if session["messages"] and session["messages"][-1]["role"] == "user":
                    session["messages"].pop()
                    await save_session(session)
                    log.info(f"CHAT_ABORT_ROLLBACK | session={sid}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
