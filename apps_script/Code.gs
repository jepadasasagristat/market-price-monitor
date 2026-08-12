/**
 * Bantay Presyo -> Google Sheets (+ Presyong Palengke JSON feed)
 *
 * Documentation: ../docs/SCRAPER.md · ../docs/SYSTEM.md · ../README.md
 *
 * Paste this file into Extensions > Apps Script on your spreadsheet.
 * Run startDaily() once to authorize, then createDailyTrigger() for 8:00 AM Manila.
 * Deploy doGet as a Web app so the FastAPI dashboard can read the Latest tab.
 *
 * Script properties (optional):
 *   MEAT_ONLY = true          // only Meat and Poultry
 *   REGIONS   = NCR,CAR       // comma-separated names or codes
 *   CATEGORIES = Rice,Fish,8  // ignored when MEAT_ONLY=true
 *   GEOCODE   = false         // skip lat/lng lookup
 *
 * Bantay Presyo does not publish province or city. Those are inferred from
 * PSA PSGC city/municipality names (same region) + geocoding, then cached
 * on the Markets sheet. Set manual_override=TRUE there to keep a correction.
 */

var BASE_URL = 'http://www.bantaypresyo.da.gov.ph';
var PAGE_URL = BASE_URL + '/tbl_meat.php';
var HEADER_URL = BASE_URL + '/tbl_price_get_comm_header_meat.php';
var PRICE_URL = BASE_URL + '/tbl_price_get_comm_price_meat.php';
var PSGC_CITIES_URL = 'https://raw.githubusercontent.com/xemasiv/psgc2/master/cities.json';
var PSGC_MUNICIPALITIES_URL = 'https://raw.githubusercontent.com/xemasiv/psgc2/master/municipalities.json';
var PHOTON_URL = 'https://photon.komoot.io/api/';
var OPEN_METEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
var NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

var SHEET_LATEST = 'Latest';
var SHEET_HISTORY = 'History';
var SHEET_SUMMARY = 'Summary';
var SHEET_LOG = 'Run Log';
var SHEET_MARKETS = 'Markets';
var SHEET_LGU = 'LGU Reference';

var HEADERS = [
  'scraped_at',
  'as_of_date',
  'as_of_date_iso',
  'region_code',
  'region_name',
  'province',
  'city_municipality',
  'category_code',
  'category_name',
  'commodity',
  'specifications',
  'market',
  'lat',
  'lng',
  'price',
  'price_raw'
];

var SUMMARY_HEADERS = [
  'scraped_at',
  'as_of_date',
  'as_of_date_iso',
  'region_code',
  'region_name',
  'category_code',
  'category_name',
  'commodity_count',
  'market_count',
  'row_count',
  'priced_count',
  'na_count'
];

var LOG_HEADERS = [
  'run_started_at',
  'run_finished_at',
  'status',
  'row_count',
  'combo_count',
  'error_count',
  'duration_seconds',
  'notes'
];

var MARKET_HEADERS = [
  'region_code',
  'region_name',
  'market',
  'province',
  'city_municipality',
  'geocode_query',
  'address',
  'lat',
  'lng',
  'location_source',
  'geocode_status',
  'manual_override',
  'updated_at'
];

var LGU_HEADERS = [
  'region_name',
  'province',
  'city_municipality',
  'match_names',
  'lat',
  'lng'
];

var ALL_REGIONS = [
  ['140000000', 'CAR'],
  ['010000000', 'Region I'],
  ['020000000', 'Region II'],
  ['030000000', 'Region III'],
  ['040000000', 'Region IV-A'],
  ['170000000', 'Region IV-B'],
  ['050000000', 'Region V'],
  ['060000000', 'Region VI'],
  ['070000000', 'Region VII'],
  ['080000000', 'Region VIII'],
  ['090000000', 'Region IX'],
  ['100000000', 'Region X'],
  ['110000000', 'Region XI'],
  ['120000000', 'Region XII'],
  ['130000000', 'NCR'],
  ['150000000', 'BARMM'],
  ['160000000', 'Region XIII']
];

var ALL_CATEGORIES = [
  ['1', 'Rice'],
  ['2', 'Corn'],
  ['3', 'Legumes'],
  ['4', 'Fish'],
  ['5', 'Fruits'],
  ['6', 'Highland Vegetables'],
  ['7', 'Lowland Vegetables'],
  ['8', 'Meat and Poultry'],
  ['9', 'Spices'],
  ['10', 'Other Commodities']
];

var STATE_KEY = 'BP_STATE';
var MAX_RUNTIME_MS = 4.5 * 60 * 1000;
var MAX_GEOCODES_PER_RUN = 60;
var GEOCODE_DELAY_MS = 150;

function startDaily() {
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ssXXX");
  var targets = resolveTargets_();
  var state = {
    startedAt: now,
    startedMs: Date.now(),
    scrapedAt: now,
    regionIndex: 0,
    categoryIndex: 0,
    rowCount: 0,
    comboCount: targets.regions.length * targets.categories.length,
    errors: [],
    geocodedCount: 0,
    phase: 'scrape',
    done: false
  };
  saveState_(state);
  ensureLguReference_();
  ensureSheet_(SHEET_MARKETS, MARKET_HEADERS, false);
  ensureSheet_(SHEET_LATEST, HEADERS, true);
  ensureSheet_(SHEET_HISTORY, HEADERS, false);
  ensureSheet_(SHEET_SUMMARY, SUMMARY_HEADERS, true);
  ensureSheet_(SHEET_LOG, LOG_HEADERS, false);
  continueDaily();
}

