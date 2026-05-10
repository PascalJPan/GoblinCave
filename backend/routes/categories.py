from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import require_auth
from database import get_db

router = APIRouter(prefix="/categories", tags=["categories"])


class CategoryIn(BaseModel):
    name: str


class ReorderIn(BaseModel):
    ids: list[int]


@router.get("")
def list_categories(db=Depends(get_db), _=Depends(require_auth)):
    rows = db.execute("SELECT * FROM categories ORDER BY sort_order, name").fetchall()
    return [dict(r) for r in rows]


@router.post("", status_code=201)
def create_category(body: CategoryIn, db=Depends(get_db), _=Depends(require_auth)):
    name = body.name.strip().lower()
    if not name:
        raise HTTPException(400, "Name required")
    max_order = db.execute("SELECT COALESCE(MAX(sort_order),0) FROM categories").fetchone()[0]
    try:
        cur = db.execute(
            "INSERT INTO categories (name, sort_order) VALUES (?, ?)",
            (name, max_order + 1)
        )
        db.commit()
    except Exception:
        raise HTTPException(409, "Category already exists")
    return dict(db.execute("SELECT * FROM categories WHERE id = ?", (cur.lastrowid,)).fetchone())


@router.patch("/reorder")
def reorder_categories(body: ReorderIn, db=Depends(get_db), _=Depends(require_auth)):
    for i, cat_id in enumerate(body.ids):
        db.execute("UPDATE categories SET sort_order = ? WHERE id = ?", (i, cat_id))
    db.commit()
    return {"ok": True}
