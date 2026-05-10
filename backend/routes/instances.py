from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from auth import require_auth
from database import get_db
from scheduler import generate_next_after_completion

router = APIRouter(prefix="/instances", tags=["instances"])


class CompleteBody(BaseModel):
    completed_by: str  # 'pascal' | 'marina'


@router.post("/{instance_id}/complete")
def complete_instance(
    instance_id: int,
    body: CompleteBody,
    db=Depends(get_db),
    _=Depends(require_auth),
):
    if body.completed_by not in ('person1', 'person2', 'together'):
        raise HTTPException(400, "completed_by must be person1, person2, or together")

    row = db.execute(
        "SELECT * FROM chore_instances WHERE id = ?", (instance_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Instance not found")
    if row['status'] == 'done':
        raise HTTPException(400, "Already completed")

    now = datetime.now(timezone.utc).isoformat()
    db.execute(
        "UPDATE chore_instances SET status='done', completed_by=?, completed_at=? WHERE id=?",
        (body.completed_by, now, instance_id)
    )
    db.commit()

    chore = db.execute("SELECT * FROM chores WHERE id = ?", (row['chore_id'],)).fetchone()
    if chore and chore['is_active']:
        generate_next_after_completion(db, dict(chore), row['slot_id'], dict(row))

    return {"ok": True, "completed_by": body.completed_by}


@router.delete("/{instance_id}/complete")
def uncomplete_instance(instance_id: int, db=Depends(get_db), _=Depends(require_auth)):
    row = db.execute(
        "SELECT * FROM chore_instances WHERE id = ?", (instance_id,)
    ).fetchone()
    if not row:
        raise HTTPException(404, "Instance not found")
    if row['status'] != 'done':
        raise HTTPException(400, "Not completed")

    db.execute(
        "DELETE FROM chore_instances WHERE slot_id = ? AND due_date > ? AND status = 'pending'",
        (row['slot_id'], row['due_date'])
    )
    db.execute(
        "UPDATE chore_instances SET status='pending', completed_by=NULL, completed_at=NULL WHERE id=?",
        (instance_id,)
    )
    db.commit()
    return {"ok": True}
