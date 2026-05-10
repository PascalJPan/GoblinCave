from datetime import date
from fastapi import APIRouter, Depends
from auth import require_auth
from database import get_db
from scheduler import generate_all_for_chore

router = APIRouter(tags=["dashboard"])


def _enrich(instance: dict, chore: dict) -> dict:
    today = date.today()
    due = date.fromisoformat(instance['due_date'])
    days_overdue = max(0, (today - due).days)
    return {
        **instance,
        'chore_name': chore['name'],
        'chore_emoji': chore['emoji'],
        'chore_description': chore['description'],
    }


@router.get("/dashboard")
def dashboard(db=Depends(get_db), _=Depends(require_auth)):
    chores = db.execute("SELECT * FROM chores WHERE is_active = 1").fetchall()

    person1_clouds = []
    person2_clouds = []
    today = date.today()

    for chore in chores:
        chore_dict = dict(chore)
        instances = generate_all_for_chore(db, chore_dict)
        for inst in instances:
            enriched = _enrich(inst, chore_dict)
            due = date.fromisoformat(inst['due_date'])
            enriched['days_overdue'] = max(0, (today - due).days)
            at = inst['assigned_to']
            if at == 'person1':
                person1_clouds.append(enriched)
            elif at == 'person2':
                person2_clouds.append(enriched)
            elif at == 'together':
                person1_clouds.append(enriched)
                person2_clouds.append(enriched)

    person1_clouds.sort(key=lambda x: x['days_overdue'], reverse=True)
    person2_clouds.sort(key=lambda x: x['days_overdue'], reverse=True)

    return {'person1': person1_clouds, 'person2': person2_clouds}
