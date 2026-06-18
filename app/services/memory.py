"""
Memory service — manages data/memory.json.
Handles: load/save, session summarization, compression, injection into system prompt.
All file I/O uses aiofiles. Summarization uses non-streaming Anthropic API.
"""
import json
import os
import time
from datetime import datetime
from pathlib import Path

import aiofiles
import anthropic

from app.config import load_config
from app.logger import get_logger

log = get_logger("memory")

MEMORY_PATH = Path("data") / "memory.json"

# ─── Claude prompt templates (§8.5) ───────────────────────────────────────────

_SUMMARIZE_PROMPT = """다음은 시우와의 대화 내용입니다.
이 대화에서 시우에 대해 새로 알게 된 사실, 선호, 관심사, 특성을 불릿 포인트로 요약해줘.
이미 일반적으로 알려진 내용은 반복하지 말고, 이 대화에서 드러난 구체적인 정보에 집중해줘.
3~7개 불릿으로 간결하게 작성해줘.
답변은 반드시 한국어로, 불릿 포인트만 출력해줘 (추가 설명·인사말 없이).
형식 예시:
• 시우는 오전에 집중력이 높다고 언급했다.
• 코드 리뷰 시 주석보다 변수명으로 의도를 표현하는 방식을 선호한다."""

_COMPRESS_PROMPT = """다음은 시우에 대한 여러 대화 세션의 요약 목록입니다.
이것들을 하나의 통합된 요약으로 압축해줘.
중복 내용은 제거하고, 모순되는 내용은 최신 정보를 우선해줘.
10개 이하의 핵심 불릿으로 정리해줘.
답변은 반드시 한국어로, 불릿 포인트만 출력해줘 (추가 설명·인사말 없이)."""

_INJECT_TMPL = (
    "---\n"
    "[시우에 대해 알고 있는 것 — 이전 {n}개 대화에서 누적]\n"
    "{bullets}\n"
    "---"
)


# ─── CRUD ─────────────────────────────────────────────────────────────────────

async def load_memory() -> dict:
    """Load memory.json. Returns empty structure if absent or corrupt."""
    if not MEMORY_PATH.exists():
        log.info("MEMORY_LOAD_EMPTY")
        return {"summaries": [], "compressed_summary": None}
    try:
        async with aiofiles.open(MEMORY_PATH, "r", encoding="utf-8") as f:
            content = await f.read()
        data = json.loads(content)
        count = len(data.get("summaries", []))
        log.info(f"MEMORY_LOAD | count={count}")
        return data
    except Exception as e:
        log.error(f"MEMORY_LOAD_FAIL | error={str(e)!r}")
        return {"summaries": [], "compressed_summary": None}


async def save_memory(data: dict) -> None:
    """Persist memory.json and log MEMORY_SAVE."""
    MEMORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, indent=2, ensure_ascii=False)
    async with aiofiles.open(MEMORY_PATH, "w", encoding="utf-8") as f:
        await f.write(payload)
    count = len(data.get("summaries", []))
    log.info(f"MEMORY_SAVE | count={count} bytes={len(payload.encode('utf-8'))}")


# ─── ID helpers ───────────────────────────────────────────────────────────────

def _next_mem_id(data: dict) -> str:
    """Generate next sequential memory ID (mem_001, mem_002 …)."""
    max_n = 0
    for s in data.get("summaries", []):
        try:
            n = int(s["id"].split("_")[1])
            max_n = max(max_n, n)
        except (IndexError, ValueError, KeyError):
            pass
    return f"mem_{max_n + 1:03d}"


def total_count(data: dict) -> int:
    """Total logical memory count (individual + 1 if compressed exists)."""
    return len(data.get("summaries", [])) + (1 if data.get("compressed_summary") else 0)


# ─── System prompt injection (§8.5) ───────────────────────────────────────────

def build_memory_injection(data: dict) -> str:
    """Return the memory injection block to append to system_prompt.txt."""
    summaries = data.get("summaries", [])
    compressed = data.get("compressed_summary")

    if not summaries and not compressed:
        return ""

    bullets: list[str] = []
    if compressed:
        for line in compressed.strip().splitlines():
            if line.strip():
                bullets.append(line.strip())
    for s in summaries:
        for line in s.get("content", "").strip().splitlines():
            if line.strip():
                bullets.append(line.strip())

    if not bullets:
        return ""

    n = len(summaries) + (1 if compressed else 0)
    return _INJECT_TMPL.format(n=n, bullets="\n".join(bullets))


