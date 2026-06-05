from fastapi import APIRouter, Depends, Query
from auth import require_auth
from database import get_db

router = APIRouter(prefix="/history", tags=["history"])


@router.get("")
def get_history(
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db=Depends(get_db),
    _=Depends(require_auth),
):
    rows = db.execute(
        """
        SELECT
            ci.id, ci.due_date, ci.assigned_to, ci.completed_by, ci.completed_at, ci.kind,
            c.name, c.emoji
        FROM chore_instances ci
        JOIN chores c ON c.id = ci.chore_id
        WHERE ci.status = 'done'
        ORDER BY ci.completed_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset)
    ).fetchall()
    total = db.execute(
        "SELECT COUNT(*) FROM chore_instances WHERE status = 'done'"
    ).fetchone()[0]
    return {"total": total, "items": [dict(r) for r in rows]}
