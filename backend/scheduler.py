"""
Per-slot instance generation. Each chore_slot generates its own independent
stream of chore_instances. Slots within the same chore do not affect each other
(except alternating slots track their own flip history).
"""
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta

WEEKDAY_MAP = {'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6}
MONTH_MAP = {
    'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
    'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
}


def monday_of_week(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _first_weekday_on_or_after(d: date, weekday: int) -> date:
    delta = (weekday - d.weekday()) % 7
    return d + timedelta(days=delta)


# ── Weekly ────────────────────────────────────────────────────────────────────

def first_weekly_due(created_date: date, row_index: int, cycle_length: int, day_spec: str) -> date:
    ref_monday = monday_of_week(created_date)
    day_offset = WEEKDAY_MAP[day_spec]
    w = row_index
    due = ref_monday + timedelta(days=w * 7 + day_offset)
    while due < created_date:
        w += cycle_length
        due = ref_monday + timedelta(days=w * 7 + day_offset)
    return due


def next_weekly_due(last_due: date, cycle_length: int) -> date:
    return last_due + timedelta(weeks=cycle_length)


# ── Monthly ───────────────────────────────────────────────────────────────────

def _monthly_raw(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def first_monthly_due(created_date: date, day: int, preferred_weekday: str | None) -> date:
    # Try the current month first; if preferred-weekday adjustment still lands in the past,
    # roll forward month by month until we find a future date.
    for offset in range(0, 13):
        ref = created_date + relativedelta(months=offset)
        d = _monthly_raw(ref.year, ref.month, day)
        if d is None:
            continue
        if preferred_weekday:
            d = _first_weekday_on_or_after(d, WEEKDAY_MAP[preferred_weekday])
        if d >= created_date:
            return d
    raise ValueError(f"Could not find a future monthly date for day={day}")


def next_monthly_due(last_due: date, day: int, preferred_weekday: str | None) -> date:
    nm = last_due + relativedelta(months=1)
    d = _monthly_raw(nm.year, nm.month, day)
    while d is None:
        nm = nm + relativedelta(months=1)
        d = _monthly_raw(nm.year, nm.month, day)
    if preferred_weekday:
        d = _first_weekday_on_or_after(d, WEEKDAY_MAP[preferred_weekday])
    return d


# ── Yearly ────────────────────────────────────────────────────────────────────

def first_yearly_due(created_date: date, month_spec: str, preferred_weekday: str | None) -> date:
    month = MONTH_MAP[month_spec]
    for year_offset in (0, 1):
        d = date(created_date.year + year_offset, month, 1)
        if preferred_weekday:
            d = _first_weekday_on_or_after(d, WEEKDAY_MAP[preferred_weekday])
        if d >= created_date:
            return d
    return d


def next_yearly_due(last_due: date, month_spec: str, preferred_weekday: str | None) -> date:
    month = MONTH_MAP[month_spec]
    d = date(last_due.year + 1, month, 1)
    if preferred_weekday:
        d = _first_weekday_on_or_after(d, WEEKDAY_MAP[preferred_weekday])
    return d


# ── Assignee resolution ───────────────────────────────────────────────────────

def flip(person: str) -> str:
    return 'person2' if person == 'person1' else 'person1'


def resolve_assignee(slot: dict, last_instance: dict | None) -> str:
    """For alternating slots, `last_instance` should be the chore-wide latest alternating
    predecessor (see `_chore_alt_predecessor`), not the per-slot latest — alternation is
    shared across all alternating slots of the same chore."""
    assignee = slot['assignee']
    if assignee == 'together':
        return 'together'
    if assignee in ('person1', 'person2'):
        return assignee
    # alternating: flip based on who actually did it; 'together' counts as the assigned person fulfilling their turn
    if last_instance is None:
        return slot['alt_start']
    doer = last_instance.get('completed_by')
    if doer not in ('person1', 'person2'):
        doer = last_instance['assigned_to']
    return flip(doer)


def _chore_alt_predecessor(conn, chore_id: int, before_due: date | None = None) -> dict | None:
    """Return the most recent (regular, non-extra) instance of any alternating slot of this
    chore, optionally restricted to due_date < `before_due`."""
    query = """
        SELECT ci.* FROM chore_instances ci
        JOIN chore_slots cs ON ci.slot_id = cs.id
        WHERE cs.chore_id = ? AND cs.assignee = 'alternating' AND ci.kind != 'extra'
    """
    params: list = [chore_id]
    if before_due is not None:
        query += " AND ci.due_date < ?"
        params.append(before_due.isoformat())
    query += " ORDER BY ci.due_date DESC, ci.id DESC LIMIT 1"
    row = conn.execute(query, params).fetchone()
    return dict(row) if row else None


def _resolve_assignee_chorewide(conn, chore_id: int, slot: dict,
                                  per_slot_latest: dict | None, my_due: date | None) -> str:
    """Helper that uses chore-wide predecessor for alternating slots, per-slot for others."""
    if slot['assignee'] == 'alternating':
        pred = _chore_alt_predecessor(conn, chore_id, my_due)
        return resolve_assignee(slot, pred)
    return resolve_assignee(slot, per_slot_latest)


# ── Core generation ───────────────────────────────────────────────────────────

def _compute_first_due(chore: dict, slot: dict) -> date:
    created = date.fromisoformat(chore['created_at'][:10])
    # Use today as the lower bound so slots added after the chore was created
    # produce their first instance on the next future cycle, not in the past.
    ref = max(created, date.today())
    stype = chore['schedule_type']
    pref = chore['preferred_weekday']

    if stype == 'weekly':
        return first_weekly_due(ref, slot['row_index'], slot['_cycle_length'], slot['day_spec'])
    elif stype == 'monthly':
        return first_monthly_due(ref, int(slot['day_spec']), pref)
    elif stype == 'yearly':
        return first_yearly_due(ref, slot['day_spec'], pref)
    raise ValueError(f"Unknown schedule_type: {stype}")


def _compute_next_due(chore: dict, slot: dict, last_due: date) -> date:
    stype = chore['schedule_type']
    pref = chore['preferred_weekday']

    if stype == 'weekly':
        return next_weekly_due(last_due, slot['_cycle_length'])
    elif stype == 'monthly':
        return next_monthly_due(last_due, int(slot['day_spec']), pref)
    elif stype == 'yearly':
        return next_yearly_due(last_due, slot['day_spec'], pref)
    raise ValueError(f"Unknown schedule_type: {stype}")


def _completion_date(instance: dict) -> date:
    ca = instance.get('completed_at')
    if ca:
        return date.fromisoformat(ca[:10])
    return date.fromisoformat(instance['due_date'])


def _next_due_strictly_after(chore: dict, slot: dict, last_due: date, after: date) -> date:
    # Skip over missed cycles instead of backfilling overdue instances.
    nd = _compute_next_due(chore, slot, last_due)
    while nd <= after:
        nd = _compute_next_due(chore, slot, nd)
    return nd


def generate_for_slot(conn, chore: dict, slot: dict) -> dict | None:
    """
    Ensure the slot has an up-to-date instance. Returns the instance to show
    (pending, due <= today) or None.
    """
    today = date.today()
    slot_id = slot['id']

    latest = conn.execute(
        "SELECT * FROM chore_instances WHERE slot_id = ? AND kind != 'extra' ORDER BY due_date DESC LIMIT 1",
        (slot_id,)
    ).fetchone()
    latest = dict(latest) if latest else None

    if latest is None:
        due = _compute_first_due(chore, slot)
        assigned = _resolve_assignee_chorewide(conn, chore['id'], slot, None, due)
        _upsert_instance(conn, chore['id'], slot_id, due, assigned)
        if due <= today:
            return _fetch(conn, slot_id, due)
        return None

    last_due = date.fromisoformat(latest['due_date'])

    if latest['status'] == 'pending':
        if last_due <= today:
            return dict(latest)
        return None

    # Latest is done — compute next
    completed = _completion_date(latest)
    next_due = _next_due_strictly_after(chore, slot, last_due, max(last_due, completed))
    if next_due <= today:
        assigned = _resolve_assignee_chorewide(conn, chore['id'], slot, latest, next_due)
        _upsert_instance(conn, chore['id'], slot_id, next_due, assigned)
        return _fetch(conn, slot_id, next_due)
    return None


def _upsert_instance(conn, chore_id: int, slot_id: int, due: date, assigned: str):
    conn.execute(
        "INSERT OR IGNORE INTO chore_instances (chore_id, slot_id, due_date, assigned_to) VALUES (?, ?, ?, ?)",
        (chore_id, slot_id, due.isoformat(), assigned)
    )
    conn.commit()


def _fetch(conn, slot_id: int, due: date) -> dict | None:
    row = conn.execute(
        "SELECT * FROM chore_instances WHERE slot_id = ? AND due_date = ?",
        (slot_id, due.isoformat())
    ).fetchone()
    return dict(row) if row else None


def generate_all_for_chore(conn, chore: dict) -> list[dict]:
    """Returns all instances that should appear on the dashboard for this chore."""
    slots = conn.execute(
        "SELECT * FROM chore_slots WHERE chore_id = ? AND is_active = 1",
        (chore['id'],)
    ).fetchall()
    slots = [dict(s) for s in slots]

    # Compute cycle_length for weekly chores
    if chore['schedule_type'] == 'weekly' and slots:
        cycle_length = max(s['row_index'] for s in slots) + 1
    else:
        cycle_length = 1

    for s in slots:
        s['_cycle_length'] = cycle_length

    results = []
    for slot in slots:
        inst = generate_for_slot(conn, chore, slot)
        if inst:
            results.append(inst)
    return results


def peek_next_due(conn, chore: dict) -> tuple | None:
    """
    Return (due_date_iso, assignee) of the soonest upcoming instance across all slots,
    computing from the schedule even if no DB instance exists yet.
    """
    slots = [dict(s) for s in conn.execute(
        "SELECT * FROM chore_slots WHERE chore_id = ? AND is_active = 1", (chore['id'],)
    ).fetchall()]
    if not slots:
        return None

    if chore['schedule_type'] == 'weekly':
        cycle_length = max(s['row_index'] for s in slots) + 1
    else:
        cycle_length = 1
    for s in slots:
        s['_cycle_length'] = cycle_length

    candidates = []
    for slot in slots:
        latest = conn.execute(
            "SELECT * FROM chore_instances WHERE slot_id = ? AND kind != 'extra' ORDER BY due_date DESC LIMIT 1",
            (slot['id'],)
        ).fetchone()
        latest = dict(latest) if latest else None

        if latest is None:
            due = _compute_first_due(chore, slot)
            assignee = _resolve_assignee_chorewide(conn, chore['id'], slot, None, due)
        elif latest['status'] == 'pending':
            due = date.fromisoformat(latest['due_date'])
            assignee = latest['assigned_to']
        else:
            last_due = date.fromisoformat(latest['due_date'])
            completed = _completion_date(latest)
            due = _next_due_strictly_after(chore, slot, last_due, max(last_due, completed))
            assignee = _resolve_assignee_chorewide(conn, chore['id'], slot, latest, due)

        candidates.append((due, assignee))

    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    best_due, best_assignee = candidates[0]
    return best_due.isoformat(), best_assignee


def _prep_slots_for_chore(chore: dict, slots: list[dict]) -> list[dict]:
    if chore['schedule_type'] == 'weekly' and slots:
        cycle_length = max(s['row_index'] for s in slots) + 1
    else:
        cycle_length = 1
    for s in slots:
        s['_cycle_length'] = cycle_length
    return slots


def _sim_candidate(slot: dict, slot_state: dict, chore_alt_pred: dict | None,
                    chore: dict) -> tuple[date, str]:
    if slot_state['latest_due'] is None:
        due = _compute_first_due(chore, slot)
    else:
        due = _next_due_strictly_after(
            chore, slot, slot_state['latest_due'],
            max(slot_state['latest_due'], slot_state['latest_done_at'])
        )
    if slot['assignee'] == 'alternating':
        assignee = resolve_assignee(slot, chore_alt_pred)
    else:
        assignee = resolve_assignee(slot, None)  # fixed slot: ignores history
    return due, assignee


def simulate_next_due(chore: dict, slots: list[dict],
                      consumed: list[tuple[str, date]]) -> tuple[date, str]:
    """
    Replay a series of pretend-completions (completed_by, completed_at_date) against the
    soonest-upcoming slot each time, then return the next (due_date, assignee) that would appear.
    Alternating slots share a chore-wide flip stream.
    """
    slots = _prep_slots_for_chore(chore, list(slots))
    slot_states = {s['id']: {'latest_due': None, 'latest_done_at': None}
                    for s in slots}
    chore_alt_pred: dict | None = None

    for completed_by, completed_at in consumed:
        candidates = [(s, *_sim_candidate(s, slot_states[s['id']], chore_alt_pred, chore))
                      for s in slots]
        candidates.sort(key=lambda x: x[1])
        chosen_slot, chosen_due, chosen_assignee = candidates[0]
        slot_states[chosen_slot['id']] = {
            'latest_due': chosen_due, 'latest_done_at': completed_at,
        }
        if chosen_slot['assignee'] == 'alternating':
            chore_alt_pred = {
                'assigned_to': chosen_assignee, 'completed_by': completed_by,
                'due_date': chosen_due.isoformat(),
                'completed_at': completed_at.isoformat() + 'T00:00:00',
            }

    candidates = [_sim_candidate(s, slot_states[s['id']], chore_alt_pred, chore) for s in slots]
    candidates.sort(key=lambda x: x[0])
    return candidates[0]


def generate_next_after_completion(conn, chore: dict, slot_id: int, last_instance: dict):
    """Called after a completion to eagerly generate the next instance."""
    slots = [dict(s) for s in conn.execute(
        "SELECT * FROM chore_slots WHERE chore_id = ? AND is_active = 1", (chore['id'],)
    ).fetchall()]

    if chore['schedule_type'] == 'weekly' and slots:
        cycle_length = max(s['row_index'] for s in slots) + 1
    else:
        cycle_length = 1

    slot = next((s for s in slots if s['id'] == slot_id), None)
    if not slot:
        return
    slot['_cycle_length'] = cycle_length

    last_due = date.fromisoformat(last_instance['due_date'])
    completed = _completion_date(last_instance)
    next_due = _next_due_strictly_after(chore, slot, last_due, max(last_due, completed))
    today = date.today()
    if next_due <= today:
        assigned = _resolve_assignee_chorewide(conn, chore['id'], slot, last_instance, next_due)
        _upsert_instance(conn, chore['id'], slot_id, next_due, assigned)