function continueDaily() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return;
  }

  try {
    var state = loadState_();
    if (!state || state.done) {
      return;
    }
    if (!state.phase) {
      state.phase = 'scrape';
    }

    var deadline = Date.now() + MAX_RUNTIME_MS;
    var lguIndex = null;
    var marketStore = null;

    if (state.phase === 'scrape') {
      var targets = resolveTargets_();
      lguIndex = loadLguIndex_();
      marketStore = loadMarketStore_();
      marketStore.lguIndex = lguIndex;

      while (Date.now() < deadline && state.phase === 'scrape') {
        var region = targets.regions[state.regionIndex];
        var category = targets.categories[state.categoryIndex];
        try {
          var parsed = scrapeCombo_(region, category, state.scrapedAt, lguIndex, marketStore);
          appendRows_(SHEET_LATEST, HEADERS, parsed.rows);
          appendRows_(SHEET_HISTORY, HEADERS, parsed.rows);
          appendRows_(SHEET_SUMMARY, SUMMARY_HEADERS, [parsed.summary]);
          state.rowCount += parsed.rows.length;
        } catch (err) {
          state.errors.push(region[1] + ' / ' + category[1] + ': ' + err.message);
        }

        state.categoryIndex += 1;
        if (state.categoryIndex >= targets.categories.length) {
          state.categoryIndex = 0;
          state.regionIndex += 1;
        }
        if (state.regionIndex >= targets.regions.length) {
          state.phase = geocodeEnabled_() ? 'geocode' : 'done';
        }
        saveState_(state);
      }
    }

    if (state.phase === 'geocode' && Date.now() < deadline) {
      if (!marketStore) {
        marketStore = loadMarketStore_();
      }
      if (!lguIndex) {
        lguIndex = loadLguIndex_();
      }
      marketStore.lguIndex = lguIndex;
      state.geocodedCount = (state.geocodedCount || 0) + geocodePendingMarkets_(marketStore, deadline);
      backfillLatestCoordinates_(marketStore);
      if (!hasPendingGeocodes_(marketStore)) {
        state.phase = 'done';
      }
      saveState_(state);
    }

    if (state.phase === 'done') {
      state.done = true;
      if (!state.geocodeOnly) {
        writeSummaryAndLog_(state);
      } else {
        appendRows_(SHEET_LOG, LOG_HEADERS, [[
          state.startedAt,
          Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ssXXX"),
          'geocode_done',
          state.rowCount,
          0,
          state.errors.length,
          Math.round((Date.now() - state.startedMs) / 1000),
          'geocoded ' + (state.geocodedCount || 0) + ' market(s); remaining empty: ' + countEmptyMarkets_()
        ]]);
      }
      clearState_();
      deleteContinuationTriggers_();
      return;
    }

    scheduleContinuation_();
  } finally {
    lock.releaseLock();
  }
}

function createDailyTrigger() {
  deleteTriggersByHandler_('startDaily');
  ScriptApp.newTrigger('startDaily')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .inTimezone('Asia/Manila')
    .create();
}

function refreshLguReference() {
  refreshLguReference_(true);
}

function geocodePendingMarkets() {
  return fillMarketCoordinates();
}

/**
 * Geocode every Markets row that still lacks lat/lng.
 * Continues automatically under the Apps Script time limit.
 * Also retries previous not_found rows with improved fallbacks.
 */
function fillMarketCoordinates() {
  resetFailedGeocodes_();
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ssXXX");
  var state = {
    startedAt: now,
    startedMs: Date.now(),
    scrapedAt: now,
    regionIndex: 0,
    categoryIndex: 0,
    rowCount: 0,
    comboCount: 0,
    errors: [],
    geocodedCount: 0,
    phase: 'geocode',
    done: false,
    geocodeOnly: true
  };
  saveState_(state);
  ensureSheet_(SHEET_MARKETS, MARKET_HEADERS, false);
  continueDaily();
}

function resolveTargets_() {
  var props = PropertiesService.getScriptProperties();
  var meatOnly = String(props.getProperty('MEAT_ONLY') || '').toLowerCase() === 'true';
  var regionFilter = parseList_(props.getProperty('REGIONS'));
  var categoryFilter = parseList_(props.getProperty('CATEGORIES'));

  var regions = ALL_REGIONS.filter(function (item) {
    return !regionFilter.length || regionFilter.indexOf(item[0]) >= 0 || regionFilter.indexOf(item[1].toLowerCase()) >= 0;
  });
  var categories = ALL_CATEGORIES.filter(function (item) {
    if (meatOnly) {
      return item[0] === '8';
    }
    return !categoryFilter.length || categoryFilter.indexOf(item[0]) >= 0 || categoryFilter.indexOf(item[1].toLowerCase()) >= 0;
  });

  if (!regions.length) {
    throw new Error('No regions matched the REGIONS script property.');
  }
  if (!categories.length) {
    throw new Error('No categories matched the CATEGORIES / MEAT_ONLY script property.');
  }
  return { regions: regions, categories: categories };
}

function geocodeEnabled_() {
  return String(PropertiesService.getScriptProperties().getProperty('GEOCODE') || 'true').toLowerCase() !== 'false';
}

function scrapeCombo_(region, category, scrapedAt, lguIndex, marketStore) {
  var payload = { region: region[0], commodity: category[0] };
  var dateText = postForm_(PAGE_URL, Object.assign({ action: 'get_latest_date' }, payload));
  var headerHtml = postForm_(HEADER_URL, payload);
  var priceHtml = postForm_(PRICE_URL, payload);

  var asOf = parseAsOfDate_(dateText);
  var markets = parseHeaderMarkets_(headerHtml);
  var parsedRows = parsePriceRows_(priceHtml, markets);
  if (!markets.length) {
    throw new Error('Empty table header');
  }
  if (!parsedRows.length) {
    throw new Error('No price rows returned');
  }

  var locationByMarket = {};
  markets.forEach(function (market) {
    locationByMarket[market] = upsertMarket_(marketStore, lguIndex, region, market);
  });

  var commodities = {};
  var pricedCount = 0;
  var naCount = 0;
  var rows = parsedRows.map(function (item) {
    commodities[item.commodity] = true;
    if (item.price === '') {
      naCount += 1;
    } else {
      pricedCount += 1;
    }
    var loc = locationByMarket[item.market] || {};
    return [
      scrapedAt,
      asOf.label,
      asOf.iso,
      region[0],
      region[1],
      loc.province || '',
      loc.city || '',
      category[0],
      category[1],
      item.commodity,
      item.specifications,
      item.market,
      loc.lat || '',
      loc.lng || '',
      item.price,
      item.priceRaw
    ];
  });

  return {
    rows: rows,
    summary: [
      scrapedAt,
      asOf.label,
      asOf.iso,
      region[0],
      region[1],
      category[0],
      category[1],
      Object.keys(commodities).length,
      markets.length,
      rows.length,
      pricedCount,
      naCount
    ]
  };
}

