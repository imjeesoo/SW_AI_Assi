"""
Authentication helpers: bcrypt password hashing + PyJWT token management.
FastAPI dependency `get_current_user` validates Bearer tokens on protected routes.
"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import load_config
from app.logger import get_logger

log = get_logger("auth")
_bearer = HTTPBearer()


# ─── Password ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ─── JWT ──────────────────────────────────────────────────────────────────────

def create_access_token(jwt_secret: str, expire_hours: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=expire_hours)
    payload = {"sub": "siwoo", "exp": expire}
    token = jwt.encode(payload, jwt_secret, algorithm="HS256")
    log.info(f"TOKEN_ISSUED | expires={expire.strftime('%Y-%m-%dT%H:%M:%S')}")
    return token


def _decode_token(token: str, jwt_secret: str) -> dict:
    return jwt.decode(token, jwt_secret, algorithms=["HS256"])


# ─── FastAPI dependency ────────────────────────────────────────────────────────

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
) -> dict:
    config = load_config()
    token = credentials.credentials
    endpoint = request.url.path

    try:
        payload = _decode_token(token, config["jwt_secret"])
        return payload
    except jwt.ExpiredSignatureError:
        log.warning(f"TOKEN_EXPIRED | endpoint={endpoint}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="토큰이 만료되었습니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        log.warning(f"TOKEN_INVALID | endpoint={endpoint} reason=decode_error")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다.",
            headers={"WWW-Authenticate": "Bearer"},
        )
