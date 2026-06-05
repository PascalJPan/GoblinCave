from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from auth import require_auth
from database import get_db
from scheduler import (
    peek_next_due,
    simulate_next_due,
    generate_next_after_completion,
    _prep_slots_for_chore,
    _compute_first_due,
    _next_due_strictly_after,
    resolve_assignee,
)

router = APIRouter(prefix="/chores", tags=["chores"])


class SlotIn(BaseModel):
    row_index: int = 0
    day_spec: str
    assignee: str
    alt_start: str = 'person1'


class InitialDone(BaseModel):
    completed_by: str
    completed_at: Optional[str] = None  # ISO date; defaults to today


class ChoreIn(BaseModel):
    name: str
    description: str = ''
    emoji: str = '🧹'
    category: str = 'general'
    schedule_type: str
    preferred_weekday: Optional[str] = None
    slots: list[SlotIn]
    initial_done: Optional[InitialDone] = None
    skip_next: bool = False


class PreviewIn(BaseModel):
    schedule_type: str
    preferred_weekday: Optional[str] = None
    slots: list[SlotIn]
    initial_done: InitialDone
    skip_next: bool = False


class LogIn(BaseModel):
    completed_by: str
    completed_at: Optional[str] = None  # ISO date; defaults to today


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
        "SELECT * FROM chore_slots WHERE chore_id = ? AND is_active = 1", (chore_id,)
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

    if body.initial_done:
        completed_at_date = _parse_date(body.initial_done.completed_at)
        ts = _completed_at_iso(body.initial_done.completed_at)
        _consume_next_as_early(db, chore_id, body.initial_done.completed_by, completed_at_date, ts)
        if body.skip_next:
            _consume_next_as_early(db, chore_id, body.initial_done.completed_by, completed_at_date, ts)

    row = db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
    return _chore_with_timing(db, row)


def _parse_date(s: Optional[str]) -> date:
    if not s:
        return date.today()
    return date.fromisoformat(s)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _completed_at_iso(supplied: Optional[str]) -> str:
    """If the user picked a date, store it as noon UTC on that date so the History page's
    'due X, same day HH:MM' display stays sensible. If not, use real now."""
    if not supplied:
        return _now_iso()
    return f"{supplied}T12:00:00+00:00"


def _consume_next_as_early(db, chore_id: int, completed_by: str, completed_at_date: date,
                            completed_at_iso: Optional[str] = None):
    """Materialize the next-regular instance for this chore and mark it as 'early' done."""
    chore = dict(db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone())
    slots = [dict(s) for s in db.execute(
        "SELECT * FROM chore_slots WHERE chore_id = ? AND is_active = 1", (chore_id,)
    ).fetchall()]
    if not slots:
        raise HTTPException(400, "Chore has no active slots")
    _prep_slots_for_chore(chore, slots)

    candidates = []
    for slot in slots:
        latest = db.execute(
            "SELECT * FROM chore_instances WHERE slot_id = ? AND kind != 'extra' "
            "ORDER BY due_date DESC LIMIT 1",
            (slot['id'],)
        ).fetchone()
        latest = dict(latest) if latest else None
        if latest is None:
            due = _compute_first_due(chore, slot)
            assignee = resolve_assignee(slot, None)
        elif latest['status'] == 'pending':
            due = date.fromisoformat(latest['due_date'])
            assignee = latest['assigned_to']
        else:
            last_due = date.fromisoformat(latest['due_date'])
            completed = date.fromisoformat((latest['completed_at'] or latest['due_date'])[:10])
            due = _next_due_strictly_after(chore, slot, last_due, max(last_due, completed))
            assignee = resolve_assignee(slot, latest)
        candidates.append((due, assignee, slot, latest))
    candidates.sort(key=lambda x: x[0])
    chosen_due, chosen_assignee, chosen_slot, chosen_latest = candidates[0]

    # Materialize the row if it doesn't exist
    existing = db.execute(
        "SELECT * FROM chore_instances WHERE slot_id = ? AND due_date = ? AND kind != 'extra'",
        (chosen_slot['id'], chosen_due.isoformat())
    ).fetchone()
    ts = completed_at_iso or _now_iso()
    if existing is None:
        db.execute(
            "INSERT INTO chore_instances (chore_id, slot_id, due_date, assigned_to, status, "
            "completed_by, completed_at, kind) VALUES (?,?,?,?,?,?,?,?)",
            (chore_id, chosen_slot['id'], chosen_due.isoformat(), chosen_assignee,
             'done', completed_by, ts, 'early')
        )
        db.commit()
        inst_row = dict(db.execute(
            "SELECT * FROM chore_instances WHERE slot_id = ? AND due_date = ? AND kind != 'extra'",
            (chosen_slot['id'], chosen_due.isoformat())
        ).fetchone())
    else:
        if existing['status'] == 'done':
            raise HTTPException(400, "Next instance is already completed")
        db.execute(
            "UPDATE chore_instances SET status='done', completed_by=?, completed_at=?, kind='early' "
            "WHERE id=?",
            (completed_by, ts, existing['id'])
        )
        db.commit()
        inst_row = dict(db.execute(
            "SELECT * FROM chore_instances WHERE id = ?", (existing['id'],)
        ).fetchone())

    # Seed the next cycle if it's already due
    generate_next_after_completion(db, chore, chosen_slot['id'], inst_row)
    return inst_row


