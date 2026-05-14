import json
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from auth import require_auth
from database import get_db
from scheduler import peek_next_due

router = APIRouter(prefix="/chores", tags=["chores"])


class SlotIn(BaseModel):
    row_index: int = 0
    day_spec: str
    assignee: str
    alt_start: str = 'person1'


class ChoreIn(BaseModel):
    name: str
    description: str = ''
    emoji: str = '🧹'
    category: str = 'general'
    schedule_type: str
    preferred_weekday: Optional[str] = None
    slots: list[SlotIn]


class ChoreUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    emoji: Optional[str] = None
    category: Optional[str] = None
    schedule_type: Optional[str] = None
    preferred_weekday: Optional[str] = None
    slots: Optional[list[SlotIn]] = None


class ReorderIn(BaseModel):
    category: str
    ids: list[int]


def _chore_with_timing(db, row) -> dict:
    d = dict(row)
    chore_id = d['id']

    slots = db.execute(
        "SELECT * FROM chore_slots WHERE chore_id = ?", (chore_id,)
    ).fetchall()
    d['slots'] = [dict(s) for s in slots]

    last = db.execute(
        "SELECT completed_at, completed_by FROM chore_instances "
        "WHERE chore_id = ? AND status = 'done' ORDER BY completed_at DESC LIMIT 1",
        (chore_id,)
    ).fetchone()
    d['last_completed_at'] = last['completed_at'] if last else None
    d['last_completed_by'] = last['completed_by'] if last else None

    nxt = peek_next_due(db, d)
    d['next_due_date'] = nxt[0] if nxt else None
    d['next_assignee'] = nxt[1] if nxt else None

    return d


def _insert_slots(db, chore_id: int, slots: list[SlotIn]):
    for s in slots:
        db.execute(
            "INSERT INTO chore_slots (chore_id, row_index, day_spec, assignee, alt_start) VALUES (?,?,?,?,?)",
            (chore_id, s.row_index, s.day_spec, s.assignee, s.alt_start)
        )


@router.get("")
def list_chores(db=Depends(get_db), _=Depends(require_auth)):
    rows = db.execute(
        "SELECT * FROM chores WHERE is_active = 1 ORDER BY sort_order, name"
    ).fetchall()
    return [_chore_with_timing(db, r) for r in rows]


@router.post("", status_code=201)
def create_chore(body: ChoreIn, db=Depends(get_db), _=Depends(require_auth)):
    if body.schedule_type not in ('weekly', 'monthly', 'yearly'):
        raise HTTPException(400, "Invalid schedule_type")
    if not body.slots:
        raise HTTPException(400, "At least one slot required")
    max_order = db.execute(
        "SELECT COALESCE(MAX(sort_order),0) FROM chores WHERE category = ? AND is_active = 1",
        (body.category,)
    ).fetchone()[0]
    cur = db.execute(
        "INSERT INTO chores (name, description, emoji, category, sort_order, schedule_type, preferred_weekday) "
        "VALUES (?,?,?,?,?,?,?)",
        (body.name, body.description, body.emoji, body.category, max_order + 1,
         body.schedule_type, body.preferred_weekday)
    )
    chore_id = cur.lastrowid
    _insert_slots(db, chore_id, body.slots)
    db.commit()
    row = db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
    return _chore_with_timing(db, row)


@router.get("/{chore_id}")
def get_chore(chore_id: int, db=Depends(get_db), _=Depends(require_auth)):
    row = db.execute("SELECT * FROM chores WHERE id = ? AND is_active = 1", (chore_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Chore not found")
    return _chore_with_timing(db, row)


@router.put("/{chore_id}")
def update_chore(chore_id: int, body: ChoreUpdate, db=Depends(get_db), _=Depends(require_auth)):
    row = db.execute("SELECT * FROM chores WHERE id = ? AND is_active = 1", (chore_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Chore not found")
    slots = body.slots
    updates = body.model_dump(exclude_none=True, exclude={'slots'})
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        db.execute(f"UPDATE chores SET {set_clause} WHERE id = ?", list(updates.values()) + [chore_id])
    if slots is not None:
        db.execute("DELETE FROM chore_instances WHERE chore_id = ? AND status = 'pending'", (chore_id,))
        # Only delete slots with no done instances — slots with history must stay to preserve FK refs
        db.execute("""
            DELETE FROM chore_slots
            WHERE chore_id = ?
            AND id NOT IN (
                SELECT DISTINCT slot_id FROM chore_instances
                WHERE chore_id = ? AND status = 'done'
            )
        """, (chore_id, chore_id))
        _insert_slots(db, chore_id, slots)
    db.commit()
    row = db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
    return _chore_with_timing(db, row)


@router.delete("/{chore_id}")
def delete_chore(chore_id: int, db=Depends(get_db), _=Depends(require_auth)):
    db.execute("UPDATE chores SET is_active = 0 WHERE id = ?", (chore_id,))
    db.commit()
    return {"ok": True}


@router.get("/{chore_id}/stats")
def chore_stats(chore_id: int, db=Depends(get_db), _=Depends(require_auth)):
    chore = db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
    if not chore:
        raise HTTPException(404, "Chore not found")
    rows = db.execute(
        "SELECT completed_at, completed_by, due_date FROM chore_instances "
        "WHERE chore_id = ? AND status = 'done' ORDER BY completed_at ASC",
        (chore_id,)
    ).fetchall()
    completions = [dict(r) for r in rows]
    total = len(completions)
    by_person = {'person1': 0, 'person2': 0, 'together': 0}
    for c in completions:
        by_person[c['completed_by']] = by_person.get(c['completed_by'], 0) + 1
    avg_days = None
    if total >= 2:
        dates = [date.fromisoformat(c['due_date']) for c in completions]
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        avg_days = round(sum(gaps) / len(gaps), 1)
    return {"total": total, "by_person": by_person, "avg_days": avg_days, "completions": completions}


@router.patch("/reorder")
def reorder_chores(body: ReorderIn, db=Depends(get_db), _=Depends(require_auth)):
    for i, chore_id in enumerate(body.ids):
        db.execute("UPDATE chores SET sort_order = ? WHERE id = ?", (i, chore_id))
    db.commit()
    return {"ok": True}
