import hmac
import os
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import Cookie, Header, HTTPException, status
from jose import JWTError, jwt

JWT_SECRET = os.getenv("JWT_SECRET", "changeme")
JWT_ALGORITHM = "HS256"
COOKIE_NAME = "goblin_session"
COOKIE_MAX_AGE = 60 * 60 * 24 * 90  # 90 days


def verify_password(plain: str) -> bool:
    pw_hash = os.getenv("PASSWORD_HASH", "")
    return bcrypt.checkpw(plain.encode(), pw_hash.encode())


def create_token() -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=90)
    return jwt.encode({"exp": exp}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _valid_api_token(authorization: str | None) -> bool:
    """Bearer token for server-to-server clients (GOBLIN_API_TOKEN). Off when unset."""
    expected = os.getenv("GOBLIN_API_TOKEN", "")
    if not expected or not authorization or not authorization.startswith("Bearer "):
        return False
    return hmac.compare_digest(authorization[len("Bearer "):].strip(), expected)


def require_auth(
    goblin_session: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
):
    if _valid_api_token(authorization):
        return
    if not goblin_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        jwt.decode(goblin_session, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