function postForm_(url, payload) {
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 BantayPresyoSheetsParser',
      Referer: PAGE_URL
    }
  });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('HTTP ' + code + ' for ' + url);
  }
  return response.getContentText();
}

function parseAsOfDate_(text) {
  var label = normalizeText_(text);
  if (!label || /no available date|date unavailable/i.test(label)) {
    return { label: '', iso: '' };
  }
  var match = label.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) {
    return { label: label, iso: '' };
  }
  var months = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  };
  var month = months[match[1].toLowerCase()];
  if (!month) {
    return { label: label, iso: '' };
  }
  var day = ('0' + match[2]).slice(-2);
  return { label: label, iso: match[3] + '-' + month + '-' + day };
}

function parseHeaderMarkets_(html) {
  var labels = extractTagTexts_(html, 'th');
  if (labels.length >= 2 && labels[0].toUpperCase() === 'COMMODITY') {
    return labels.slice(2);
  }
  return labels.filter(function (label) {
    var upper = label.toUpperCase();
    return upper !== 'COMMODITY' && upper !== 'SPECIFICATIONS';
  });
}

function parsePriceRows_(html, markets) {
  var rows = [];
  var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var trMatch;
  while ((trMatch = trRe.exec(html))) {
    var cells = extractTagTexts_(trMatch[1], 'td');
    if (cells.length < 3 || !cells[0]) {
      continue;
    }
    var commodity = cells[0];
    var specifications = cells[1];
    var values = cells.slice(2);
    for (var i = 0; i < markets.length; i++) {
      var raw = i < values.length ? values[i] : '';
      rows.push({
        commodity: commodity,
        specifications: specifications,
        market: markets[i],
        price: parsePrice_(raw),
        priceRaw: normalizeText_(raw)
      });
    }
  }
  return rows;
}

function extractTagTexts_(html, tag) {
  var re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'gi');
  var out = [];
  var match;
  while ((match = re.exec(html))) {
    out.push(normalizeText_(match[1].replace(/<[^>]+>/g, ' ')));
  }
  return out;
}

function parsePrice_(raw) {
  var text = normalizeText_(raw);
  if (!text || /^(n\/a|na|-|--|none|null)$/i.test(text)) {
    return '';
  }
  var number = Number(text.replace(/,/g, ''));
  return isNaN(number) ? '' : number;
}

function normalizeText_(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMatch_(value) {
  return normalizeText_(value)
    .replace(/[ñÑ]/g, 'N')
    .toUpperCase()
    .replace(/MT\.?\s*PROVINCE/g, 'MOUNTAIN PROVINCE')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureSheet_(name, headers, clear) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (clear) {
    sheet.clear();
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return sheet;
  }

  var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  var same = headers.every(function (header, index) {
    return String(existing[index] || '') === header;
  });
  if (!same) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sheet;
}

function appendRows_(name, headers, rows) {
  if (!rows.length) {
    return;
  }
  var sheet = ensureSheet_(name, headers, false);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function writeSummaryAndLog_(state) {
  var finishedAt = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ssXXX");
  var status = state.rowCount && !state.errors.length ? 'success' : (state.rowCount ? 'partial' : 'failed');
  var notes = state.errors.slice(0, 8).join(' | ');
  if (state.geocodedCount) {
    notes = (notes ? notes + ' | ' : '') + 'geocoded ' + state.geocodedCount + ' market(s)';
  }
  appendRows_(SHEET_LOG, LOG_HEADERS, [[
    state.startedAt,
    finishedAt,
    status,
    state.rowCount,
    state.comboCount,
    state.errors.length,
    Math.round((Date.now() - state.startedMs) / 1000),
    notes
  ]]);
}

function parseList_(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(',')
    .map(function (part) { return part.trim().toLowerCase(); })
    .filter(Boolean);
}

function saveState_(state) {
  PropertiesService.getScriptProperties().setProperty(STATE_KEY, JSON.stringify(state));
}

function loadState_() {
  var raw = PropertiesService.getScriptProperties().getProperty(STATE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function clearState_() {
  PropertiesService.getScriptProperties().deleteProperty(STATE_KEY);
}

function scheduleContinuation_() {
  deleteContinuationTriggers_();
  ScriptApp.newTrigger('continueDaily').timeBased().after(30 * 1000).create();
}

function deleteContinuationTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'continueDaily') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function deleteTriggersByHandler_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function ensureLguReference_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LGU);
  if (!sheet || sheet.getLastRow() < 2) {
    refreshLguReference_(false);
    return;
  }
  ensureSheet_(SHEET_LGU, LGU_HEADERS, false);
  // Older sheets only had 4 columns; pad lat/lng if missing.
  if (sheet.getLastColumn() < LGU_HEADERS.length) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var blanks = [];
      for (var i = 0; i < lastRow - 1; i++) {
        blanks.push(['', '']);
      }
      sheet.getRange(2, 5, lastRow - 1, 2).setValues(blanks);
    }
  }
}

