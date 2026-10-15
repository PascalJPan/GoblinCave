#!/usr/bin/env bash
# GoblinCave deploy — runs on the VPS. Triggered by .github/workflows/deploy.yml on every
# push to main (its SSH key is locked to exactly this script via a forced command in
# /root/.ssh/authorized_keys), or by hand: `bash /root/goblin-cave/deploy.sh`.
#
#   repo (/root/goblin-cave, origin/main) ──► backend  → /opt/backend/goblin-cave-backend
#                                         └─► frontend → npm build → /var/www/personal/GoblinCave/build
#
# Never touched: the live .env, the SQLite db (+ backups), the .venv, errors.log.
set -euo pipefail

REPO=/root/goblin-cave
LIVE=/opt/backend/goblin-cave-backend
WEB=/var/www/personal/GoblinCave/build
LOG=/var/log/goblin-cave-deploy.log

exec 9>/run/lock/goblin-cave-deploy.lock
flock -w 300 9                                  # one deploy at a time
exec > >(tee -a "$LOG") 2>&1
echo "── deploy $(date -Is)"

cd "$REPO"
git fetch -q origin main
git reset -q --hard origin/main
echo "at $(git log -1 --format='%h %s')"

# backend: code only. -rlt (no owner/perms) keeps the live dir owned by www-data, so the
# service can still write its db journal; --delete never removes excluded files.
cp -p "$LIVE/goblin_cave.db" "$LIVE/goblin_cave.db.bak-predeploy"   # one rolling backup
rsync -rlt --delete \
  --exclude .venv --exclude .env --exclude '*.db' --exclude '*.db-*' --exclude '*.db.bak*' \
  --exclude 'goblin_cave.db.bak-*' --exclude errors.log --exclude __pycache__ \
  backend/ "$LIVE/"
"$LIVE/.venv/bin/pip" install -q -r "$LIVE/requirements.txt"
systemctl restart goblin-cave

# frontend
cd "$REPO/frontend"
npm ci --no-audit --no-fund --loglevel=error || { npm cache clean --force; rm -rf node_modules; npm ci --no-audit --no-fund; }
npm run build --silent
mkdir -p "$WEB"
rsync -rlt --delete dist/ "$WEB/"

# the service must answer before we call it done
for i in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:8002/healthz >/dev/null; then echo "ok — goblin-cave healthy"; exit 0; fi
  sleep 1
done
echo "FAIL — goblin-cave not healthy after restart (journalctl -u goblin-cave)"; exit 1
