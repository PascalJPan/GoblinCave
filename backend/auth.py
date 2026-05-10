import os
import bcrypt
from datetime import datetime, timedelta, timezone
from fastapi import Cookie, HTTPException, status
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


def require_auth(goblin_session: str | None = Cookie(default=None)):
    if not goblin_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        jwt.decode(goblin_session, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
