"""
Memory CRUD endpoints.
GET    /api/memory         — list all summaries (date desc) + compressed_summary
DELETE /api/memory         — clear all memory
DELETE /api/memory/{id}    — delete single summary
All routes require Bearer token auth.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response

from app.auth import get_current_user
from app.logger import get_logger
from app.services.memory import clear_memory, delete_summary, load_memory, total_count

log = get_logger("router.memory")
router = APIRouter(tags=["memory"])


@router.get("/memory")
async def get_memory(_user=Depends(get_current_user)):
    """Return all summaries sorted by date descending, plus compressed_summary and total."""
    data = await load_memory()
    summaries = sorted(
        data.get("summaries", []),
        key=lambda s: s.get("date", ""),
        reverse=True,
    )
    return {
        "summaries": summaries,
        "compressed_summary": data.get("compressed_summary"),
        "total": total_count(data),
    }


@router.delete("/memory", status_code=status.HTTP_204_NO_CONTENT)
async def delete_all_memory(_user=Depends(get_current_user)):
    """Clear all memory entries (summaries + compressed_summary)."""
    await clear_memory()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/memory/{mem_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_memory_item(mem_id: str, _user=Depends(get_current_user)):
    """Delete a single summary entry by ID. Returns 404 if not found."""
    found = await delete_summary(mem_id)
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="해당 메모리 항목을 찾을 수 없습니다.",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
