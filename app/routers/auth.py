from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.auth import create_access_token, verify_password
from app.config import load_config
from app.logger import get_logger

log = get_logger("router.auth")
router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
async def login(request: Request, body: LoginRequest):
    client_ip = request.client.host if request.client else "unknown"
    log.info(f"LOGIN_ATTEMPT | ip={client_ip}")

    config = load_config()

    if not verify_password(body.password, config["password_hash"]):
        log.warning(f"LOGIN_FAIL | ip={client_ip} reason=wrong_password")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="비밀번호가 올바르지 않습니다.",
        )

    token = create_access_token(
        jwt_secret=config["jwt_secret"],
        expire_hours=config.get("token_expire_hours", 24),
    )

    log.info(f"LOGIN_SUCCESS | ip={client_ip}")
    return {"access_token": token, "token_type": "bearer"}