function refreshLguReference_(force) {
  var sheet = ensureSheet_(SHEET_LGU, LGU_HEADERS, true);
  var cities = fetchJson_(PSGC_CITIES_URL);
  var municipalities = fetchJson_(PSGC_MUNICIPALITIES_URL);
  var rows = [];
  var seen = {};

  function addItem(item) {
    var regionName = mapPsgcRegion_(item.region);
    if (!regionName) {
      return;
    }
    var province = regionName === 'NCR' ? 'Metro Manila' : displayPlaceName_(item.province || '');
    var city = displayCityName_(item.name);
    var key = regionName + '|' + province + '|' + city;
    if (seen[key]) {
      return;
    }
    seen[key] = true;
    rows.push([regionName, province, city, buildMatchNames_(item.name, city).join('|'), '', '']);
  }

  (cities || []).forEach(addItem);
  (municipalities || []).forEach(addItem);

  if (!rows.length) {
    throw new Error('Could not load PSA city/municipality reference.');
  }
  sheet.getRange(2, 1, rows.length, LGU_HEADERS.length).setValues(rows);
  return rows.length;
}

function fetchJson_(url) {
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'BantayPresyoSheetsParser/1.0'
    }
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('HTTP ' + response.getResponseCode() + ' for ' + url);
  }
  return JSON.parse(response.getContentText());
}

function mapPsgcRegion_(label) {
  var value = String(label || '').toUpperCase();
  if (value.indexOf('NATIONAL CAPITAL') >= 0 || /\bNCR\b/.test(value)) return 'NCR';
  if (value.indexOf('CORDILLERA') >= 0 || /\bCAR\b/.test(value)) return 'CAR';
  if (value.indexOf('ILOCOS') >= 0) return 'Region I';
  if (value.indexOf('CAGAYAN VALLEY') >= 0) return 'Region II';
  if (value.indexOf('CENTRAL LUZON') >= 0) return 'Region III';
  if (value.indexOf('CALABARZON') >= 0 || value.indexOf('IV-A') >= 0) return 'Region IV-A';
  if (value.indexOf('MIMAROPA') >= 0 || value.indexOf('IV-B') >= 0) return 'Region IV-B';
  if (value.indexOf('BICOL') >= 0) return 'Region V';
  if (value.indexOf('WESTERN VISAYAS') >= 0) return 'Region VI';
  if (value.indexOf('CENTRAL VISAYAS') >= 0) return 'Region VII';
  if (value.indexOf('EASTERN VISAYAS') >= 0) return 'Region VIII';
  if (value.indexOf('ZAMBOANGA PENINSULA') >= 0) return 'Region IX';
  if (value.indexOf('NORTHERN MINDANAO') >= 0) return 'Region X';
  if (value.indexOf('DAVAO REGION') >= 0) return 'Region XI';
  if (value.indexOf('SOCCSKSARGEN') >= 0) return 'Region XII';
  if (value.indexOf('BARMM') >= 0 || value.indexOf('MUSLIM MINDANAO') >= 0 || value.indexOf('ARMM') >= 0) return 'BARMM';
  if (value.indexOf('CARAGA') >= 0) return 'Region XIII';
  return '';
}

function displayPlaceName_(value) {
  return titleCase_(String(value || '').replace(/\s*\(capital\)\s*/ig, '').trim());
}

function displayCityName_(raw) {
  var name = String(raw || '').replace(/\s*\(capital\)\s*/ig, '').trim();
  var match = name.match(/^city of\s+(.+)$/i);
  if (match) {
    return titleCase_(match[1]) + ' City';
  }
  return titleCase_(name);
}

function titleCase_(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|[\s'\-])([a-zñ])/g, function (_, prefix, letter) {
      return prefix + letter.toUpperCase();
    });
}

function buildMatchNames_(raw, display) {
  var aliases = {};
  function add(value) {
    var normalized = normalizeMatch_(value);
    if (normalized && normalized !== 'CITY' && normalized.length >= 3) {
      aliases[normalized] = true;
    }
  }
  add(raw);
  add(display);
  add(String(raw || '').replace(/\s*\(capital\)\s*/ig, ''));
  add(String(raw || '').replace(/^city of\s+/i, ''));
  add(String(raw || '').replace(/\s+city$/i, ''));
  add(String(display || '').replace(/\s+city$/i, ''));
  add(String(raw || '').replace(/^city of\s+/i, '').replace(/\s*\(capital\)\s*/ig, '').replace(/\s+city$/i, ''));
  return Object.keys(aliases).sort(function (a, b) {
    return b.length - a.length;
  });
}

function loadLguIndex_() {
  ensureLguReference_();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LGU);
  var lastRow = sheet.getLastRow();
  var index = {};
  if (lastRow < 2) {
    return index;
  }
  var values = sheet.getRange(2, 1, lastRow - 1, LGU_HEADERS.length).getValues();
  values.forEach(function (row, offset) {
    var regionName = String(row[0] || '');
    if (!regionName) {
      return;
    }
    if (!index[regionName]) {
      index[regionName] = [];
    }
    index[regionName].push({
      province: String(row[1] || ''),
      city: String(row[2] || ''),
      aliases: String(row[3] || '').split('|').filter(Boolean),
      lat: row[4] === '' || row[4] === null || row[4] === undefined ? '' : Number(row[4]),
      lng: row[5] === '' || row[5] === null || row[5] === undefined ? '' : Number(row[5]),
      sheetRow: offset + 2
    });
  });
  index.__sheet = sheet;
  return index;
}

function loadMarketStore_() {
  var sheet = ensureSheet_(SHEET_MARKETS, MARKET_HEADERS, false);
  var lastRow = sheet.getLastRow();
  var cache = {};
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, MARKET_HEADERS.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var key = marketKey_(values[i][0], values[i][2]);
      cache[key] = { row: i + 2, values: values[i] };
    }
  }
  return {
    sheet: sheet,
    cache: cache,
    nextRow: Math.max(lastRow + 1, 2),
    geocodedThisRun: 0
  };
}

