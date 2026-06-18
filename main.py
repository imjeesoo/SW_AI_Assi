"""
SIWOO AI Assistant — Entry point.
Run: python main.py
"""
import getpass
import json
import os
import secrets
import socket
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ─── Data directories (must exist before logger initializes) ──────────────────
DATA_DIR = Path("data")
for _d in [DATA_DIR, DATA_DIR / "logs", DATA_DIR / "sessions"]:
    _d.mkdir(parents=True, exist_ok=True)

# ─── Logger (data/logs must exist first) ──────────────────────────────────────
from app.logger import get_logger, setup_logger

setup_logger()
log = get_logger("main")

# ─── Other imports ────────────────────────────────────────────────────────────
import bcrypt
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import load_config
from app.routers import auth as auth_router
from app.routers import sessions as sessions_router
from app.routers import chat as chat_router
from app.routers import memory as memory_router
from app.routers import config as config_router


# ─── 7-day log cleanup ────────────────────────────────────────────────────────

def _cleanup_old_logs() -> None:
    cutoff = datetime.now() - timedelta(days=7)
    deleted = []
    for f in (DATA_DIR / "logs").glob("*.log"):
        try:
            if datetime.strptime(f.stem, "%Y-%m-%d") < cutoff:
                f.unlink()
                deleted.append(f.name)
        except ValueError:
            pass
    log.info(f"LOG_CLEANUP | deleted={deleted} count={len(deleted)}")


# ─── First-run interactive setup ──────────────────────────────────────────────

def _first_run_setup() -> None:
    log.info("SETUP_START")
    print("\n[SETUP] data/config.json 이 없습니다. 초기 설정을 진행합니다.")

    while True:
        pw = getpass.getpass("비밀번호를 입력하세요: ")
        if not pw:
            print("[SETUP] 비밀번호를 입력해주세요.")
            continue
        pw2 = getpass.getpass("비밀번호를 다시 입력하세요: ")
        if pw != pw2:
            print("[SETUP] 비밀번호가 일치하지 않습니다. 다시 시도해주세요.")
            continue
        break

    cfg = {
        "password_hash": bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode(),
        "jwt_secret": secrets.token_hex(32),
        "token_expire_hours": 24,
        "claude_model": "claude-sonnet-4-6",
        "max_memory_entries": 20,
        "memory_compress_threshold": 15,
    }
    (DATA_DIR / "config.json").write_text(
        json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print("[SETUP] 설정 완료. 서버를 시작합니다.\n")
    log.info("SETUP_COMPLETE")


# ─── Local IP helper ──────────────────────────────────────────────────────────

def _local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ─── Module-level startup ─────────────────────────────────────────────────────

if not (DATA_DIR / "config.json").exists():
    _first_run_setup()

_cleanup_old_logs()

config = load_config()

# ─── FastAPI app ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    ip = _local_ip()
    model = config.get("claude_model", "claude-sonnet-4-6")
    log.info(f"SERVER_START | host=0.0.0.0 port=8000 model={model} local_ip={ip}")

    if not os.environ.get("ANTHROPIC_API_KEY", "").startswith("sk-ant-"):
        print("[경고] ANTHROPIC_API_KEY 가 설정되지 않았습니다. .env 파일을 확인해주세요.")

    print(f"\n  PC 접속:     http://localhost:8000")
    print(f"  모바일 접속: http://{ip}:8000  (같은 WiFi)\n")

    yield

    log.info("SERVER_STOP | signal=shutdown")


app = FastAPI(title="SIWOO AI", lifespan=lifespan)

# Routers (registered before static mount and catch-all)
app.include_router(auth_router.router, prefix="/api")
app.include_router(sessions_router.router, prefix="/api")
app.include_router(chat_router.router, prefix="/api")
app.include_router(memory_router.router, prefix="/api")
app.include_router(config_router.router, prefix="/api")

# Static files (/static/style.css, /static/app.js …)
app.mount("/static", StaticFiles(directory="static"), name="static")


# SPA catch-all — must be registered LAST so /api/* and /static/* are matched first
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_catch_all(full_path: str):
    return FileResponse(Path("static") / "index.html")


# ─── Dev entry point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")