# ─── Summarization ────────────────────────────────────────────────────────────

async def summarize_session(session_id: str, messages: list[dict]) -> str:
    """
    Call Claude (non-streaming) to summarize a session.
    Returns bullet-point summary text.
    """
    sid = session_id[:8]
    msg_count = len(messages)
    log.info(f"MEMORY_SUMMARIZE_START | session={sid} msg_count={msg_count}")
    start = time.monotonic()

    conv_lines = []
    for m in messages:
        role = "시우" if m["role"] == "user" else "아리"
        conv_lines.append(f"{role}: {m['content']}")
    conversation = "\n".join(conv_lines)

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    config = load_config()
    model = config.get("claude_model", "claude-sonnet-4-6")

    client = anthropic.AsyncAnthropic(api_key=api_key)
    try:
        response = await client.messages.create(
            model=model,
            max_tokens=512,
            system=_SUMMARIZE_PROMPT,
            messages=[{"role": "user", "content": conversation}],
        )
        summary = response.content[0].text.strip()
        elapsed = time.monotonic() - start
        log.info(
            f"MEMORY_SUMMARIZE_END | session={sid} "
            f"summary_len={len(summary)} elapsed={elapsed:.2f}s"
        )
        return summary
    except Exception as e:
        elapsed = time.monotonic() - start
        log.error(f"MEMORY_SUMMARIZE_ERROR | session={sid} error={str(e)!r}")
        raise


async def add_summary(session_id: str, content: str) -> tuple[str, int]:
    """
    Append a new summary entry to memory.json.
    Returns (mem_id, new_total_count).
    """
    data = await load_memory()
    mem_id = _next_mem_id(data)
    data["summaries"].append({
        "id": mem_id,
        "session_id": session_id,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "content": content,
    })
    await save_memory(data)
    return mem_id, total_count(data)


# ─── Compression ──────────────────────────────────────────────────────────────

async def compress_memory(data: dict) -> dict:
    """
    Compress old summaries via Claude when threshold is exceeded.
    Keeps the most recent summaries intact; folds older ones into compressed_summary.
    """
    summaries = data.get("summaries", [])
    before_count = len(summaries)
    existing_compressed = data.get("compressed_summary")

    log.info(f"MEMORY_COMPRESS_START | before_count={before_count}")
    start = time.monotonic()

    config = load_config()
    threshold = config.get("memory_compress_threshold", 15)
    keep_n = max(3, threshold // 3)

    to_compress = summaries[:-keep_n] if len(summaries) > keep_n else summaries
    to_keep = summaries[-keep_n:] if len(summaries) > keep_n else []

    parts: list[str] = []
    if existing_compressed:
        parts.append(f"[이전 압축 요약]\n{existing_compressed}")
    for i, s in enumerate(to_compress):
        parts.append(f"[세션 {i+1} — {s.get('date', '?')}]\n{s.get('content', '')}")
    compression_input = "\n\n".join(parts)

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    model = config.get("claude_model", "claude-sonnet-4-6")
    client = anthropic.AsyncAnthropic(api_key=api_key)

    response = await client.messages.create(
        model=model,
        max_tokens=1024,
        system=_COMPRESS_PROMPT,
        messages=[{"role": "user", "content": compression_input}],
    )
    new_compressed = response.content[0].text.strip()

    new_data = {
        "summaries": to_keep,
        "compressed_summary": new_compressed,
    }

    elapsed = time.monotonic() - start
    log.info(
        f"MEMORY_COMPRESS_END | before={before_count} "
        f"after={len(to_keep)} elapsed={elapsed:.2f}s"
    )
    return new_data


# ─── Delete helpers (used in Phase 5) ─────────────────────────────────────────

async def delete_summary(mem_id: str) -> bool:
    """Delete a single summary entry. Returns True if found and deleted."""
    data = await load_memory()
    before = len(data["summaries"])
    data["summaries"] = [s for s in data["summaries"] if s["id"] != mem_id]
    if len(data["summaries"]) == before:
        return False
    await save_memory(data)
    log.info(f"MEMORY_DELETE | mem_id={mem_id}")
    return True


async def clear_memory() -> int:
    """Delete all memory entries. Returns count of cleared entries."""
    data = await load_memory()
    cleared = len(data.get("summaries", [])) + (1 if data.get("compressed_summary") else 0)
    new_data = {"summaries": [], "compressed_summary": None}
    await save_memory(new_data)
    log.info(f"MEMORY_CLEAR | cleared_count={cleared}")
    return cleared