function marketKey_(regionCode, market) {
  return String(regionCode || '') + '|' + String(market || '');
}

function isManualOverride_(value) {
  var text = String(value || '').toLowerCase();
  return text === 'true' || text === 'yes' || text === '1';
}

function inferLocation_(regionName, market, lguIndex) {
  var haystack = normalizeMatch_(market);
  var hints = extractMarketHints_(market).map(normalizeMatch_).filter(Boolean);
  var lgus = lguIndex[regionName] || [];
  var provinceHint = '';

  lgus.forEach(function (lgu) {
    var provinceName = normalizeMatch_(lgu.province);
    if (!provinceName || provinceHint) {
      return;
    }
    if (hints.indexOf(provinceName) >= 0 || (' ' + haystack + ' ').indexOf(' ' + provinceName + ' ') >= 0) {
      provinceHint = lgu.province;
    }
  });

  var candidates = provinceHint
    ? lgus.filter(function (lgu) { return lgu.province === provinceHint; })
    : lgus;

  var best = null;
  var bestLength = 0;
  var bestFromHint = false;
  candidates.forEach(function (lgu) {
    (lgu.aliases || []).forEach(function (alias) {
      if (!alias || alias.length < bestLength) {
        return;
      }
      var inHint = hints.indexOf(alias) >= 0;
      var inName = haystack.indexOf(alias) >= 0;
      if (!inHint && !inName) {
        return;
      }
      if (alias.length > bestLength || (alias.length === bestLength && inHint && !bestFromHint)) {
        best = lgu;
        bestLength = alias.length;
        bestFromHint = inHint;
      }
    });
  });

  var province = best ? best.province : (provinceHint || (regionName === 'NCR' ? 'Metro Manila' : ''));
  var city = best ? best.city : '';
  var source = '';
  if (best) {
    source = 'lgu_match';
  } else if (provinceHint) {
    source = 'name_hint';
  }
  return {
    province: province,
    city: city,
    source: source
  };
}

function extractMarketHints_(market) {
  var hints = [];
  var parenRe = /\(([^)]+)\)/g;
  var match;
  while ((match = parenRe.exec(market))) {
    hints.push(String(match[1] || '').replace(/MT\.?\s*/i, 'Mountain ').trim());
  }
  var comma = String(market || '').match(/^([^,()]+),\s*([^,()]+?)(?=\s+(?:PUBLIC|WET|FARMERS|CITY|NEW|YELLOW|MARKET)\b|$)/i);
  if (comma) {
    hints.push(comma[1].trim());
    hints.push(comma[2].trim());
  }
  return hints.filter(Boolean);
}

function buildGeocodeQuery_(market, city, province, regionName) {
  var parts = [market];
  var marketNorm = normalizeMatch_(market);
  if (city && marketNorm.indexOf(normalizeMatch_(city)) < 0) {
    parts.push(city);
  }
  if (province && province !== 'Metro Manila' && marketNorm.indexOf(normalizeMatch_(province)) < 0) {
    parts.push(province);
  }
  parts.push(regionName === 'NCR' ? 'Metro Manila' : regionName);
  parts.push('Philippines');
  return parts.join(', ');
}

function upsertMarket_(store, lguIndex, region, market) {
  var key = marketKey_(region[0], market);
  var inferred = inferLocation_(region[1], market, lguIndex || {});
  var query = buildGeocodeQuery_(market, inferred.city, inferred.province, region[1]);
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ssXXX");

  if (store.cache[key]) {
    var existing = store.cache[key].values.slice();
    if (!isManualOverride_(existing[11])) {
      var changed = false;
      if (!existing[3] && inferred.province) {
        existing[3] = inferred.province;
        changed = true;
      }
      if (!existing[4] && inferred.city) {
        existing[4] = inferred.city;
        changed = true;
      }
      if (!existing[5]) {
        existing[5] = query;
        changed = true;
      }
      if (!existing[9] && inferred.source) {
        existing[9] = inferred.source;
        changed = true;
      }
      if (changed) {
        existing[12] = now;
        store.sheet.getRange(store.cache[key].row, 1, 1, MARKET_HEADERS.length).setValues([existing]);
        store.cache[key].values = existing;
      }
    }
    maybeGeocodeMarketRow_(store, store.cache[key]);
    return locationFromMarketRow_(store.cache[key].values);
  }

  var row = [
    region[0],
    region[1],
    market,
    inferred.province,
    inferred.city,
    query,
    '',
    '',
    '',
    inferred.source,
    'pending_geocode',
    false,
    now
  ];
  store.sheet.getRange(store.nextRow, 1, 1, MARKET_HEADERS.length).setValues([row]);
  store.cache[key] = { row: store.nextRow, values: row };
  store.nextRow += 1;
  maybeGeocodeMarketRow_(store, store.cache[key]);
  return locationFromMarketRow_(store.cache[key].values);
}

function locationFromMarketRow_(values) {
  return {
    province: values[3] || '',
    city: values[4] || '',
    lat: values[7] || '',
    lng: values[8] || '',
    source: values[9] || ''
  };
}

function hasPendingGeocodes_(store) {
  return Object.keys(store.cache).some(function (key) {
    var values = store.cache[key].values;
    if (isManualOverride_(values[11])) {
      return false;
    }
    if (values[7] !== '' && values[8] !== '') {
      return false;
    }
    var status = String(values[10] || '');
    // Only keep chaining while rows are still awaiting a try.
    // not_found means we already tried in this pass; use fillMarketCoordinates to retry.
    return status === '' || status === 'pending_geocode' || status.indexOf('error') === 0;
  });
}

