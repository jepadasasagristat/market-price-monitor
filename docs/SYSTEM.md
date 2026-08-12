# Presyong Palengke — System Overview

**Product name:** Presyong Palengke  
**Tagline:** Market Price Monitoring  
**Data source:** Google Sheet tab **Latest** (filled by Bantay Presyo Apps Script scraper)

## Purpose

Give DA staff and the public a clear web view of wet-market commodity prices scraped from [Bantay Presyo](http://www.bantaypresyo.da.gov.ph/tbl_meat.php), without browsing region/category dropdowns one at a time.

## Context diagram

```text
┌────────────────────┐     HTTPS      ┌────────────────────┐
│ React SPA          │ ◄────────────► │ FastAPI            │
│ Overview / Prices  │   /api/v1/*    │ cache + filters    │
│ Markets map        │                └─────────┬──────────┘
└────────────────────┘                          │
                                                │ GET ?action=latest
                                      ┌─────────▼──────────┐
                                      │ Apps Script doGet  │
                                      │ (Web app /exec)    │
                                      └─────────┬──────────┘
                                                │
                                      ┌─────────▼──────────┐
                                      │ Google Sheet       │
                                      │ Latest / Markets   │
                                      └─────────┬──────────┘
                                                │
                                      ┌─────────▼──────────┐
                                      │ Code.gs startDaily │
                                      │ ← Bantay Presyo    │
                                      └────────────────────┘
```

This mirrors the **Agricultural Statistics Data Bank** pattern:

- Browser SPA (React + TypeScript + Vite + TanStack Query)
- FastAPI REST API under `/api/v1`
- Clear separation of ingestion (scraper) vs presentation (dashboard)

Unlike ASDB, this prototype does not use PostgreSQL or session auth. The Sheet is the system of record for Latest prices.

## Frontend routes

| Path | Page |
| --- | --- |
| `/` | Dashboard overview |
| `/prices` | Commodity price browser |
| `/markets` | Map + market directory |

Visual language follows ASDB tokens (DA green `#06402B`, canvas `#f4f7f4`, Source Sans / display serif).

## Backend endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/health` | Service + row count |
| GET | `/api/v1/dashboard/summary` | Aggregates for overview |
| GET | `/api/v1/prices` | Paginated / filtered Latest rows |
| GET | `/api/v1/prices/filters` | Distinct regions, categories, commodities, markets |

Query params commonly supported: `region`, `category`, `commodity`, `market`, `q`, `priced_only`, `limit`, `offset`, `refresh`.

## Configuration

| Variable | Layer | Purpose |
| --- | --- | --- |
| `SHEETS_WEBAPP_URL` | backend `.env` | Apps Script `/exec` URL |
| `CACHE_TTL_SECONDS` | backend | In-memory cache TTL |
| `CORS_ORIGINS` | backend | Allowed frontend origins |

## Related docs

- [SCRAPER.md](SCRAPER.md) — how Latest is produced
- Root [README.md](../README.md) — run instructions
