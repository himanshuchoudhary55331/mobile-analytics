"""
database.py — SQLite schema creation and connection helper.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "mobile_analytics.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS calls (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            call_type     TEXT    NOT NULL CHECK(call_type IN ('incoming','outgoing','missed')),
            phone_number  TEXT    NOT NULL,
            contact_name  TEXT,
            duration_sec  INTEGER NOT NULL DEFAULT 0,
            call_datetime TEXT    NOT NULL,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS sms (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            sms_type      TEXT    NOT NULL CHECK(sms_type IN ('sent','received')),
            phone_number  TEXT    NOT NULL,
            contact_name  TEXT,
            sms_datetime  TEXT    NOT NULL,
            created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS data_usage (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            app_name     TEXT    NOT NULL,
            upload_mb    REAL    NOT NULL DEFAULT 0,
            download_mb  REAL    NOT NULL DEFAULT 0,
            usage_date   TEXT    NOT NULL,
            created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """)

    cur.execute("""
        INSERT OR IGNORE INTO settings (key, value) VALUES
            ('daily_data_limit_mb',   '500'),
            ('monthly_data_limit_mb', '15000')
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS import_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            import_type TEXT    NOT NULL,
            filename    TEXT    NOT NULL,
            rows_ok     INTEGER NOT NULL DEFAULT 0,
            rows_failed INTEGER NOT NULL DEFAULT 0,
            replaced    INTEGER NOT NULL DEFAULT 0,
            imported_at TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    conn.commit()
    conn.close()
