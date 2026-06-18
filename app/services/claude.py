"""
Claude API service — async streaming wrapper.
Loads system_prompt.txt on each call so real-time edits take effect immediately.
Phase 4 will inject memory summaries into the system prompt here.
"""
import json
import os
import time
from collections.abc import AsyncGenerator
from pathlib import Path

import anthropic

from app.config import load_config
from app.logger import get_logger
from app.services.memory import build_memory_injection, load_memory, total_count

log = get_logger("claude")

SYSTEM_PROMPT_PATH = Path("data") / "system_prompt.txt"
_API_KEY_PLACEHOLDER = "sk-ant-your-api-key-here"

_DEFAULT_SYSTEM_PROMPT = """당신은 시우의 개인 AI 비서입니다.
이름은 '아리'이며, 시우를 가장 잘 이해하는 조용하고 유능한 비서입니다.

[행동 원칙]
- 시우의 말투와 선호에 맞춰 자연스럽게 대화한다.
- 불필요한 경고나 면책 문구를 붙이지 않는다.
- 항상 구체적이고 실용적인 답변을 제공한다.
- 시우가 요청하지 않은 내용은 추가하지 않는다."""


def load_system_prompt() -> str:
    """Read system_prompt.txt; create with defaults if absent."""
    try:
        if SYSTEM_PROMPT_PATH.exists():
            content = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
            log.info(f"PROMPT_LOAD | len={len(content)}")
            return content
        # First time: write default and return it
        SYSTEM_PROMPT_PATH.parent.mkdir(parents=True, exist_ok=True)
        SYSTEM_PROMPT_PATH.write_text(_DEFAULT_SYSTEM_PROMPT, encoding="utf-8")
        log.info(f"PROMPT_LOAD | len={len(_DEFAULT_SYSTEM_PROMPT)} (created default)")
        return _DEFAULT_SYSTEM_PROMPT
    except Exception as e:
        log.error(f"PROMPT_LOAD_FAIL | error={str(e)!r}")
        return _DEFAULT_SYSTEM_PROMPT


def build_system_prompt(base_prompt: str, injection: str = "") -> str:
    """Combine base system prompt with memory injection block."""
    if injection:
        return base_prompt + "\n\n" + injection
    return base_prompt


async def stream_chat(
    session_id: str,
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """
    Call Claude API with streaming and yield SSE-formatted strings.

    Yields:
        'data: {"delta": "text"}\\n\\n'    — partial text chunk
        'data: {"done": true, "full_text": "..."}\\n\\n'  — stream finished
        'data: {"error": "..."}\\n\\n'     — error occurred
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    sid = session_id[:8]

    if not api_key or api_key == _API_KEY_PLACEHOLDER:
        msg = "ANTHROPIC_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요."
        log.error(f"STREAM_ERROR | session={sid} error='API_KEY_MISSING'")
        yield f'data: {json.dumps({"error": msg})}\n\n'
        return

    config = load_config()
    model = config.get("claude_model", "claude-sonnet-4-6")

    base_prompt = load_system_prompt()
    memory_data = await load_memory()
    injection = build_memory_injection(memory_data)
    mem_entries = total_count(memory_data)
    system_prompt = build_system_prompt(base_prompt, injection)

    log.info(f"PROMPT_BUILD | system_len={len(system_prompt)} memory_entries={mem_entries}")
    log.info(
        f"STREAM_START | session={sid} msg_count={len(messages)}"
        f" user_len={len(messages[-1]['content']) if messages else 0}"
    )

    api_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
    ]

    client = anthropic.AsyncAnthropic(api_key=api_key)
    start = time.monotonic()
    full_text = ""
    chunk_n = 0

    try:
        async with client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=api_messages,
        ) as stream:
            async for text in stream.text_stream:
                if not text:
                    continue
                full_text += text
                chunk_n += 1
                log.debug(f"STREAM_CHUNK | session={sid} chunk={chunk_n} len={len(text)}")
                yield f'data: {json.dumps({"delta": text})}\n\n'

        elapsed = time.monotonic() - start
        log.info(f"STREAM_END | session={sid} elapsed={elapsed:.2f}s resp_len={len(full_text)}")
        yield f'data: {json.dumps({"done": True, "full_text": full_text})}\n\n'

    except anthropic.APIStatusError as e:
        elapsed = time.monotonic() - start
        log.error(
            f"STREAM_ERROR | session={sid} error={str(e)!r}\n"
            f"TRACEBACK | status={e.status_code} message={e.message}"
        )
        yield f'data: {json.dumps({"error": f"Claude API 오류: {e.message}"})}\n\n'

    except anthropic.APIConnectionError as e:
        log.error(f"STREAM_ERROR | session={sid} error={str(e)!r}")
        yield f'data: {json.dumps({"error": "Claude API 연결 오류가 발생했습니다."})}\n\n'

    except Exception as e:
        log.error(f"STREAM_ERROR | session={sid} error={str(e)!r}")
        yield f'data: {json.dumps({"error": "서버 오류가 발생했습니다."})}\n\n'
