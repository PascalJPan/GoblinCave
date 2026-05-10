from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from auth import require_auth
from database import get_db

router = APIRouter(prefix="/config", tags=["config"])


class ConfigUpdate(BaseModel):
    person1_name: Optional[str] = None
    person2_name: Optional[str] = None


@router.get("")
def get_config(db=Depends(get_db), _=Depends(require_auth)):
    rows = db.execute("SELECT key, value FROM config").fetchall()
    return {r['key']: r['value'] for r in rows}


@router.patch("")
def update_config(body: ConfigUpdate, db=Depends(get_db), _=Depends(require_auth)):
    if body.person1_name is not None:
        db.execute(
            "INSERT INTO config (key, value) VALUES ('person1_name', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (body.person1_name,)
        )
    if body.person2_name is not None:
        db.execute(
            "INSERT INTO config (key, value) VALUES ('person2_name', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (body.person2_name,)
        )
    db.commit()
    rows = db.execute("SELECT key, value FROM config").fetchall()
    return {r['key']: r['value'] for r in rows}