function countEmptyMarkets_() {
  var store = loadMarketStore_();
  var empty = 0;
  Object.keys(store.cache).forEach(function (key) {
    var values = store.cache[key].values;
    if (isManualOverride_(values[11])) {
      return;
    }
    if (values[7] === '' || values[8] === '') {
      empty += 1;
    }
  });
  return empty;
}

function resetFailedGeocodes_() {
  var store = loadMarketStore_();
  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ssXXX");
  Object.keys(store.cache).forEach(function (key) {
    var rec = store.cache[key];
    var values = rec.values;
    if (isManualOverride_(values[11])) {
      return;
    }
    if (values[7] !== '' && values[8] !== '') {
      return;
    }
    var status = String(values[10] || '');
    if (status === 'pending_geocode' || status === '') {
      return;
    }
    var updated = values.slice();
    updated[10] = 'pending_geocode';
    updated[12] = now;
    store.sheet.getRange(rec.row, 1, 1, MARKET_HEADERS.length).setValues([updated]);
    rec.values = updated;
  });
}

function maybeGeocodeMarketRow_(store, rec) {
  if (!geocodeEnabled_() || !rec) {
    return 0;
  }
  if (isManualOverride_(rec.values[11])) {
    return 0;
  }
  if (rec.values[7] !== '' && rec.values[8] !== '') {
    return 0;
  }
  if ((store.geocodedThisRun || 0) >= MAX_GEOCODES_PER_RUN) {
    return 0;
  }
  applyGeocodeResult_(store, rec, store.lguIndex || null);
  store.geocodedThisRun = (store.geocodedThisRun || 0) + 1;
  Utilities.sleep(GEOCODE_DELAY_MS);
  return 1;
}

function geocodePendingMarkets_(store, deadline) {
  var pending = [];
  Object.keys(store.cache).forEach(function (key) {
    var rec = store.cache[key];
    if (isManualOverride_(rec.values[11])) {
      return;
    }
    if (rec.values[7] !== '' && rec.values[8] !== '') {
      return;
    }
    var status = String(rec.values[10] || '');
    if (!(status === '' || status === 'pending_geocode' || status.indexOf('error') === 0)) {
      return;
    }
    pending.push(rec);
  });

  // Prefer rows that already have city/province so city-centroid fallback can succeed.
  pending.sort(function (a, b) {
    var aScore = (a.values[4] ? 2 : 0) + (a.values[3] ? 1 : 0);
    var bScore = (b.values[4] ? 2 : 0) + (b.values[3] ? 1 : 0);
    return bScore - aScore;
  });

  var count = 0;
  for (var i = 0; i < pending.length && count < MAX_GEOCODES_PER_RUN && Date.now() < deadline; i++) {
    applyGeocodeResult_(store, pending[i], store.lguIndex || null);
    count += 1;
    if (i + 1 < pending.length && Date.now() < deadline) {
      Utilities.sleep(GEOCODE_DELAY_MS);
    }
  }
  return count;
}

function applyGeocodeResult_(store, rec, lguIndex) {
  var market = rec.values[2];
  var city = rec.values[4];
  var province = rec.values[3];
  var regionName = rec.values[1];
  var query = rec.values[5] || buildGeocodeQuery_(market, city, province, regionName);
  var fallbacks = buildFallbackQueries_(market, city, province, regionName);
  var result = geocodeMarket_(query, fallbacks);

  if (!result) {
    result = resolveCityCentroid_(lguIndex, regionName, province, city);
  }

  var now = Utilities.formatDate(new Date(), 'Asia/Manila', "yyyy-MM-dd'T'HH:mm:ssXXX");
  var updated = rec.values.slice();
  updated[5] = query;
  updated[12] = now;
  if (!result) {
    updated[10] = 'not_found';
  } else {
    updated[6] = result.address || updated[6] || '';
    updated[7] = result.lat;
    updated[8] = result.lng;
    if (!updated[3] && result.province) {
      updated[3] = result.province;
    }
    if (!updated[4] && result.city) {
      updated[4] = result.city;
    }
    updated[9] = String(updated[9] || '').replace(/\+?geocode/g, '').replace(/\+$/, '');
    updated[9] = updated[9] ? updated[9] + '+geocode' : 'geocode';
    updated[10] = result.provider ? 'ok:' + result.provider : 'ok';
  }
  store.sheet.getRange(rec.row, 1, 1, MARKET_HEADERS.length).setValues([updated]);
  rec.values = updated;
  store.cache[marketKey_(updated[0], updated[2])] = rec;
}

function resolveCityCentroid_(lguIndex, regionName, province, city) {
  if (!city) {
    return null;
  }
  var lgus = (lguIndex && lguIndex[regionName]) || [];
  var match = null;
  for (var i = 0; i < lgus.length; i++) {
    if (normalizeMatch_(lgus[i].city) === normalizeMatch_(city) &&
        (!province || normalizeMatch_(lgus[i].province) === normalizeMatch_(province))) {
      match = lgus[i];
      break;
    }
  }

  if (match && match.lat !== '' && match.lng !== '' && !isNaN(match.lat) && !isNaN(match.lng)) {
    return {
      lat: match.lat,
      lng: match.lng,
      address: [city, province, 'Philippines'].filter(Boolean).join(', '),
      city: city,
      province: province,
      provider: 'lgu_centroid'
    };
  }

  var cityQuery = province
    ? city + ', ' + province + ', Philippines'
    : city + ', ' + (regionName === 'NCR' ? 'Metro Manila' : regionName) + ', Philippines';
  var geocoded = geocodeMarket_(cityQuery, [
    city + ' Philippines',
    city + ', Philippines'
  ]);
  if (!geocoded) {
    return null;
  }

  if (match && lguIndex && lguIndex.__sheet && match.sheetRow) {
    match.lat = geocoded.lat;
    match.lng = geocoded.lng;
    lguIndex.__sheet.getRange(match.sheetRow, 5, 1, 2).setValues([[geocoded.lat, geocoded.lng]]);
  }

  geocoded.provider = (geocoded.provider || 'geocode') + ':city_approx';
  geocoded.address = geocoded.address || cityQuery;
  geocoded.city = geocoded.city || city;
  geocoded.province = geocoded.province || province;
  return geocoded;
}

