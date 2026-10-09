"""
seed_data.py — Populate the database with 90 days of synthetic sample data.
Run once:  python seed_data.py
"""
import random
from datetime import datetime, timedelta
from database import get_connection, init_db

CONTACTS = [
    ("Alice Johnson",  "+1-555-0101"),
    ("Bob Martinez",   "+1-555-0102"),
    ("Carol Williams", "+1-555-0103"),
    ("David Brown",    "+1-555-0104"),
    ("Eva Davis",      "+1-555-0105"),
    ("Frank Wilson",   "+1-555-0106"),
    ("Grace Lee",      "+1-555-0107"),
    ("Henry Taylor",   "+1-555-0108"),
]

APPS = [
    "YouTube", "Instagram", "WhatsApp", "Chrome", "Spotify",
    "Twitter", "Netflix",   "Gmail",    "Maps",   "TikTok",
]

CALL_TYPES   = ["incoming", "outgoing", "missed"]
CALL_WEIGHTS = [0.45, 0.45, 0.10]
SMS_TYPES    = ["sent", "received"]

HEAVY_APPS   = {"YouTube", "Netflix", "TikTok"}


def _rand_time(date: datetime) -> datetime:
    weights = (
        [1]*6 + [3]*3 + [5]*4 + [6]*4 + [8]*4 + [4]*3 + [2]*1
    )                                # 00-05 low, 17-20 evening peak
    hour   = random.choices(range(24), weights=weights[:24])[0]
    minute = random.randint(0, 59)
    second = random.randint(0, 59)
    return date.replace(hour=hour, minute=minute, second=second)


def seed():
    init_db()
    conn = get_connection()
    cur  = conn.cursor()

    for tbl in ("calls", "sms", "data_usage"):
        cur.execute(f"DELETE FROM {tbl}")

    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    start = today - timedelta(days=89)

    call_rows, sms_rows, data_rows = [], [], []

    for offset in range(90):
        day        = start + timedelta(days=offset)
        is_weekend = day.weekday() >= 5

        # Calls
        n = random.randint(4, 12) if is_weekend else random.randint(8, 18)
        for _ in range(n):
            c    = random.choice(CONTACTS)
            ctype = random.choices(CALL_TYPES, weights=CALL_WEIGHTS)[0]
            dur  = 0 if ctype == "missed" else random.randint(30, 1800)
            dt   = _rand_time(day)
            call_rows.append((ctype, c[1], c[0], dur, dt.strftime("%Y-%m-%d %H:%M:%S")))

        # SMS
        n = random.randint(3, 15) if is_weekend else random.randint(5, 25)
        for _ in range(n):
            c    = random.choice(CONTACTS)
            stype = random.choice(SMS_TYPES)
            dt   = _rand_time(day)
            sms_rows.append((stype, c[1], c[0], dt.strftime("%Y-%m-%d %H:%M:%S")))

        # Data usage
        for app in APPS:
            if random.random() < 0.70:
                factor = 1.5 if app in HEAVY_APPS else 1.0
                dl = round(random.uniform(5, 400) * factor, 2)
                ul = round(dl * random.uniform(0.05, 0.25), 2)
                data_rows.append((app, ul, dl, day.strftime("%Y-%m-%d")))

    cur.executemany(
        "INSERT INTO calls (call_type,phone_number,contact_name,duration_sec,call_datetime) VALUES (?,?,?,?,?)",
        call_rows,
    )
    cur.executemany(
        "INSERT INTO sms (sms_type,phone_number,contact_name,sms_datetime) VALUES (?,?,?,?)",
        sms_rows,
    )
    cur.executemany(
        "INSERT INTO data_usage (app_name,upload_mb,download_mb,usage_date) VALUES (?,?,?,?)",
        data_rows,
    )

    conn.commit()
    conn.close()
    print(f"Seeded {len(call_rows)} calls, {len(sms_rows)} SMS, {len(data_rows)} data-usage rows.")


if __name__ == "__main__":
    seed()