@router.post("/preview-next")
def preview_next(body: PreviewIn, _=Depends(require_auth)):
    if body.schedule_type not in ('weekly', 'monthly', 'yearly'):
        raise HTTPException(400, "Invalid schedule_type")
    if not body.slots:
        raise HTTPException(400, "At least one slot required")

    chore = {
        'id': 0, 'name': '', 'description': '', 'emoji': '',
        'category': '', 'schedule_type': body.schedule_type,
        'preferred_weekday': body.preferred_weekday,
        'created_at': date.today().isoformat(),
    }
    slots = [{'id': i + 1, 'chore_id': 0, **s.model_dump(), 'is_active': 1}
             for i, s in enumerate(body.slots)]

    completed_date = _parse_date(body.initial_done.completed_at)
    consumed = [(body.initial_done.completed_by, completed_date)]
    if body.skip_next:
        consumed.append((body.initial_done.completed_by, completed_date))

    due, assignee = simulate_next_due(chore, slots, consumed)
    return {"next_due_date": due.isoformat(), "next_assignee": assignee}


@router.post("/{chore_id}/log-extra", status_code=201)
def log_extra(chore_id: int, body: LogIn, db=Depends(get_db), _=Depends(require_auth)):
    if body.completed_by not in ('person1', 'person2', 'together'):
        raise HTTPException(400, "completed_by must be person1, person2, or together")
    chore = db.execute("SELECT * FROM chores WHERE id = ? AND is_active = 1", (chore_id,)).fetchone()
    if not chore:
        raise HTTPException(404, "Chore not found")
    slot = db.execute(
        "SELECT * FROM chore_slots WHERE chore_id = ? AND is_active = 1 ORDER BY id LIMIT 1",
        (chore_id,)
    ).fetchone()
    if not slot:
        raise HTTPException(400, "Chore has no active slots")
    when = _parse_date(body.completed_at)
    db.execute(
        "INSERT INTO chore_instances (chore_id, slot_id, due_date, assigned_to, status, "
        "completed_by, completed_at, kind) VALUES (?,?,?,?,?,?,?,?)",
        (chore_id, slot['id'], when.isoformat(), body.completed_by, 'done',
         body.completed_by, _completed_at_iso(body.completed_at), 'extra')
    )
    db.commit()
    return {"ok": True}


@router.post("/{chore_id}/log-early", status_code=201)
def log_early(chore_id: int, body: LogIn, db=Depends(get_db), _=Depends(require_auth)):
    if body.completed_by not in ('person1', 'person2', 'together'):
        raise HTTPException(400, "completed_by must be person1, person2, or together")
    chore = db.execute("SELECT * FROM chores WHERE id = ? AND is_active = 1", (chore_id,)).fetchone()
    if not chore:
        raise HTTPException(404, "Chore not found")
    when = _parse_date(body.completed_at)
    _consume_next_as_early(db, chore_id, body.completed_by, when, _completed_at_iso(body.completed_at))
    return {"ok": True}


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

        existing = {
            (r['row_index'], r['day_spec']): dict(r)
            for r in db.execute(
                "SELECT * FROM chore_slots WHERE chore_id = ? AND is_active = 1", (chore_id,)
            ).fetchall()
        }
        new_keys = {(s.row_index, s.day_spec) for s in slots}

        # Remove slots that are no longer in the new schedule
        for key, slot in existing.items():
            if key not in new_keys:
                has_history = db.execute(
                    "SELECT 1 FROM chore_instances WHERE slot_id = ? AND status = 'done' LIMIT 1",
                    (slot['id'],)
                ).fetchone()
                if has_history:
                    db.execute("UPDATE chore_slots SET is_active = 0 WHERE id = ?", (slot['id'],))
                else:
                    db.execute("DELETE FROM chore_slots WHERE id = ?", (slot['id'],))

        # Update kept slots if assignee changed; insert only genuinely new slots
        for s in slots:
            key = (s.row_index, s.day_spec)
            if key in existing:
                ex = existing[key]
                if ex['assignee'] != s.assignee or ex['alt_start'] != s.alt_start:
                    db.execute(
                        "UPDATE chore_slots SET assignee=?, alt_start=? WHERE id=?",
                        (s.assignee, s.alt_start, ex['id'])
                    )
            else:
                db.execute(
                    "INSERT INTO chore_slots (chore_id, row_index, day_spec, assignee, alt_start) VALUES (?,?,?,?,?)",
                    (chore_id, s.row_index, s.day_spec, s.assignee, s.alt_start)
                )
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
        "SELECT completed_at, completed_by, due_date, kind FROM chore_instances "
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