function backfillLatestCoordinates_(store) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LATEST);
  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }
  var range = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length);
  var values = range.getValues();
  var changed = 0;
  for (var i = 0; i < values.length; i++) {
    var rec = store.cache[marketKey_(values[i][3], values[i][11])];
    if (!rec) {
      continue;
    }
    var loc = rec.values;
    if (loc[7] === '' || loc[8] === '') {
      continue;
    }
    var rowChanged = false;
    if (!values[i][5] && loc[3]) {
      values[i][5] = loc[3];
      rowChanged = true;
    }
    if (!values[i][6] && loc[4]) {
      values[i][6] = loc[4];
      rowChanged = true;
    }
    if (values[i][12] === '' || values[i][13] === '') {
      values[i][12] = loc[7];
      values[i][13] = loc[8];
      rowChanged = true;
    }
    if (rowChanged) {
      changed += 1;
    }
  }
  if (changed) {
    range.setValues(values);
  }
  return changed;
}

function buildFallbackQueries_(market, city, province, regionName) {
  var area = regionName === 'NCR' ? 'Metro Manila' : regionName;
  var cleanMarket = String(market || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(NEW|OLD|CITY|PUBLIC|WET|FARMERS|YELLOW|MEGA)\b/gi, ' ')
    .replace(/\bMARKET\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  var queries = [];
  if (city && province) {
    queries.push(city + ' public market, ' + province + ', Philippines');
    queries.push(city + ', ' + province + ', Philippines');
  }
  if (city) {
    queries.push(city + ' public market, ' + area + ', Philippines');
    queries.push(city + ', ' + area + ', Philippines');
  }
  if (cleanMarket && city) {
    queries.push(cleanMarket + ', ' + city + ', Philippines');
  }
  if (cleanMarket && province) {
    queries.push(cleanMarket + ', ' + province + ', Philippines');
  }
  queries.push(String(market || '') + ', ' + area + ', Philippines');
  if (cleanMarket) {
    queries.push(cleanMarket + ' market, ' + area + ', Philippines');
  }
  if (province) {
    queries.push(String(market || '') + ', ' + province + ', Philippines');
  }
  return queries;
}

function geocodeMarket_(query, fallbacks) {
  var queries = [query].concat(fallbacks || []).filter(function (item, index, all) {
    return item && String(item).trim() && all.indexOf(item) === index;
  });
  // Photon first: Google Maps often unavailable without Maps OAuth scope;
  // Nominatim is frequently blocked from Apps Script.
  var providers = [
    { name: 'photon', fn: geocodePhoton_ },
    { name: 'google', fn: geocodeGoogle_ },
    { name: 'open-meteo', fn: geocodeOpenMeteo_ },
    { name: 'nominatim', fn: geocodeNominatim_ }
  ];
  for (var q = 0; q < queries.length; q++) {
    for (var p = 0; p < providers.length; p++) {
      try {
        var result = providers[p].fn(queries[q]);
        if (result && isValidPhLatLng_(result.lat, result.lng)) {
          result.provider = providers[p].name;
          return result;
        }
      } catch (err) {
        // Try the next provider or query.
      }
    }
  }
  return null;
}

function isValidPhLatLng_(lat, lng) {
  var latitude = Number(lat);
  var longitude = Number(lng);
  return latitude >= 4 && latitude <= 22 && longitude >= 116 && longitude <= 127;
}

function numberOrCall_(value) {
  if (typeof value === 'function') {
    return Number(value());
  }
  return Number(value);
}

function geocodeGoogle_(query) {
  if (typeof Maps === 'undefined' || !Maps.newGeocoder) {
    return null;
  }
  var response = Maps.newGeocoder().setLanguage('en').setRegion('ph').geocode(query);
  if (!response) {
    return null;
  }
  var status = String(response.status || '').toUpperCase();
  var results = response.results;
  if (!Array.isArray(results)) {
    results = results ? [results] : [];
  }
  if (status && status !== 'OK') {
    return null;
  }
  if (!results.length) {
    return null;
  }
  var best = results[0];
  var location = best.geometry && best.geometry.location;
  if (!location) {
    return null;
  }
  var parsed = parseGoogleAddress_(best.address_components || []);
  return {
    lat: numberOrCall_(location.lat),
    lng: numberOrCall_(location.lng),
    address: best.formatted_address || '',
    city: parsed.city,
    province: parsed.province
  };
}

function parseGoogleAddress_(components) {
  var byType = {};
  components.forEach(function (component) {
    (component.types || []).forEach(function (type) {
      byType[type] = component.long_name;
    });
  });
  return {
    city: byType.locality || byType.postal_town || byType.administrative_area_level_3 || byType.sublocality || '',
    province: byType.administrative_area_level_2 || byType.administrative_area_level_1 || ''
  };
}

function geocodePhoton_(query) {
  var url = PHOTON_URL + '?q=' + encodeURIComponent(query) + '&limit=5';
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('Photon HTTP ' + response.getResponseCode());
  }
  var payload = JSON.parse(response.getContentText());
  var features = payload && payload.features ? payload.features : [];
  for (var i = 0; i < features.length; i++) {
    var feature = features[i];
    var properties = feature.properties || {};
    var country = String(properties.countrycode || properties.country || '').toUpperCase();
    if (country && country !== 'PH' && country !== 'PHILIPPINES') {
      continue;
    }
    var coords = feature.geometry && feature.geometry.coordinates;
    if (!coords || coords.length < 2) {
      continue;
    }
    return {
      lat: Number(coords[1]),
      lng: Number(coords[0]),
      address: [
        properties.name,
        properties.street,
        properties.city || properties.locality,
        properties.state,
        properties.country
      ].filter(Boolean).join(', '),
      city: properties.city || properties.locality || properties.district || '',
      province: properties.state || properties.county || ''
    };
  }
  return null;
}

