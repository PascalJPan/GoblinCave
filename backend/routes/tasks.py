"""Flat, client-agnostic view of due tasks — for other apps and agents.

GET /tasks/due?person=person1   (or the configured person name)
Complete one with the existing POST /instances/{id}/complete.
"""
import re
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from auth import require_auth
from database import get_db
from scheduler import generate_all_for_chore

router = APIRouter(prefix="/tasks", tags=["tasks"])

_BULLET = re.compile(r"^[-*•]\s+(.+)")


def _split_description(text: str | None) -> tuple[list[str], list[str]]:
    """Same rule as the frontend: bullet lines are checklist items, the rest is notes."""
    subtasks, notes = [], []
    for line in (text or "").split("\n"):
        m = _BULLET.match(line)
        if m:
            subtasks.append(m.group(1).strip())
        elif line.strip():
            notes.append(line.strip())
    return subtasks, notes


def _resolve_person(db, person: str) -> str:
    if person in ("person1", "person2"):
        return person
    names = dict(db.execute(
        "SELECT key, value FROM config WHERE key IN ('person1_name','person2_name')"
    ).fetchall())
    for key in ("person1", "person2"):
        if names.get(f"{key}_name", "").strip().lower() == person.strip().lower():
            return key
    raise HTTPException(400, "person must be person1, person2, or a configured person name")


@router.get("/due")
def due_tasks(
    person: str = Query(..., description="person1 | person2 | configured name"),
    include_together: bool = True,
    days_ahead: int = Query(0, ge=0, le=60, description="0 = due today or overdue"),
    db=Depends(get_db),
    _=Depends(require_auth),
):
    who = _resolve_person(db, person)
    wanted = {who, "together"} if include_together else {who}
    today = date.today()
    horizon = today + timedelta(days=days_ahead)

    tasks = []
    for chore in db.execute("SELECT * FROM chores WHERE is_active = 1").fetchall():
        chore = dict(chore)
        for inst in generate_all_for_chore(db, chore):
            due = date.fromisoformat(inst["due_date"])
            if inst["status"] != "pending" or inst["assigned_to"] not in wanted or due > horizon:
                continue
            subtasks, notes = _split_description(chore["description"])
            tasks.append({
                "instance_id": inst["id"],
                "chore_id": chore["id"],
                "name": chore["name"],
                "emoji": chore["emoji"],
                "category": chore["category"],
                "due_date": inst["due_date"],
                "days_overdue": max(0, (today - due).days),
                "assigned_to": inst["assigned_to"],
                "subtasks": subtasks,
                "notes": notes,
            })

    tasks.sort(key=lambda t: (-t["days_overdue"], t["due_date"], t["name"]))
    return {"person": who, "date": today.isoformat(), "tasks": tasks}
