# Bantay Presyo scraper (Apps Script)

Scrapes [tbl_meat.php](http://www.bantaypresyo.da.gov.ph/tbl_meat.php) into Google Sheets and exposes **Latest** as JSON for Presyong Palengke.

## Setup

1. Create a Google Spreadsheet.
2. **Extensions → Apps Script** → paste [`apps_script/Code.gs`](../apps_script/Code.gs).
3. Optional: use [`apps_script/appsscript.json`](../apps_script/appsscript.json) (Asia/Manila, V8). Remove any custom `oauthScopes` block so Google can request permissions automatically.
4. Run **`startDaily`** once and approve prompts.
5. Run **`createDailyTrigger`** for 8:00 AM Asia/Manila.

### Script properties

| Property | Example | Effect |
| --- | --- | --- |
| `MEAT_ONLY` | `true` | Only Meat and Poultry |
| `REGIONS` | `NCR,CAR` | Limit regions |
| `CATEGORIES` | `Rice,Fish,8` | Limit categories |
| `GEOCODE` | `false` | Skip lat/lng |

## How scraping works

The page does not embed the table on first load. The script POSTs the same endpoints the browser uses:

| Request | Result |
| --- | --- |
| `tbl_meat.php` + `action=get_latest_date` | As-of date |
| `tbl_price_get_comm_header_meat.php` | Market headers |
| `tbl_price_get_comm_price_meat.php` | Price rows |

Wide HTML tables are unpivoted to one row per **region × category × commodity × market**.

Runs stop at 4.5 minutes, save a checkpoint, and continue via `continueDaily` until done.

## Sheets produced

| Sheet | Role |
| --- | --- |
| **Latest** | Overwritten each scrape (dashboard source of truth) |
| **History** | Append-only archive |
| **Summary** | Per region/category counts |
| **Markets** | Province, city, lat/lng directory |
| **LGU Reference** | PSA city/municipality list |
| **Run Log** | Success / partial / failed / geocode_done |

### Latest columns

`scraped_at`, `as_of_date`, `as_of_date_iso`, `region_code`, `region_name`, `province`, `city_municipality`, `category_code`, `category_name`, `commodity`, `specifications`, `market`, `lat`, `lng`, `price`, `price_raw`

## Location enrichment

Bantay Presyo does not publish province/city/coordinates. The script:

1. Matches market names to PSA LGUs in the same region
2. Uses name hints such as `(ZAMBALES)` or `AGOO, LA UNION`
3. Geocodes via Photon (primary), Google Maps, Open-Meteo, Nominatim
4. Falls back to city centroid when the exact market is missing (`ok:photon:city_approx`)

Use **`fillMarketCoordinates`** to finish empty lat/lng without re-scraping prices. Set `manual_override=TRUE` on **Markets** to protect hand edits.

## JSON feed for the dashboard (`doGet`)

Deploy as a Web App (Execute as Me, Anyone):

| Call | Payload |
| --- | --- |
| `?action=health` | Service ping |
| `?action=latest` | Latest rows (+ optional `region`, `category`, `commodity`, `market`, `q`) |
| `?action=summary` | Counts |
| `?action=markets` | Markets sheet rows |

Put the `/exec` URL in backend `SHEETS_WEBAPP_URL`.

## Manual functions

| Function | Use |
| --- | --- |
| `startDaily` | Full scrape |
| `continueDaily` | Auto-resume (trigger) |
| `createDailyTrigger` | Daily 8 AM Manila |
| `fillMarketCoordinates` | Geocode-only pass |
| `refreshLguReference` | Reload PSA LGU list |
| `doGet` | HTTP API for the web app |

## Troubleshooting

| Issue | Check |
| --- | --- |
| Empty Latest | Executions log; site timeouts |
| Empty lat/lng | Run `fillMarketCoordinates`; inspect `geocode_status` |
| Dashboard shows sample data | `SHEETS_WEBAPP_URL` missing or web app not deployed |
| Permission errors | Re-authorize; remove custom oauthScopes |