function geocodeOpenMeteo_(query) {
  var url = OPEN_METEO_URL +
    '?name=' + encodeURIComponent(query) +
    '&count=5&language=en&format=json';
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('Open-Meteo HTTP ' + response.getResponseCode());
  }
  var payload = JSON.parse(response.getContentText());
  var results = payload && payload.results ? payload.results : [];
  for (var i = 0; i < results.length; i++) {
    var item = results[i];
    var country = String(item.country_code || item.country || '').toUpperCase();
    if (country && country !== 'PH' && country !== 'PHILIPPINES') {
      continue;
    }
    return {
      lat: Number(item.latitude),
      lng: Number(item.longitude),
      address: [item.name, item.admin2, item.admin1, item.country].filter(Boolean).join(', '),
      city: item.name || '',
      province: item.admin1 || ''
    };
  }
  return null;
}

function geocodeNominatim_(query) {
  var url = NOMINATIM_URL +
    '?q=' + encodeURIComponent(query) +
    '&format=json&addressdetails=1&limit=1&countrycodes=ph';
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 BantayPresyoSheetsParser/1.0'
    }
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('Nominatim HTTP ' + response.getResponseCode());
  }
  var results = JSON.parse(response.getContentText());
  if (!results || !results.length) {
    return null;
  }
  var best = results[0];
  var address = best.address || {};
  return {
    lat: Number(best.lat),
    lng: Number(best.lon),
    address: best.display_name || '',
    city: address.city || address.town || address.municipality || address.village || '',
    province: address.province || address.state || ''
  };
}

/**
 * Web API for Presyong Palengke dashboard.
 * Deploy: Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Examples:
 *   ?action=latest
 *   ?action=latest&region=NCR&category=Meat%20and%20Poultry
 *   ?action=summary
 *   ?action=markets
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = String(params.action || 'latest').toLowerCase();
  try {
    var payload;
    if (action === 'health') {
      payload = { status: 'ok', service: 'presyong-palengke-sheets' };
    } else if (action === 'summary') {
      payload = buildApiSummary_();
    } else if (action === 'markets') {
      payload = { items: readSheetObjects_(SHEET_MARKETS, MARKET_HEADERS) };
    } else {
      payload = {
        items: filterLatestRows_(readSheetObjects_(SHEET_LATEST, HEADERS), params),
        meta: latestMeta_()
      };
    }
    return jsonOutput_(payload);
  } catch (err) {
    return jsonOutput_({
      error: String(err && err.message ? err.message : err),
      status: 'error'
    });
  }
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheetObjects_(sheetName, headers) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }
  var width = headers.length;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues();
  return values.map(function (row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      var value = row[i];
      obj[headers[i]] = value === null || value === undefined ? '' : value;
    }
    return obj;
  }).filter(function (row) {
    return row.market || row.commodity || row.region_name;
  });
}

function filterLatestRows_(rows, params) {
  var region = normalizeMatch_(params.region || '');
  var category = normalizeMatch_(params.category || '');
  var commodity = normalizeMatch_(params.commodity || '');
  var market = normalizeMatch_(params.market || '');
  var q = normalizeMatch_(params.q || '');

  return rows.filter(function (row) {
    if (region && normalizeMatch_(row.region_name) !== region && normalizeMatch_(row.region_code) !== region) {
      return false;
    }
    if (category && normalizeMatch_(row.category_name) !== category && normalizeMatch_(row.category_code) !== category) {
      return false;
    }
    if (commodity && normalizeMatch_(row.commodity).indexOf(commodity) < 0) {
      return false;
    }
    if (market && normalizeMatch_(row.market).indexOf(market) < 0) {
      return false;
    }
    if (q) {
      var haystack = [
        row.commodity,
        row.specifications,
        row.market,
        row.region_name,
        row.province,
        row.city_municipality,
        row.category_name
      ].join(' ');
      if (normalizeMatch_(haystack).indexOf(q) < 0) {
        return false;
      }
    }
    return true;
  });
}

function latestMeta_() {
  var rows = readSheetObjects_(SHEET_LATEST, HEADERS);
  var asOf = '';
  var scrapedAt = '';
  rows.forEach(function (row) {
    if (!asOf && row.as_of_date) {
      asOf = row.as_of_date;
    }
    if (!scrapedAt && row.scraped_at) {
      scrapedAt = row.scraped_at;
    }
  });
  return {
    row_count: rows.length,
    as_of_date: asOf,
    scraped_at: scrapedAt,
    source: 'Latest'
  };
}

function buildApiSummary_() {
  var rows = readSheetObjects_(SHEET_LATEST, HEADERS);
  var regions = {};
  var categories = {};
  var markets = {};
  var commodities = {};
  var priced = 0;
  rows.forEach(function (row) {
    if (row.region_name) regions[row.region_name] = true;
    if (row.category_name) categories[row.category_name] = true;
    if (row.market) markets[row.region_name + '|' + row.market] = true;
    if (row.commodity) commodities[row.commodity] = true;
    if (row.price !== '' && row.price !== null && row.price !== undefined) {
      priced += 1;
    }
  });
  return {
    meta: latestMeta_(),
    counts: {
      rows: rows.length,
      priced_rows: priced,
      regions: Object.keys(regions).length,
      categories: Object.keys(categories).length,
      markets: Object.keys(markets).length,
      commodities: Object.keys(commodities).length
    },
    regions: Object.keys(regions).sort(),
    categories: Object.keys(categories).sort()
  };
}
