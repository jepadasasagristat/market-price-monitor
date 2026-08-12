# Presyong Palengke — Market Price Monitoring

Daily Bantay Presyo scrape into Google Sheets, plus a Data Bank–style web dashboard for the **Latest** tab.

## Architecture (same pattern as ASDB Data Bank)

```text
Browser SPA (React + Vite + TS)
        │  /api/*
        ▼
FastAPI backend
        │  SHEETS_WEBAPP_URL
        ▼
Apps Script Web App  →  Google Sheet "Latest"
        ▲
Daily scraper (Code.gs) ← Bantay Presyo site
```

| Layer | Stack | Folder |
| --- | --- | --- |
| Scraper + Sheet API | Google Apps Script | `apps_script/` |
| Backend | Python, FastAPI, httpx | `backend/` |
| Frontend | React 18, TypeScript, Vite, TanStack Query, Recharts, Leaflet | `frontend/` |
| Docs | System overview | `docs/` · this README |

## Quick start

### 1. Keep scraping into Google Sheets

Use [`apps_script/Code.gs`](apps_script/Code.gs) as documented in [docs/SCRAPER.md](docs/SCRAPER.md).

### 2. Publish Sheet JSON for the dashboard

1. Paste the latest `Code.gs` (includes `doGet`).
2. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
3. Copy the `/exec` URL.

### 3. Backend

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` (already pointed at your scraper DB sheet):

```env
SPREADSHEET_ID=1aRYXiGhhoeDQNNb4T1ooXubO11VlLs86bSIpvF1HtK8
LATEST_SHEET_GID=77241631
# Optional: SHEETS_WEBAPP_URL=https://script.google.com/macros/s/XXXX/exec
```

```powershell
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API loads the **Latest** tab via public CSV export. If that fails, it falls back to [`backend/app/data/sample_latest.json`](backend/app/data/sample_latest.json).

| URL | Purpose |
| --- | --- |
| http://127.0.0.1:8000/api/docs | Swagger |
| http://127.0.0.1:8000/api/v1/health | Health |
| http://127.0.0.1:8000/api/v1/dashboard/summary | Overview aggregates |
| http://127.0.0.1:8000/api/v1/prices | Filtered Latest rows |

### 4. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5175

## App pages

| Route | Purpose |
| --- | --- |
| `/` | Overview — KPIs, category mix, commodity averages, map |
| `/prices` | Filterable commodity price table from Latest |
| `/markets` | Mapped markets + list |

## Project layout

```text
apps_script/          # Daily scrape + doGet JSON feed
backend/              # FastAPI
frontend/             # React dashboard
docs/
  SYSTEM.md           # System overview
  SCRAPER.md          # Scraper documentation
README.md
```

## Notes

- Org policies that block service-account keys are fine: the dashboard reads the Sheet through the Apps Script web app, not a JSON key.
- Frontend proxy: Vite forwards `/api` → `http://127.0.0.1:8000`.
- Cache: backend caches Latest rows for `CACHE_TTL_SECONDS` (default 300).
