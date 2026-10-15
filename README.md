# GoblinCave

A shared household chore tracker for two people — drag clouds to mark tasks done, with alternating assignments and calendar-aware scheduling.

## Stack

- **Frontend**: React + Vite
- **Backend**: FastAPI + SQLite
- **Auth**: Cookie-based session (single shared password)

## Features

- Cloud cards per person, colour-coded by how overdue a task is
- Drag a cloud onto your character (or the ♡ zone) to mark it done
- Weekly, monthly, and yearly schedules with alternating or fixed assignments
- Checklist descriptions inside each task
- History and per-chore statistics
- Person names configurable via DB — no hardcoded names in the codebase

## Project structure

```
frontend/   React source (Vite)
backend/    FastAPI source + SQLite schema
```

## Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set GOBLIN_PASSWORD and SECRET_KEY
uvicorn main:app --host 127.0.0.1 --port 8002
```

### Frontend

```bash
cd frontend
npm install
npm run dev       # development
npm run build     # production build → dist/
```

## Configuration

Person names are stored in the `config` table:

```sql
INSERT INTO config (key, value) VALUES ('person1_name', 'Your Name');
INSERT INTO config (key, value) VALUES ('person2_name', 'Their Name');
```

## API for other apps

Set `GOBLIN_API_TOKEN` in `backend/.env` to let another server call the API with
`Authorization: Bearer <token>` (unset = cookie login only).

- `GET /tasks/due?person=<person1|person2|name>&include_together=true&days_ahead=0`
  — flat list of pending tasks due today or overdue, with `subtasks` (the bullet
  lines of the description) and `notes`.
- `POST /instances/{instance_id}/complete` with `{"completed_by": "person1"}` — tick one off.

## Deploy

**Automatic:** every push to `main` deploys (`.github/workflows/deploy.yml` → SSH → `deploy.sh` on the VPS).
The Action's key may run nothing but `deploy.sh` (forced command in the VPS's `authorized_keys`).
`deploy.sh` pulls `main`, syncs `backend/` into `/opt/backend/goblin-cave-backend` (never touching `.env`,
the database, its backups, `.venv` or logs — one rolling `goblin_cave.db.bak-predeploy`), installs requirements,
restarts `goblin-cave`, rebuilds the frontend into `/var/www/personal/GoblinCave/build`, and fails unless
`/healthz` answers. By hand on the VPS: `bash /root/goblin-cave/deploy.sh` · log: `/var/log/goblin-cave-deploy.log`.

