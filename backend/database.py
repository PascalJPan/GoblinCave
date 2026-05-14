import sqlite3
import os
from datetime import date

DB_PATH = os.path.join(os.path.dirname(__file__), "goblin_cave.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    emoji TEXT DEFAULT '🧹',
    category TEXT NOT NULL DEFAULT 'general',
    sort_order INTEGER NOT NULL DEFAULT 0,
    schedule_type TEXT NOT NULL CHECK(schedule_type IN ('weekly','monthly','yearly')),
    preferred_weekday TEXT DEFAULT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chore_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id INTEGER NOT NULL REFERENCES chores(id),
    row_index INTEGER NOT NULL DEFAULT 0,
    day_spec TEXT NOT NULL,
    assignee TEXT NOT NULL CHECK(assignee IN ('person1','person2','alternating','together')),
    alt_start TEXT NOT NULL DEFAULT 'person1',
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chore_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id INTEGER NOT NULL REFERENCES chores(id),
    slot_id INTEGER NOT NULL REFERENCES chore_slots(id),
    due_date TEXT NOT NULL,
    assigned_to TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    completed_by TEXT,
    completed_at TEXT,
    UNIQUE(slot_id, due_date)
);
"""

CATEGORY_SEEDS = [
    "bathroom", "gardening", "general", "kitchen", "shopping", "trash", "washing"
]


def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
    finally:
        conn.close()


def _seed(conn):
    # Categories
    for i, name in enumerate(CATEGORY_SEEDS):
        conn.execute(
            "INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)",
            (name, i)
        )

    if conn.execute("SELECT COUNT(*) FROM chores").fetchone()[0] > 0:
        return

    today = date.today().isoformat()

    def insert_chore(name, description, emoji, category, schedule_type, preferred_weekday=None, sort_order=0):
        cur = conn.execute(
            "INSERT INTO chores (name, description, emoji, category, sort_order, schedule_type, preferred_weekday, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (name, description, emoji, category, sort_order, schedule_type, preferred_weekday, today)
        )
        return cur.lastrowid

    def insert_slot(chore_id, row_index, day_spec, assignee, alt_start='person1'):
        cur = conn.execute(
            "INSERT INTO chore_slots (chore_id, row_index, day_spec, assignee, alt_start) VALUES (?, ?, ?, ?, ?)",
            (chore_id, row_index, day_spec, assignee, alt_start)
        )
        return cur.lastrowid

    def seed_instance(chore_id, slot_id, assigned_to):
        conn.execute(
            "INSERT OR IGNORE INTO chore_instances (chore_id, slot_id, due_date, assigned_to) VALUES (?, ?, ?, ?)",
            (chore_id, slot_id, today, assigned_to)
        )

    # 1. Dishes — kitchen, weekly, Mon=marina + Thu=pascal (independent)
    c1 = insert_chore("Dishes", "Rinse and stack in dishwasher. Run if full.", "🍽️", "kitchen", "weekly", sort_order=0)
    s1a = insert_slot(c1, 0, "Mon", "person2")
    s1b = insert_slot(c1, 0, "Thu", "person1")
    seed_instance(c1, s1a, "person2")
    seed_instance(c1, s1b, "person1")

    # 2. Vacuum — general, bi-weekly, row0=Sat(person1), row1=Sat(person2)
    c2 = insert_chore("Vacuum", "Living room, hallway, and bedroom floors.", "🧹", "general", "weekly", sort_order=0)
    s2a = insert_slot(c2, 0, "Sat", "person1")
    s2b = insert_slot(c2, 1, "Sat", "person2")
    seed_instance(c2, s2a, "person1")
    seed_instance(c2, s2b, "person2")

    # 3. Groceries — shopping, weekly, Mon=alternating (starts person1)
    c3 = insert_chore("Groceries", "Check the list on the fridge before going.", "🛒", "shopping", "weekly", sort_order=0)
    s3 = insert_slot(c3, 0, "Mon", "alternating", alt_start="person1")
    seed_instance(c3, s3, "person1")

    # 4. Trash — trash, weekly, Mon=together
    c4 = insert_chore("Trash", "Take all bins to the street before 7am.", "🗑️", "trash", "weekly", sort_order=0)
    s4 = insert_slot(c4, 0, "Mon", "together")
    seed_instance(c4, s4, "together")

    # 5. Bathroom deep clean — bathroom, monthly, day=1, preferred_weekday=Sat, alternating
    c5 = insert_chore("Bathroom deep clean",
                      "Toilet, sink, shower, floor, mirror. The full works.",
                      "🛁", "bathroom", "monthly", preferred_weekday="Sat", sort_order=0)
    s5 = insert_slot(c5, 0, "1", "alternating", alt_start="person1")
    seed_instance(c5, s5, "person1")

    # 6. Laundry — washing, weekly, Tue=person2 + Fri=person1
    c6 = insert_chore("Laundry", "- Sort by colour\n- Check pockets\n- Hang to dry when done", "👕", "washing", "weekly", sort_order=0)
    s6a = insert_slot(c6, 0, "Tue", "person2")
    s6b = insert_slot(c6, 0, "Fri", "person1")
    seed_instance(c6, s6a, "person2")
    seed_instance(c6, s6b, "person1")

    # 7. Plants — gardening, weekly, Sun=alternating (starts person2)
    c7 = insert_chore("Water plants", "- Kitchen herbs\n- Balcony pots\n- Living room shelf", "🪴", "gardening", "weekly", sort_order=0)
    s7 = insert_slot(c7, 0, "Sun", "alternating", alt_start="person2")
    seed_instance(c7, s7, "person2")

    # 8. Kitchen deep clean — kitchen, monthly, day=15, preferred_weekday=Sat, together
    c8 = insert_chore("Kitchen deep clean",
                      "- Wipe down all surfaces\n- Clean oven inside\n- Degrease hob\n- Empty and clean fridge",
                      "🧽", "kitchen", "monthly", preferred_weekday="Sat", sort_order=1)
    s8 = insert_slot(c8, 0, "15", "together")
    seed_instance(c8, s8, "together")

    conn.commit()


def init_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    conn.commit()
    _seed(conn)
    conn.close()
