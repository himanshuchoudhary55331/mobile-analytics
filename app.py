"""
app.py — Flask application: page routes + REST API endpoints + CSV export.
"""
import csv
import io
from datetime import datetime, timedelta

from flask import Flask, abort, jsonify, render_template, request, send_file

from database import get_connection, init_db
from seed_data import seed as run_seed

app = Flask(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_date_range(args):
    start = args.get("start")
    end   = args.get("end")
    if start:
        datetime.strptime(start, "%Y-%m-%d")
    if end:
        datetime.strptime(end, "%Y-%m-%d")
    return start, end


def _date_where(col: str, start, end, date_only: bool = False):
    """Return (WHERE-clause-string, params-list) for optional date filtering."""
    parts, params = [], []
    wrap = col if date_only else f"date({col})"
    if start:
        parts.append(f"{wrap} >= ?")
        params.append(start)
    if end:
        parts.append(f"{wrap} <= ?")
        params.append(end)
    where = ("WHERE " + " AND ".join(parts)) if parts else ""
    return where, params


# ── Page routes ───────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/calls")
def calls_page():
    return render_template("calls.html")

@app.route("/sms")
def sms_page():
    return render_template("sms.html")

@app.route("/data-usage")
def data_usage_page():
    return render_template("data_usage.html")

@app.route("/time-patterns")
def time_patterns_page():
    return render_template("time_patterns.html")

@app.route("/records")
def records_page():
    return render_template("records.html")


# ── Dashboard API ─────────────────────────────────────────────────────────────

@app.route("/api/dashboard/summary")
def api_dashboard_summary():
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM calls")
    total_calls = cur.fetchone()[0]

    cur.execute("SELECT COALESCE(SUM(duration_sec),0) FROM calls")
    total_duration = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM calls WHERE call_type='missed'")
    missed = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM sms")
    total_sms = cur.fetchone()[0]

    cur.execute("SELECT COALESCE(SUM(upload_mb+download_mb),0) FROM data_usage")
    total_data = round(cur.fetchone()[0], 2)

    thirty = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    cur.execute("SELECT COUNT(*)*1.0/30 FROM calls WHERE date(call_datetime)>=?", (thirty,))
    avg_daily = round(cur.fetchone()[0] or 0, 1)

    cur.execute("""
        SELECT date(call_datetime) d, COUNT(*) c
        FROM calls GROUP BY d ORDER BY c DESC LIMIT 1
    """)
    row = cur.fetchone()
    most_active = row["d"] if row else "N/A"

    cur.execute("""
        SELECT strftime('%H',call_datetime) h, COUNT(*) c
        FROM calls GROUP BY h ORDER BY c DESC LIMIT 1
    """)
    row = cur.fetchone()
    peak_hour = f"{row['h']}:00" if row else "N/A"

    conn.close()
    return jsonify({
        "total_calls": total_calls,
        "total_duration_sec": total_duration,
        "missed_calls": missed,
        "total_sms": total_sms,
        "total_data_mb": total_data,
        "avg_daily_calls": avg_daily,
        "most_active_day": most_active,
        "peak_hour": peak_hour,
    })


@app.route("/api/dashboard/daily-trend")
def api_dashboard_daily_trend():
    days   = int(request.args.get("days", 30))
    start  = request.args.get("start") or (datetime.now() - timedelta(days=days-1)).strftime("%Y-%m-%d")
    end    = request.args.get("end")   or datetime.now().strftime("%Y-%m-%d")
    conn   = get_connection()
    cur    = conn.cursor()

    cur.execute("""
        SELECT date(call_datetime) d, COUNT(*) calls, SUM(duration_sec) dur
        FROM calls WHERE date(call_datetime) BETWEEN ? AND ?
        GROUP BY d ORDER BY d
    """, (start, end))
    call_map = {r["d"]: {"calls": r["calls"], "dur": r["dur"]} for r in cur.fetchall()}

    cur.execute("""
        SELECT date(sms_datetime) d, COUNT(*) cnt
        FROM sms WHERE date(sms_datetime) BETWEEN ? AND ?
        GROUP BY d ORDER BY d
    """, (start, end))
    sms_map = {r["d"]: r["cnt"] for r in cur.fetchall()}

    cur.execute("""
        SELECT usage_date d, SUM(upload_mb+download_mb) mb
        FROM data_usage WHERE usage_date BETWEEN ? AND ?
        GROUP BY d ORDER BY d
    """, (start, end))
    data_map = {r["d"]: round(r["mb"], 2) for r in cur.fetchall()}

    conn.close()

    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt   = datetime.strptime(end,   "%Y-%m-%d")
    num_days = (end_dt - start_dt).days + 1

    labels, calls_out, sms_out, data_out = [], [], [], []
    for i in range(num_days):
        d = (start_dt + timedelta(days=i)).strftime("%Y-%m-%d")
        labels.append(d)
        calls_out.append(call_map.get(d, {}).get("calls", 0))
        sms_out.append(sms_map.get(d, 0))
        data_out.append(data_map.get(d, 0))

    return jsonify({"labels": labels, "calls": calls_out, "sms": sms_out, "data_mb": data_out})


# ── Calls API ─────────────────────────────────────────────────────────────────

@app.route("/api/calls/summary")
def api_calls_summary():
    start, end = _parse_date_range(request.args)
    where, params = _date_where("call_datetime", start, end)
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute(f"SELECT COUNT(*) FROM calls {where}", params)
    total = cur.fetchone()[0]

    cur.execute(f"""
        SELECT call_type, COUNT(*) cnt, COALESCE(SUM(duration_sec),0) dur
        FROM calls {where} GROUP BY call_type
    """, params)
    by_type = {r["call_type"]: {"count": r["cnt"], "duration": r["dur"]} for r in cur.fetchall()}

    cur.execute(f"""
        SELECT phone_number, contact_name, COUNT(*) cnt
        FROM calls {where} GROUP BY phone_number ORDER BY cnt DESC LIMIT 8
    """, params)
    top_contacts = [{"number": r["phone_number"], "name": r["contact_name"], "count": r["cnt"]}
                    for r in cur.fetchall()]

    cur.execute(f"""
        SELECT date(call_datetime) d, COUNT(*) cnt, SUM(duration_sec) dur
        FROM calls {where} GROUP BY d ORDER BY d
    """, params)
    daily = [{"date": r["d"], "count": r["cnt"], "duration": r["dur"]} for r in cur.fetchall()]

    conn.close()
    return jsonify({"total": total, "by_type": by_type, "top_contacts": top_contacts, "daily": daily})


@app.route("/api/calls", methods=["GET"])
def api_calls_list():
    start, end  = _parse_date_range(request.args)
    page        = max(1, int(request.args.get("page", 1)))
    per_page    = min(100, int(request.args.get("per_page", 20)))
    call_type   = request.args.get("type")

    where, params = _date_where("call_datetime", start, end)
    if call_type in ("incoming", "outgoing", "missed"):
        connector = "AND" if where else "WHERE"
        where    += f" {connector} call_type=?"
        params.append(call_type)

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM calls {where}", params)
    total  = cur.fetchone()[0]
    offset = (page - 1) * per_page
    cur.execute(f"SELECT * FROM calls {where} ORDER BY call_datetime DESC LIMIT ? OFFSET ?",
                params + [per_page, offset])
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify({"total": total, "page": page, "per_page": per_page, "data": rows})


@app.route("/api/calls", methods=["POST"])
def api_calls_create():
    d = request.get_json(force=True)
    for f in ("call_type", "phone_number", "call_datetime"):
        if not d.get(f):
            return jsonify({"error": f"'{f}' is required"}), 400
    if d["call_type"] not in ("incoming", "outgoing", "missed"):
        return jsonify({"error": "call_type must be incoming/outgoing/missed"}), 400
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO calls (call_type,phone_number,contact_name,duration_sec,call_datetime)
        VALUES (?,?,?,?,?)
    """, (d["call_type"], d["phone_number"], d.get("contact_name",""),
          int(d.get("duration_sec", 0)), d["call_datetime"]))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/calls/<int:cid>", methods=["PUT"])
def api_calls_update(cid):
    d = request.get_json(force=True)
    conn = get_connection()
    conn.execute("""
        UPDATE calls SET call_type=?,phone_number=?,contact_name=?,duration_sec=?,call_datetime=?
        WHERE id=?
    """, (d.get("call_type"), d.get("phone_number"), d.get("contact_name",""),
          int(d.get("duration_sec", 0)), d.get("call_datetime"), cid))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/calls/<int:cid>", methods=["DELETE"])
def api_calls_delete(cid):
    conn = get_connection()
    conn.execute("DELETE FROM calls WHERE id=?", (cid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── SMS API ───────────────────────────────────────────────────────────────────

@app.route("/api/sms/summary")
def api_sms_summary():
    start, end = _parse_date_range(request.args)
    where, params = _date_where("sms_datetime", start, end)
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute(f"SELECT COUNT(*) FROM sms {where}", params)
    total = cur.fetchone()[0]

    cur.execute(f"SELECT sms_type, COUNT(*) cnt FROM sms {where} GROUP BY sms_type", params)
    by_type = {r["sms_type"]: r["cnt"] for r in cur.fetchall()}

    cur.execute(f"""
        SELECT date(sms_datetime) d,
               SUM(CASE WHEN sms_type='sent'     THEN 1 ELSE 0 END) sent,
               SUM(CASE WHEN sms_type='received' THEN 1 ELSE 0 END) received
        FROM sms {where} GROUP BY d ORDER BY d
    """, params)
    daily = [{"date": r["d"], "sent": r["sent"], "received": r["received"]} for r in cur.fetchall()]

    cur.execute(f"""
        SELECT CAST(strftime('%H',sms_datetime) AS INTEGER) hr, COUNT(*) cnt
        FROM sms {where} GROUP BY hr ORDER BY hr
    """, params)
    hourly = [{"hour": r["hr"], "count": r["cnt"]} for r in cur.fetchall()]

    conn.close()
    return jsonify({"total": total, "by_type": by_type, "daily": daily, "hourly": hourly})


@app.route("/api/sms", methods=["GET"])
def api_sms_list():
    start, end  = _parse_date_range(request.args)
    page        = max(1, int(request.args.get("page", 1)))
    per_page    = min(100, int(request.args.get("per_page", 20)))
    sms_type    = request.args.get("type")

    where, params = _date_where("sms_datetime", start, end)
    if sms_type in ("sent", "received"):
        connector = "AND" if where else "WHERE"
        where    += f" {connector} sms_type=?"
        params.append(sms_type)

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM sms {where}", params)
    total  = cur.fetchone()[0]
    offset = (page - 1) * per_page
    cur.execute(f"SELECT * FROM sms {where} ORDER BY sms_datetime DESC LIMIT ? OFFSET ?",
                params + [per_page, offset])
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify({"total": total, "page": page, "per_page": per_page, "data": rows})


@app.route("/api/sms", methods=["POST"])
def api_sms_create():
    d = request.get_json(force=True)
    for f in ("sms_type", "phone_number", "sms_datetime"):
        if not d.get(f):
            return jsonify({"error": f"'{f}' is required"}), 400
    if d["sms_type"] not in ("sent", "received"):
        return jsonify({"error": "sms_type must be sent/received"}), 400
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("INSERT INTO sms (sms_type,phone_number,contact_name,sms_datetime) VALUES (?,?,?,?)",
                (d["sms_type"], d["phone_number"], d.get("contact_name",""), d["sms_datetime"]))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/sms/<int:sid>", methods=["DELETE"])
def api_sms_delete(sid):
    conn = get_connection()
    conn.execute("DELETE FROM sms WHERE id=?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Data Usage API ────────────────────────────────────────────────────────────

@app.route("/api/data/summary")
def api_data_summary():
    start, end = _parse_date_range(request.args)
    where, params = _date_where("usage_date", start, end, date_only=True)
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute(f"""
        SELECT COALESCE(SUM(upload_mb),0) ul, COALESCE(SUM(download_mb),0) dl
        FROM data_usage {where}
    """, params)
    row    = cur.fetchone()
    ul_mb  = round(row["ul"], 2)
    dl_mb  = round(row["dl"], 2)

    cur.execute(f"""
        SELECT app_name, SUM(upload_mb+download_mb) total,
               SUM(upload_mb) ul, SUM(download_mb) dl
        FROM data_usage {where} GROUP BY app_name ORDER BY total DESC
    """, params)
    by_app = [{"app": r["app_name"], "total_mb": round(r["total"],2),
               "upload_mb": round(r["ul"],2), "download_mb": round(r["dl"],2)}
              for r in cur.fetchall()]

    cur.execute(f"""
        SELECT usage_date d, SUM(upload_mb) ul, SUM(download_mb) dl
        FROM data_usage {where} GROUP BY d ORDER BY d
    """, params)
    daily = [{"date": r["d"], "upload_mb": round(r["ul"],2), "download_mb": round(r["dl"],2)}
             for r in cur.fetchall()]

    cur.execute("SELECT key,value FROM settings WHERE key LIKE '%limit%'")
    limits = {r["key"]: float(r["value"]) for r in cur.fetchall()}

    conn.close()
    return jsonify({
        "upload_mb": ul_mb, "download_mb": dl_mb, "total_mb": round(ul_mb+dl_mb, 2),
        "by_app": by_app, "daily": daily,
        "daily_limit_mb":   limits.get("daily_data_limit_mb",   500),
        "monthly_limit_mb": limits.get("monthly_data_limit_mb", 15000),
    })


@app.route("/api/data", methods=["GET"])
def api_data_list():
    start, end = _parse_date_range(request.args)
    page       = max(1, int(request.args.get("page", 1)))
    per_page   = min(100, int(request.args.get("per_page", 20)))
    app_name   = request.args.get("app")

    where, params = _date_where("usage_date", start, end, date_only=True)
    if app_name:
        connector = "AND" if where else "WHERE"
        where    += f" {connector} app_name=?"
        params.append(app_name)

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM data_usage {where}", params)
    total  = cur.fetchone()[0]
    offset = (page-1)*per_page
    cur.execute(f"SELECT * FROM data_usage {where} ORDER BY usage_date DESC LIMIT ? OFFSET ?",
                params + [per_page, offset])
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify({"total": total, "page": page, "per_page": per_page, "data": rows})


@app.route("/api/data", methods=["POST"])
def api_data_create():
    d = request.get_json(force=True)
    for f in ("app_name", "usage_date"):
        if not d.get(f):
            return jsonify({"error": f"'{f}' is required"}), 400
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("INSERT INTO data_usage (app_name,upload_mb,download_mb,usage_date) VALUES (?,?,?,?)",
                (d["app_name"], float(d.get("upload_mb",0)), float(d.get("download_mb",0)), d["usage_date"]))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return jsonify({"id": new_id}), 201


@app.route("/api/data/<int:did>", methods=["DELETE"])
def api_data_delete(did):
    conn = get_connection()
    conn.execute("DELETE FROM data_usage WHERE id=?", (did,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Settings API ──────────────────────────────────────────────────────────────

@app.route("/api/settings", methods=["GET"])
def api_settings_get():
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT key,value FROM settings")
    data = {r["key"]: r["value"] for r in cur.fetchall()}
    conn.close()
    return jsonify(data)


@app.route("/api/settings", methods=["POST"])
def api_settings_update():
    d = request.get_json(force=True)
    conn = get_connection()
    for key, val in d.items():
        conn.execute("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", (key, str(val)))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})


# ── Time Analytics API ────────────────────────────────────────────────────────

@app.route("/api/time/hourly")
def api_time_hourly():
    start, end = _parse_date_range(request.args)
    wc, wp = _date_where("call_datetime", start, end)
    ws, sp = _date_where("sms_datetime",  start, end)
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute(f"""
        SELECT CAST(strftime('%H',call_datetime) AS INTEGER) hr, COUNT(*) cnt
        FROM calls {wc} GROUP BY hr ORDER BY hr
    """, wp)
    call_h = {r["hr"]: r["cnt"] for r in cur.fetchall()}

    cur.execute(f"""
        SELECT CAST(strftime('%H',sms_datetime) AS INTEGER) hr, COUNT(*) cnt
        FROM sms {ws} GROUP BY hr ORDER BY hr
    """, sp)
    sms_h = {r["hr"]: r["cnt"] for r in cur.fetchall()}

    conn.close()
    hours = list(range(24))
    return jsonify({"hours": hours,
                    "calls": [call_h.get(h,0) for h in hours],
                    "sms":   [sms_h.get(h,0)  for h in hours]})


@app.route("/api/time/weekday")
def api_time_weekday():
    start, end = _parse_date_range(request.args)
    wc, wp = _date_where("call_datetime", start, end)
    ws, sp = _date_where("sms_datetime",  start, end)
    conn = get_connection()
    cur  = conn.cursor()

    cur.execute(f"""
        SELECT CAST(strftime('%w',call_datetime) AS INTEGER) dow, COUNT(*) cnt
        FROM calls {wc} GROUP BY dow
    """, wp)
    call_d = {r["dow"]: r["cnt"] for r in cur.fetchall()}

    cur.execute(f"""
        SELECT CAST(strftime('%w',sms_datetime) AS INTEGER) dow, COUNT(*) cnt
        FROM sms {ws} GROUP BY dow
    """, sp)
    sms_d = {r["dow"]: r["cnt"] for r in cur.fetchall()}

    conn.close()
    # SQLite %w: 0=Sun…6=Sat → reorder Mon–Sun
    sqlite_order = [1,2,3,4,5,6,0]
    day_names    = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    return jsonify({"days":  day_names,
                    "calls": [call_d.get(d,0) for d in sqlite_order],
                    "sms":   [sms_d.get(d,0)  for d in sqlite_order]})


@app.route("/api/time/heatmap")
def api_time_heatmap():
    start, end = _parse_date_range(request.args)
    wc, wp = _date_where("call_datetime", start, end)
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(f"""
        SELECT CAST(strftime('%w',call_datetime) AS INTEGER) dow,
               CAST(strftime('%H',call_datetime) AS INTEGER) hr,
               COUNT(*) cnt
        FROM calls {wc} GROUP BY dow, hr
    """, wp)
    rows = [{"dow": r["dow"], "hour": r["hr"], "count": r["cnt"]} for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


# ── CSV Export ────────────────────────────────────────────────────────────────

@app.route("/api/export/<table>")
def api_export_csv(table):
    allowed  = {"calls", "sms", "data_usage"}
    if table not in allowed:
        abort(404)
    date_col   = {"calls": "call_datetime", "sms": "sms_datetime", "data_usage": "usage_date"}[table]
    date_only  = table == "data_usage"
    start, end = _parse_date_range(request.args)
    where, params = _date_where(date_col, start, end, date_only=date_only)

    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(f"SELECT * FROM {table} {where} ORDER BY {date_col} DESC", params)
    rows = cur.fetchall()
    conn.close()

    if not rows:
        return jsonify({"error": "No data for selected range"}), 404

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(rows[0].keys())
    for r in rows:
        writer.writerow(list(r))
    out.seek(0)
    return send_file(
        io.BytesIO(out.getvalue().encode()),
        mimetype="text/csv",
        as_attachment=True,
        download_name=f"{table}_export.csv",
    )


# ── Seed endpoint ─────────────────────────────────────────────────────────────

@app.route("/api/seed", methods=["POST"])
def api_seed():
    run_seed()
    return jsonify({"ok": True, "message": "Database re-seeded with sample data."})


# ── Import page ───────────────────────────────────────────────────────────────

@app.route("/import")
def import_page():
    return render_template("import.html")


# ── CSV column alias maps ─────────────────────────────────────────────────────

_CALL_ALIASES = {
    "call_type":    ["call_type", "type", "direction", "calltype"],
    "phone_number": ["phone_number", "phone", "number", "tel", "from", "to"],
    "call_datetime":["call_datetime", "datetime", "date", "timestamp", "time"],
    "contact_name": ["contact_name", "contact", "name"],
    "duration_sec": ["duration_sec", "duration", "seconds", "secs", "duration(s)"],
}

_SMS_ALIASES = {
    "sms_type":    ["sms_type", "type", "direction"],
    "phone_number":["phone_number", "phone", "number", "address", "from", "to"],
    "sms_datetime":["sms_datetime", "datetime", "date", "timestamp", "time"],
    "contact_name":["contact_name", "contact", "name"],
}

_DATA_ALIASES = {
    "app_name":   ["app_name", "app", "application", "package", "package_name"],
    "usage_date": ["usage_date", "date", "day"],
    "download_mb":["download_mb", "download", "rx_mb", "received_mb", "rx", "received"],
    "upload_mb":  ["upload_mb", "upload", "tx_mb", "sent_mb", "tx", "sent"],
}


def _resolve_columns(header_row, alias_map):
    """Map actual CSV header names to canonical field names."""
    norm = {h.strip().lower().replace(" ", "_"): h.strip() for h in header_row}
    mapping = {}
    for canonical, aliases in alias_map.items():
        for alias in aliases:
            if alias in norm:
                mapping[canonical] = norm[alias]
                break
    return mapping


def _normalise_call_type(val):
    v = (val or "").strip().lower()
    if v in ("1", "incoming", "in", "inbound", "received"):  return "incoming"
    if v in ("2", "outgoing", "out", "outbound", "dialed"):  return "outgoing"
    if v in ("3", "missed", "miss", "unanswered"):           return "missed"
    return None


def _normalise_sms_type(val):
    v = (val or "").strip().lower()
    if v in ("1", "sent", "send", "outgoing", "out"): return "sent"
    if v in ("2", "received", "recv", "incoming", "in"): return "received"
    return None


def _parse_datetime(val):
    """Try several common datetime formats."""
    val = (val or "").strip()
    fmts = [
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S",
        "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M",    "%Y-%m-%dT%H:%M",
        "%d/%m/%Y %H:%M",    "%m/%d/%Y %H:%M",
        "%Y-%m-%d",          "%d/%m/%Y",          "%m/%d/%Y",
        "%d-%m-%Y",          "%d-%m-%Y %H:%M:%S",
    ]
    for fmt in fmts:
        try:
            return datetime.strptime(val, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return None


def _parse_date_only(val):
    val = (val or "").strip()
    fmts = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"]
    for fmt in fmts:
        try:
            return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ── Import: calls ─────────────────────────────────────────────────────────────

@app.route("/api/import/calls", methods=["POST"])
def api_import_calls():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    f       = request.files["file"]
    replace = request.form.get("replace", "false").lower() == "true"
    content = f.read().decode("utf-8-sig", errors="replace")
    reader  = csv.DictReader(io.StringIO(content))

    col_map  = _resolve_columns(reader.fieldnames or [], _CALL_ALIASES)
    required = {"call_type", "phone_number", "call_datetime"}
    missing  = required - set(col_map.keys())
    if missing:
        return jsonify({"error": f"Missing required columns: {', '.join(missing)}. "
                                  f"Got: {', '.join(reader.fieldnames or [])}"}), 400

    rows_ok, rows_failed, errors = 0, 0, []
    insert_rows = []

    for i, row in enumerate(reader, start=2):
        ctype = _normalise_call_type(row.get(col_map["call_type"], ""))
        phone = (row.get(col_map["phone_number"], "") or "").strip()
        dt    = _parse_datetime(row.get(col_map["call_datetime"], ""))

        if not ctype:
            errors.append(f"Row {i}: invalid call_type '{row.get(col_map['call_type'], '')}'")
            rows_failed += 1; continue
        if not phone:
            errors.append(f"Row {i}: missing phone_number")
            rows_failed += 1; continue
        if not dt:
            errors.append(f"Row {i}: unparseable datetime '{row.get(col_map['call_datetime'], '')}'")
            rows_failed += 1; continue

        name = row.get(col_map.get("contact_name",""), "").strip() if "contact_name" in col_map else ""
        dur  = 0
        if "duration_sec" in col_map:
            try: dur = int(float(row.get(col_map["duration_sec"], 0) or 0))
            except: dur = 0

        insert_rows.append((ctype, phone, name, dur, dt))
        rows_ok += 1

    conn = get_connection()
    if replace:
        conn.execute("DELETE FROM calls")
    conn.executemany(
        "INSERT INTO calls (call_type,phone_number,contact_name,duration_sec,call_datetime) VALUES (?,?,?,?,?)",
        insert_rows,
    )
    conn.execute(
        "INSERT INTO import_log (import_type,filename,rows_ok,rows_failed,replaced) VALUES (?,?,?,?,?)",
        ("calls", f.filename, rows_ok, rows_failed, int(replace)),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "rows_imported": rows_ok, "rows_failed": rows_failed,
                    "errors": errors[:20], "replaced": replace})


# ── Import: SMS ───────────────────────────────────────────────────────────────

@app.route("/api/import/sms", methods=["POST"])
def api_import_sms():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    f       = request.files["file"]
    replace = request.form.get("replace", "false").lower() == "true"
    content = f.read().decode("utf-8-sig", errors="replace")
    reader  = csv.DictReader(io.StringIO(content))

    col_map  = _resolve_columns(reader.fieldnames or [], _SMS_ALIASES)
    required = {"sms_type", "phone_number", "sms_datetime"}
    missing  = required - set(col_map.keys())
    if missing:
        return jsonify({"error": f"Missing required columns: {', '.join(missing)}. "
                                  f"Got: {', '.join(reader.fieldnames or [])}"}), 400

    rows_ok, rows_failed, errors = 0, 0, []
    insert_rows = []

    for i, row in enumerate(reader, start=2):
        stype = _normalise_sms_type(row.get(col_map["sms_type"], ""))
        phone = (row.get(col_map["phone_number"], "") or "").strip()
        dt    = _parse_datetime(row.get(col_map["sms_datetime"], ""))

        if not stype:
            errors.append(f"Row {i}: invalid sms_type '{row.get(col_map['sms_type'], '')}'")
            rows_failed += 1; continue
        if not phone:
            errors.append(f"Row {i}: missing phone_number")
            rows_failed += 1; continue
        if not dt:
            errors.append(f"Row {i}: unparseable datetime")
            rows_failed += 1; continue

        name = row.get(col_map.get("contact_name",""), "").strip() if "contact_name" in col_map else ""
        insert_rows.append((stype, phone, name, dt))
        rows_ok += 1

    conn = get_connection()
    if replace:
        conn.execute("DELETE FROM sms")
    conn.executemany(
        "INSERT INTO sms (sms_type,phone_number,contact_name,sms_datetime) VALUES (?,?,?,?)",
        insert_rows,
    )
    conn.execute(
        "INSERT INTO import_log (import_type,filename,rows_ok,rows_failed,replaced) VALUES (?,?,?,?,?)",
        ("sms", f.filename, rows_ok, rows_failed, int(replace)),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "rows_imported": rows_ok, "rows_failed": rows_failed,
                    "errors": errors[:20], "replaced": replace})


# ── Import: data usage ────────────────────────────────────────────────────────

@app.route("/api/import/data", methods=["POST"])
def api_import_data():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    f       = request.files["file"]
    replace = request.form.get("replace", "false").lower() == "true"
    content = f.read().decode("utf-8-sig", errors="replace")
    reader  = csv.DictReader(io.StringIO(content))

    col_map  = _resolve_columns(reader.fieldnames or [], _DATA_ALIASES)
    required = {"app_name", "usage_date", "download_mb"}
    missing  = required - set(col_map.keys())
    if missing:
        return jsonify({"error": f"Missing required columns: {', '.join(missing)}. "
                                  f"Got: {', '.join(reader.fieldnames or [])}"}), 400

    rows_ok, rows_failed, errors = 0, 0, []
    insert_rows = []

    for i, row in enumerate(reader, start=2):
        app_name = (row.get(col_map["app_name"], "") or "").strip()
        date_val = _parse_date_only(row.get(col_map["usage_date"], ""))

        if not app_name:
            errors.append(f"Row {i}: missing app_name"); rows_failed += 1; continue
        if not date_val:
            errors.append(f"Row {i}: unparseable date"); rows_failed += 1; continue

        try: dl = float(row.get(col_map["download_mb"], 0) or 0)
        except: dl = 0.0
        ul = 0.0
        if "upload_mb" in col_map:
            try: ul = float(row.get(col_map["upload_mb"], 0) or 0)
            except: ul = 0.0

        insert_rows.append((app_name, ul, dl, date_val))
        rows_ok += 1

    conn = get_connection()
    if replace:
        conn.execute("DELETE FROM data_usage")
    conn.executemany(
        "INSERT INTO data_usage (app_name,upload_mb,download_mb,usage_date) VALUES (?,?,?,?)",
        insert_rows,
    )
    conn.execute(
        "INSERT INTO import_log (import_type,filename,rows_ok,rows_failed,replaced) VALUES (?,?,?,?,?)",
        ("data", f.filename, rows_ok, rows_failed, int(replace)),
    )
    conn.commit()
    conn.close()

    return jsonify({"ok": True, "rows_imported": rows_ok, "rows_failed": rows_failed,
                    "errors": errors[:20], "replaced": replace})


# ── Import history ────────────────────────────────────────────────────────────

@app.route("/api/import/history")
def api_import_history():
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM import_log ORDER BY imported_at DESC LIMIT 50")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(rows)


# ── CSV Templates ─────────────────────────────────────────────────────────────

@app.route("/api/import/template/<ttype>")
def api_import_template(ttype):
    templates = {
        "calls": (
            "call_type,phone_number,contact_name,duration_sec,call_datetime\n"
            "incoming,+1-555-0101,Alice Johnson,300,2025-07-10 09:15:00\n"
            "outgoing,+1-555-0102,Bob Martinez,120,2025-07-10 10:30:00\n"
            "missed,+1-555-0103,Carol Williams,0,2025-07-10 11:00:00\n"
        ),
        "sms": (
            "sms_type,phone_number,contact_name,sms_datetime\n"
            "sent,+1-555-0101,Alice Johnson,2025-07-10 09:20:00\n"
            "received,+1-555-0102,Bob Martinez,2025-07-10 10:35:00\n"
        ),
        "data": (
            "app_name,usage_date,download_mb,upload_mb\n"
            "YouTube,2025-07-10,450.5,12.3\n"
            "Instagram,2025-07-10,120.0,45.2\n"
            "WhatsApp,2025-07-10,30.5,28.1\n"
            "Chrome,2025-07-10,85.0,5.5\n"
            "Spotify,2025-07-10,95.0,2.0\n"
        ),
    }
    if ttype not in templates:
        abort(404)
    return send_file(
        io.BytesIO(templates[ttype].encode()),
        mimetype="text/csv",
        as_attachment=True,
        download_name=f"{ttype}_template.csv",
    )


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM calls")
    count = cur.fetchone()[0]
    conn.close()
    if count == 0:
        print("Empty database — seeding sample data…")
        run_seed()
    app.run(debug=True, port=5000)
