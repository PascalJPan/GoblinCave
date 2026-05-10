from fastapi import APIRouter, HTTPException, Response, Depends
from pydantic import BaseModel
from auth import verify_password, create_token, require_auth, COOKIE_NAME, COOKIE_MAX_AGE

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
def login(body: LoginRequest, response: Response):
    if not verify_password(body.password):
        raise HTTPException(status_code=401, detail="Wrong password")
    token = create_token()
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/personal/GoblinCave",
    )
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/personal/GoblinCave")
    return {"ok": True}


@router.get("/me")
def me(_=Depends(require_auth)):
    return {"ok": True}
