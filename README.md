# 📱 Mobile Usage Analytics Dashboard

A full-stack web application that analyses mobile phone usage — calls, SMS, data consumption, and time-based patterns — powered by **Flask + SQLite + Chart.js**. Uses 90 days of synthetic sample data generated automatically on first run.

> **Privacy:** This project uses algorithmically generated fictional data only. No real phone data is collected or required.

---

## ✨ Features

| Page | What it does |
|---|---|
| **Dashboard** | 8 KPI cards, daily trend chart, call breakdown, hourly & weekday charts |
| **Calls** | Incoming/outgoing/missed stats, top-contacts chart, full CRUD (add/edit/delete) |
| **SMS** | Sent vs received, daily stacked bar, hourly pattern, SMS log with add/delete |
| **Data Usage** | Per-app breakdown, upload/download charts, monthly limit monitor with progress bar |
| **Time Patterns** | Morning/afternoon/evening/night cards, hourly line, weekday bars, call-frequency heatmap |
| **Records** | Unified table view for all 3 datasets, global search, date filter, CSV export |

---

## 🗂 Project Structure

```
mobile-analytics/
├── app.py              ← Flask app + 19 REST API routes
├── database.py         ← SQLite schema + connection helper
├── seed_data.py        ← 90-day synthetic data generator
├── requirements.txt
├── data/
│   └── mobile_analytics.db
├── templates/
│   ├── base.html       ← shared sidebar + topnav layout
│   ├── index.html      ← Dashboard
│   ├── calls.html      ← Call Analytics
│   ├── sms.html        ← SMS Analytics
│   ├── data_usage.html ← Data Usage
│   ├── time_patterns.html
│   └── records.html    ← Records management
└── static/
    ├── css/style.css
    └── js/
        ├── main.js     ← shared utils, theme, sidebar, chart factories
        ├── dashboard.js
        ├── calls.js
        ├── sms.js
        ├── data_usage.js
        ├── time_patterns.js
        └── records.js
```

---

## 🚀 Setup & Run

```bash
# 1. Navigate to project folder
cd mobile-analytics

# 2. (Recommended) create a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py
```

Open **http://localhost:5000** in your browser. The database is created and seeded automatically.

### Re-seed sample data
- Click **↺ Re-seed Data** in the sidebar, **or**
- `curl -X POST http://localhost:5000/api/seed`

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard/summary` | All-time KPI metrics |
| GET | `/api/dashboard/daily-trend` | Daily calls/SMS/data trend |
| GET | `/api/calls/summary` | Call aggregates + top contacts |
| GET/POST | `/api/calls` | List / create calls |
| PUT/DELETE | `/api/calls/<id>` | Update / delete a call |
| GET | `/api/sms/summary` | SMS aggregates + hourly breakdown |
| GET/POST | `/api/sms` | List / create SMS |
| DELETE | `/api/sms/<id>` | Delete an SMS record |
| GET | `/api/data/summary` | Data aggregates + per-app breakdown |
| GET/POST | `/api/data` | List / create data records |
| DELETE | `/api/data/<id>` | Delete a data record |
| GET/POST | `/api/settings` | Read / update settings |
| GET | `/api/time/hourly` | Hourly call + SMS counts |
| GET | `/api/time/weekday` | Weekday call + SMS counts |
| GET | `/api/time/heatmap` | Call heatmap `[{dow,hour,count}]` |
| GET | `/api/export/<table>` | CSV download (calls/sms/data_usage) |
| POST | `/api/seed` | Re-generate sample data |

**Common query params:** `start`, `end` (YYYY-MM-DD), `page`, `per_page`

---

## 🛠 Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: flask` | `pip install -r requirements.txt` inside your venv |
| Charts blank / no data | Click **↺ Re-seed Data** or run `python seed_data.py` |
| Port 5000 in use | Edit `port=5000` in `app.py` to another port |
| Chart.js not loading | Check internet connection (loaded from CDN) |
| CSV export returns 404 | Widen the date range — no records in that window |

---

*Flask + SQLite + Chart.js — B.Tech / Portfolio Project*
