# Crossword Archiving System — Unified Plan V3

**Last Updated**: 2026-05-29
**Status**: MERGED PLAN — Best of master-plan.md + Codex planv2.md
**Test Worker**: https://crossword-test-worker.slideshow.workers.dev

**Repos**:
- Backend: https://github.com/sujitbhai7710/all-crossword-worker
- Frontend: https://github.com/0xSatwik/crosasword-solver-and-answer
- Reference: https://github.com/thisisparker/xword-dl (Python crossword downloader)

**Production Endpoints**:
- https://crossword-archive-worker.mitomat.workers.dev (NYT Daily Archive)
- https://crossword-solver-api.mitomat.workers.dev (Solver API)
- https://nyt-mini-archive.nytsolver.workers.dev (NYT Mini Archive)

**Plan V3 Change Log** (what changed from previous plans):

| Item | master-plan.md (V1) | Codex planv2.md | Plan V3 (This Document) |
|------|---------------------|-----------------|--------------------------|
| USA Today Quick | ☠️ DEAD, remove | ✅ WORKING, keep | ✅ WORKING — keep with canary monitoring |
| Guardian date validation | `props.data?.number` fallback (broken) | Exact-date via `webPublicationDate` | Exact-date validation mandatory |
| Cron triggers | Per-worker crons (57 triggers) | Scheduler worker with <=5 account crons | Scheduler worker + queue fan-out |
| Cache API | Main global cache | Edge-local only, pair with static | 4-layer: static → Cache API → KV → D1 |
| Multi-account | Default architecture | Single-account-first | Single-account-first, shard only if measured |
| Write auth | GET + token-in-URL | POST + Bearer only | POST + Bearer only, reject if no secret |
| Analytics priority | Next big feature | Defer until core stable | Write code now, enable after read-plane fix |
| Cron limit in free tier | "5 per worker" (wrong) | "5 per account" (correct) | 5 per account — scheduler required |

---

## QUICK REFERENCE — SOURCE STATUS AT A GLANCE

| # | Source | Old Status | New Status | Can Fix? | Action Needed |
|---|--------|-----------|------------|----------|---------------|
| 1 | NYT Daily | ✅ Working | ✅ Working | — | Keep as-is |
| 2 | NYT Mini | ✅ Working | ✅ Working | — | Keep as-is |
| 3 | Atlantic | ✅ Working | ✅ Working | — | Keep as-is |
| 4 | LA Times Daily | ✅ Working | ✅ Working | — | Keep as-is |
| 5 | LA Times Mini | 🔴 Broken | ✅ **FIXED** | ✅ YES | Add loadToken from date-picker |
| 6 | USA Today Daily | ✅ Working | ✅ Working | — | Keep as-is |
| 7 | USA Today Quick | 🔴 Broken | 🟡 **MONITORED** | ⚠️ MAYBE | **KEEP with canary** — works from CF Worker as of 2026-05-28 |
| 8 | WaPo Daily | ✅ Working | ✅ Working | — | Keep as-is |
| 9 | WaPo Mini | ✅ Working | ✅ Working | — | Keep as-is |
| 10 | WaPo Sunday | ✅ Working | ✅ Working | — | Keep as-is |
| 11 | Guardian Quick | 🟡 Laggy API | ✅ **FIXABLE** | ✅ YES | Series page scraping + exact-date validation |
| 12 | Guardian Cryptic | 🟡 Laggy API | ✅ **FIXABLE** | ✅ YES | Series page scraping + exact-date validation |
| 13 | Guardian Prize | 🟡 Laggy API | ✅ **FIXABLE** | ✅ YES | Series page scraping + exact-date validation |
| 14 | Guardian Quiptic | 🟡 Laggy API | ✅ **FIXABLE** | ✅ YES | Series page scraping + exact-date validation |
| 15 | Guardian Weekend | 🟡 Laggy API | ✅ **FIXABLE** | ✅ YES | Series page scraping + exact-date validation |
| 16 | Guardian Everyman | ☠️ Dead | ☠️ **DEAD** | ❌ NO | **REMOVE from workers.json** |
| 17 | Guardian Speedy | ☠️ Dead | ☠️ **DEAD** | ❌ NO | **REMOVE from workers.json** |
| 18 | New Yorker | 🔴 "Impossible" | ✅ **WORKS!** | ✅ YES | **BUILD NEW WORKER** — Conde Nast API |
| 19 | New Yorker Mini | 🔴 "Impossible" | ✅ **WORKS!** | ✅ YES | **BUILD NEW WORKER** — same API |
| 20 | Newsday | 🟢 Not built | 🟢 **VERIFIED** | ✅ YES | **BUILD NEW WORKER** — AmuseLabs |
| 21 | Universal | 🟢 Not built | 🟢 **VERIFIED** | ✅ YES | **BUILD NEW WORKER** — JSON API |
| 22 | Vox | 🟢 Not built | 🟢 **VERIFIED** | ✅ YES | **BUILD NEW WORKER** — AmuseLabs |
| 23 | Daily Pop | 🟢 Not built | 🟢 **VERIFIED** | ✅ YES | **BUILD NEW WORKER** — PuzzleNation |
| 24 | NYT Midi | 🟢 Not built | 🟢 **VERIFIED** | ✅ YES | **BUILD NEW WORKER** — NYT v6 API |
| 25 | Puzzmo | 🟢 Not built | 🟡 PARTIAL | ⚠️ MAYBE | GraphQL schema changed, needs update |

**Final worker count**: 17 active (after removing 2 dead Guardian sources, keeping USA Today Quick)

---

## PART 1: PROVIDER STATUS — DETAILED BREAKDOWN

### ✅ ALIVE AND WORKING — No Changes Needed

These providers work correctly right now. No code changes needed.

| Source | Schedule | Last Verified | Method |
|--------|----------|--------------|--------|
| **NYT Daily** | 7 days/week | 2026-05-25 | NYT v6 API + `x-games-auth-bypass: true` header |
| **NYT Mini** | 7 days/week | 2026-05-25 | NYT v6 API + `x-games-auth-bypass: true` header |
| **Atlantic** | 7 days/week | 2026-05-25 | AmuseLabs CDN (`cdn3.amuselabs.com/atlantic`) with rawc deobfuscation |
| **LA Times Daily** | 7 days/week | 2026-05-25 | uclick XML (`picayune.uclick.com/comics/tmcal/data/tmcal{YYMMDD}-data.xml`) |
| **USA Today Daily** | 7 days/week | 2026-05-25 | uclick XML (`picayune.uclick.com/comics/usaon/data/usaon{YYMMDD}-data.xml`) |
| **USA Today Quick** | 7 days/week | 2026-05-28 | **WORKING** — root provider passes live tests, add canary monitoring |
| **WaPo Daily** | 7 days/week | 2026-05-26 | WaPo JSON API (`games-service-prod.site.aws.wapo.pub/crossword/levels/daily/{Y}/{M}/{D}`) |
| **WaPo Mini** | Mon-Sat | 2026-05-26 | WaPo JSON API (same, type=`mini`) |
| **WaPo Sunday** | Sunday only | 2026-05-24 | WaPo JSON API (same, type=`sunday`) |

#### 🟡 USA Today Quick — Status Change from V1

**Previous assessment (V1)**: ☠️ DEAD — all 8 approaches tested, all failed.
**Re-test (2026-05-28)**: ✅ WORKING — root provider returns puzzles for dates 2026-05-21 through 2026-05-28.

This source may have been temporarily down or may have intermittent issues. The correct action is to **keep it with canary monitoring** rather than removing it. Add a smoke test that fetches yesterday's puzzle as part of the scheduler worker's health check. If it fails 3 consecutive days, escalate to manual review.

### ✅ WAS BROKEN — NOW VERIFIED FIXABLE FROM CLOUDFLARE WORKERS

---

#### 🔧 FIX 1: LA Times Mini — loadToken Fixes the 302 Redirect

**Problem**: Direct AmuseLabs CDN URL returns HTTP 302 redirect to LA Times games page.
```
GET https://lat.amuselabs.com/lat/crossword?id=latimes-mini-20260525&set=latimes-mini
→ 302 Found → Location: https://www.latimes.com/games/mini-crossword
```

**Why**: AmuseLabs requires a `loadToken` parameter to authorize direct puzzle access. Without it, they redirect to the parent site.

**Verified Fix (tested from CF Worker)**:
1. Fetch the date-picker page: `https://lat.amuselabs.com/lat/date-picker?set=latimes-mini`
2. Extract `<script id="params">` JSON from the HTML
3. Base64-decode `rawsps` field → get `loadToken`
4. Append `&loadToken={token}` to the solver URL → returns 200 with puzzle data

**Test Result**:
```
a1_direct (no token):     status=302, bodyLen=0
a3_picker:                status=200, hasParams=true, hasRawsps=true
a3_loadToken:             "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." (extracted)
a4_with_token:            status=200, bodyLen=95000+ (full puzzle page!)
```

**Exact Code for `shared/providers/latimes.js`**:
```javascript
// In createLatimesMiniProvider()

async function fetchByDate(date, env) {
  const compact = date.replace(/-/g, '');

  // STEP 1: Fetch date-picker to extract loadToken
  const pickerHtml = await fetchText(
    'https://lat.amuselabs.com/lat/date-picker?set=latimes-mini',
    {
      'Referer': 'https://www.latimes.com/games/mini-crossword',
      'Origin': 'https://www.latimes.com',
    }
  );

  // STEP 2: Extract loadToken from <script id="params">
  const pm = pickerHtml.match(/<script[^>]*id="params"[^>]*>([\s\S]*?)<\/script>/i);
  if (!pm) throw new NotFoundError('No params in date-picker page');

  let loadToken = '';
  try {
    const params = JSON.parse(pm[1]);
    if (params.rawsps) {
      const decoded = JSON.parse(atob(params.rawsps));
      loadToken = decoded.loadToken || '';
    }
  } catch (e) {
    throw new NotFoundError('Failed to parse loadToken from date-picker');
  }

  if (!loadToken) throw new NotFoundError('No loadToken found in date-picker');

  // STEP 3: Fetch puzzle with loadToken — this returns 200 instead of 302
  const url = `https://lat.amuselabs.com/lat/crossword?id=latimes-mini-${compact}&set=latimes-mini&loadToken=${encodeURIComponent(loadToken)}`;

  return fetchAmuseLabsPuzzle({ url, date });
}
```

**Files to Change**:
- `shared/providers/latimes.js` — Update `createLatimesMiniProvider().fetchByDate()`

---

#### 🔧 FIX 2: New Yorker — Conde Nast API WORKS From Cloudflare Workers!

**Previous Understanding (WRONG)**: "Conde Nast API is blocked by WAF — 403 for all server-side requests."

**What Actually Happens (VERIFIED FROM CF WORKER)**:
The Conde Nast API at `puzzles-games-api.gp-prod.conde.digital` works perfectly when you use the correct endpoint with a UUID. The previous test tried the list endpoint (`/api/v1/games` without a UUID), which returns 404. With a specific UUID, it returns 200 with full puzzle data including all answers.

**The Fix — 3-Step Process**:
1. Fetch the New Yorker date page: `https://www.newyorker.com/puzzles-and-games-dept/crossword/{YYYY}/{MM}/{DD}`
2. Extract the puzzle UUID from the page HTML: regex `"id":"([0-9a-f-]{36})"`
3. Call the Conde Nast API with the UUID: `GET https://puzzles-games-api.gp-prod.conde.digital/api/v1/games/{uuid}`

**Test Result**:
```json
{
  "a2_date_page": { "status": 200 },
  "a4b_uuid_from_date": "9bfa0660-ea23-4002-b51e-f5675888a8bd",
  "a4b_conde_response": {
    "status": 200,
    "body": {
      "id": "9bfa0660-ea23-4002-b51e-f5675888a8bd",
      "name": "Collins_Mon_03_2026",
      "data": "## Metadata\n\ntitle: The Crossword: Monday, May 25, 2026\nauthor: Kameron Austin Collins\n\n## Grid\n\nBADTWEET...BRAM\n...\n\n## Clues\n\nA1. Reason for being ratioed ~ BADTWEET\nA9. First name in literary horror ~ BRAM\n..."
    }
  }
}
```

**Exact Code — `shared/providers/newYorker.js`**:
```javascript
import { fetchText, fetchJson, NotFoundError } from '../core/utils.js';

export function createNewYorkerProvider() {
  return {
    slug: 'new-yorker',
    title: 'New Yorker Crossword',
    lookbackDays: 14,
    async fetchByDate(date, env) {
      const [y, m, d] = date.split('-');

      // STEP 1: Fetch the date page to get UUID
      const pageUrl = `https://www.newyorker.com/puzzles-and-games-dept/crossword/${y}/${m}/${d}`;
      const html = await fetchText(pageUrl);

      // STEP 2: Extract UUID from page
      const uuidMatch = html.match(/"id":"([0-9a-f-]{36})"/);
      if (!uuidMatch) throw new NotFoundError('No New Yorker puzzle found for ' + date);
      const uuid = uuidMatch[1];

      // STEP 3: Fetch puzzle data from Conde Nast API
      const apiUrl = `https://puzzles-games-api.gp-prod.conde.digital/api/v1/games/${uuid}`;
      const json = await fetchJson(apiUrl, {
        'Origin': 'https://www.newyorker.com',
        'Referer': 'https://www.newyorker.com/puzzles-and-games-dept/crossword',
      });

      // STEP 4: Parse xd format response
      return parseXdFormat(json.data, date);
    }
  };
}

export function createNewYorkerMiniProvider() {
  return {
    slug: 'new-yorker-mini',
    title: 'New Yorker Mini Crossword',
    lookbackDays: 14,
    async fetchByDate(date, env) {
      const [y, m, d] = date.split('-');
      const pageUrl = `https://www.newyorker.com/puzzles-and-games-dept/mini-crossword/${y}/${m}/${d}`;
      const html = await fetchText(pageUrl);
      const uuidMatch = html.match(/"id":"([0-9a-f-]{36})"/);
      if (!uuidMatch) throw new NotFoundError('No New Yorker Mini puzzle found for ' + date);
      const uuid = uuidMatch[1];
      const apiUrl = `https://puzzles-games-api.gp-prod.conde.digital/api/v1/games/${uuid}`;
      const json = await fetchJson(apiUrl, {
        'Origin': 'https://www.newyorker.com',
        'Referer': 'https://www.newyorker.com/puzzles-and-games-dept/mini-crossword',
      });
      return parseXdFormat(json.data, date);
    }
  };
}

// xd format parser — used by New Yorker + Puzzmo
function parseXdFormat(xdText, date) {
  const sections = {};
  let currentSection = '';
  for (const line of xdText.split('\n')) {
    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim().toLowerCase();
      sections[currentSection] = [];
    } else if (currentSection) {
      sections[currentSection].push(line);
    }
  }

  const metadata = {};
  for (const line of sections.metadata || []) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      metadata[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }
  }

  const gridLines = (sections.grid || []).filter(l => l.trim());
  const height = gridLines.length;
  const width = height > 0 ? gridLines[0].length : 0;

  const acrossClues = [];
  const downClues = [];
  for (const line of sections.clues || []) {
    const match = line.match(/^([AD])(\d+)\.\s*(.+?)\s*~\s*(.+)$/);
    if (match) {
      const clue = {
        number: parseInt(match[2]),
        direction: match[1] === 'A' ? 'across' : 'down',
        clue_text: match[3].trim(),
        answer: match[4].trim(),
      };
      if (match[1] === 'A') acrossClues.push(clue);
      else downClues.push(clue);
    }
  }

  return {
    date,
    title: metadata.title || '',
    author: metadata.author || '',
    editor: metadata.editor || '',
    width,
    height,
    across: acrossClues,
    down: downClues,
  };
}
```

**Files to Create/Change**:
- `shared/providers/newYorker.js` — New file with both providers + xd parser
- `config/workers.json` — Add `new-yorker` and `new-yorker-mini` entries

---

#### 🔧 FIX 3: Guardian — Series Page Scraping WITH Exact-Date Validation

**Problem**: The Guardian Content API with `api-key=test` has severe indexing lag. Puzzles published in the last 3-7 days often return 0 results.

**V1 Bug (now fixed in V3)**: The original Guardian series-page fix had `props.data?.date === date || props.data?.number` — the `|| props.data?.number` fallback is always truthy, so it returned whatever puzzle it found first regardless of date. Codex live-tested this and confirmed the same latest puzzle was returned for all tested dates.

**V3 Fix**: Series page scraping for freshness, but with **mandatory exact-date validation** using `webPublicationDate` or `date` from the puzzle metadata.

**Exact Code for `shared/providers/guardian.js`**:
```javascript
async fetchByDate(date, env) {
  // STEP 1: Fetch series page (lists latest 20 puzzles)
  const seriesUrl = `https://www.theguardian.com/crosswords/series/${this.seriesTag}`;
  const seriesHtml = await fetchText(seriesUrl);

  // STEP 2: Extract puzzle URLs from the page
  const urlMatches = [...seriesHtml.matchAll(
    new RegExp(`href="(/crosswords/${this.seriesTag}/\\d+)"`, 'g')
  )];
  if (urlMatches.length === 0) throw new NotFoundError('No puzzles found on series page');

  // STEP 3: Check the first few puzzles for an EXACT DATE MATCH
  for (const match of urlMatches.slice(0, 5)) {
    const puzzleUrl = `https://www.theguardian.com${match[1]}`;
    const puzzleHtml = await fetchText(puzzleUrl);

    // STEP 4: Extract CrosswordComponent data from gu-island
    const guStart = puzzleHtml.indexOf('<gu-island name="CrosswordComponent"');
    if (guStart === -1) continue;
    const guEnd = puzzleHtml.indexOf('</gu-island>', guStart);
    if (guEnd === -1) continue;
    const guIsland = puzzleHtml.slice(guStart, guEnd);

    const propsMatch = guIsland.match(/props="([^"]*)"/);
    if (!propsMatch) continue;

    // STEP 5: Decode HTML entities and parse JSON
    const decoded = propsMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    const props = JSON.parse(decoded);

    // STEP 6: EXACT-DATE VALIDATION (V3 fix)
    // Extract the publication date and compare with the requested date.
    // webPublicationDate is ISO 8601, e.g. "2026-05-25T23:00:00Z"
    // props.data.date may also be available as "2026-05-25"
    const pubDate = props.data?.webPublicationDate
      ? props.data.webPublicationDate.slice(0, 10)  // "2026-05-25T23:00:00Z" → "2026-05-25"
      : props.data?.date;

    if (pubDate === date) {
      return parseGuardianPuzzle(props.data, date);
    }
    // Do NOT fall back to props.data?.number — that always matches the latest puzzle
  }

  // Fallback: Try Content API for historical dates (older puzzles still work)
  const apiUrl = `https://content.guardianapis.com/search?tag=crosswords/series/${this.seriesTag}&from-date=${date}&to-date=${date}&page-size=1&api-key=${env.GUARDIAN_API_KEY || 'test'}`;
  const apiResult = await fetchJson(apiUrl);
  if (apiResult.response?.results?.length > 0) {
    const puzzleUrl = apiResult.response.results[0].webUrl;
    const puzzleHtml = await fetchText(puzzleUrl);
    // ... same gu-island extraction as above with exact-date check
  }

  throw new NotFoundError(`No ${this.title} puzzle found for ${date}`);
}
```

**Files to Change**:
- `shared/providers/guardian.js` — Replace Content API approach with series page scraping + exact-date validation

**Recommended Strategy**: Use series page scraping for recent puzzles (cron/latest), fall back to Content API for historical lookups (archive queries). Always validate the returned date matches the requested date.

---

### ☠️ DEAD SOURCES — Remove These From workers.json

| Source | Death Date | Evidence | What to Do |
|--------|-----------|----------|------------|
| **Guardian Everyman** | April 20, 2025 | Last puzzle #4096; #4097 returns 404 | **DELETE from `config/workers.json`** |
| **Guardian Speedy** | April 20, 2025 | Last puzzle #1541; #1542 returns 404 | **DELETE from `config/workers.json`** |

**Action**: Remove these 2 entries from `config/workers.json`. USA Today Quick is kept (see above).

---

### 🟢 NEW SOURCES — VERIFIED WORKING FROM CLOUDFLARE WORKERS

---

#### NEW SOURCE 1: Universal — AM Universal JSON API

**Status**: ✅ VERIFIED WORKING — Returns full puzzle data with all answers

**API**: `https://gamedata.services.amuniversal.com/c/uucom/l/{token}/g/fcx/d/{YYYY-MM-DD}/data.json`

**Token** (extracted from Universal Uclick website):
```
U2FsdGVkX18YuMv20%2B8cekf85%2Friz1H%2FzlWW4bn0cizt8yclLsp7UYv34S77X0aX%0Axa513fPTc5RoN2wa0h4ED9QWuBURjkqWgHEZey0WFL8%3D
```

**Code — `shared/providers/universal.js`**:
```javascript
import { fetchJson, NotFoundError } from '../core/utils.js';

const AMUNIVERSAL_TOKEN = 'U2FsdGVkX18YuMv20%2B8cekf85%2Friz1H%2FzlWW4bn0cizt8yclLsp7UYv34S77X0aX%0Axa513fPTc5RoN2wa0h4ED9QWuBURjkqWgHEZey0WFL8%3D';

export function createUniversalProvider() {
  return {
    slug: 'universal',
    title: 'Universal Crossword',
    lookbackDays: 14,
    async fetchByDate(date, env) {
      const url = `https://gamedata.services.amuniversal.com/c/uucom/l/${AMUNIVERSAL_TOKEN}/g/fcx/d/${date}/data.json`;
      const json = await fetchJson(url);
      if (!json.AllAnswer) throw new NotFoundError('No Universal puzzle for ' + date);

      const acrossClues = parsePipeClues(json.AcrossClue, 'across');
      const downClues = parsePipeClues(json.DownClue, 'down');

      return {
        date,
        title: json.Title || '',
        author: json.Author || '',
        editor: json.Editor || '',
        width: parseInt(json.Width) || 15,
        height: parseInt(json.Height) || 15,
        across: acrossClues,
        down: downClues,
      };
    }
  };
}

function parsePipeClues(pipeStr, direction) {
  if (!pipeStr) return [];
  const clues = [];
  const parts = pipeStr.split('|');
  for (let i = 0; i < parts.length; i += 2) {
    const cluePart = parts[i]?.trim();
    const answerPart = parts[i + 1]?.trim();
    if (!cluePart) continue;
    const numMatch = cluePart.match(/^(\d+)\.\s*(.+)$/);
    if (numMatch) {
      clues.push({
        number: parseInt(numMatch[1]),
        direction,
        clue_text: numMatch[2].trim(),
        answer: answerPart || '',
      });
    }
  }
  return clues;
}
```

---

#### NEW SOURCE 2: Daily Pop — PuzzleNation API

**Status**: ✅ VERIFIED WORKING — Returns full XML with all answers

**Step 1**: Fetch API key from JS file:
`http://dailypopcrosswordsweb.puzzlenation.com/crosswordSetup.js`
→ Extract: `API_KEY = "MyJ22UAp7W2eZu2PllvQ14McSyBugVKJ4rT8iBHa"`

**Step 2**: Fetch puzzle with API key:
`https://api.puzzlenation.com/dailyPopCrosswords/puzzles/daily/{YYMMDD}`
→ Header: `x-api-key: MyJ22UAp7W2eZu2PllvQ14McSyBugVKJ4rT8iBHa`

**Code — `shared/providers/dailyPop.js`**:
```javascript
import { fetchText, fetchJson, NotFoundError } from '../core/utils.js';

export function createDailyPopProvider() {
  return {
    slug: 'daily-pop',
    title: 'Daily Pop Crossword',
    lookbackDays: 14,
    async fetchByDate(date, env) {
      const compact = date.slice(2, 4) + date.slice(5, 7) + date.slice(8, 10);

      const jsUrl = 'http://dailypopcrosswordsweb.puzzlenation.com/crosswordSetup.js';
      const jsText = await fetchText(jsUrl);
      const keyMatch = jsText.match(/API_KEY\s*=\s*["']([^"']+)["']/);
      if (!keyMatch) throw new NotFoundError('Could not extract Daily Pop API key');
      const apiKey = keyMatch[1];

      const url = `https://api.puzzlenation.com/dailyPopCrosswords/puzzles/daily/${compact}`;
      const xml = await fetchText(url, { 'x-api-key': apiKey });

      return parseCrosswordCompilerXml(xml, date);
    }
  };
}
```

---

#### NEW SOURCE 3: Newsday — AmuseLabs

**Status**: ✅ VERIFIED — Same 302 redirect issue, same loadToken fix

**Method**: AmuseLabs (set=`creatorsweb`, ID=`Creators_WEB_{YYYYMMDD}`)
**Picker**: `https://cdn2.amuselabs.com/pmm/date-picker?set=creatorsweb`

**Code — `shared/providers/newsday.js`**:
```javascript
import { fetchText, NotFoundError } from '../core/utils.js';
import { fetchAmuseLabsPuzzle } from '../core/amuselabs.js';

export function createNewsdayProvider() {
  return {
    slug: 'newsday',
    title: 'Newsday Crossword',
    lookbackDays: 14,
    async fetchByDate(date, env) {
      const compact = date.replace(/-/g, '');

      const pickerHtml = await fetchText(
        'https://cdn2.amuselabs.com/pmm/date-picker?set=creatorsweb'
      );

      let loadToken = '';
      const pm = pickerHtml.match(/<script[^>]*id="params"[^>]*>([\s\S]*?)<\/script>/i);
      if (pm) {
        try {
          const params = JSON.parse(pm[1]);
          if (params.rawsps) {
            const decoded = JSON.parse(atob(params.rawsps));
            loadToken = decoded.loadToken || '';
          }
        } catch (e) {}
      }

      const url = `https://cdn2.amuselabs.com/pmm/crossword?id=Creators_WEB_${compact}&set=creatorsweb` +
        (loadToken ? `&loadToken=${encodeURIComponent(loadToken)}` : '');

      return fetchAmuseLabsPuzzle({ url, date });
    }
  };
}
```

---

#### NEW SOURCE 4: Vox — AmuseLabs

**Status**: ✅ VERIFIED — Same pattern as Atlantic, needs loadToken

**Method**: AmuseLabs (set=`vox`, ID=`vox_{YYYYMMDD}`)
**Picker**: `https://cdn3.amuselabs.com/vox/date-picker?set=vox`

**Code — `shared/providers/vox.js`**:
```javascript
import { fetchText, NotFoundError } from '../core/utils.js';
import { fetchAmuseLabsPuzzle } from '../core/amuselabs.js';

export function createVoxProvider() {
  return {
    slug: 'vox',
    title: 'Vox Crossword',
    lookbackDays: 14,
    async fetchByDate(date, env) {
      const compact = date.replace(/-/g, '');

      const pickerHtml = await fetchText(
        'https://cdn3.amuselabs.com/vox/date-picker?set=vox'
      );

      let loadToken = '';
      const pm = pickerHtml.match(/<script[^>]*id="params"[^>]*>([\s\S]*?)<\/script>/i);
      if (pm) {
        try {
          const params = JSON.parse(pm[1]);
          if (params.rawsps) {
            const decoded = JSON.parse(atob(params.rawsps));
            loadToken = decoded.loadToken || '';
          }
        } catch (e) {}
      }

      const url = `https://cdn3.amuselabs.com/vox/crossword?id=vox_${compact}&set=vox` +
        (loadToken ? `&loadToken=${encodeURIComponent(loadToken)}` : '');

      return fetchAmuseLabsPuzzle({ url, date });
    }
  };
}
```

---

#### NEW SOURCE 5: NYT Midi — Same Auth as NYT Daily

**Status**: ✅ VERIFIED WORKING

**URL**: `https://www.nytimes.com/svc/crosswords/v6/puzzle/midi/{date}.json`
**Auth**: Same `x-games-auth-bypass: true` header

**Code — Add to `shared/providers/nyt.js`**:
```javascript
export function createNytMidiProvider() {
  return {
    slug: 'nyt-midi',
    title: 'NYT Midi',
    lookbackDays: 14,
    async fetchByDate(date, env) {
      const url = `https://www.nytimes.com/svc/crosswords/v6/puzzle/midi/${date}.json`;
      const json = await fetchJson(url, { 'x-games-auth-bypass': 'true' });
      return parseNytPuzzle(json, date);
    }
  };
}
```

---

### 🟡 PARTIALLY WORKING — Needs More Research

#### Puzzmo — GraphQL Schema Changed

**Status**: ⚠️ PARTIAL — GraphQL endpoint responds but query format has changed
**Priority**: LOW — Can be investigated later.

---

## PART 2: CANNOT BUILD — Permanently Blocked Sources

| Source | Why Blocked | xword-dl Status | Workaround? |
|--------|-------------|-----------------|-------------|
| **WSJ** | TLS fingerprinting anti-bot | Also disabled | No — needs browser automation |
| **McKinsey** | SSL handshake sniffing | Also disabled | No — needs browser automation |
| **The Modern** | Paywall | Also disabled | No |
| **Globe and Mail** | Outlet changed format | Also disabled | No — now syndicates The Times |
| **NYT Variety** | No longer published digitally | Also disabled | No — discontinued |

---

## PART 3: COMPLETE BUG FIX LIST — PRIORITIZED

### 🔴 CRITICAL — Fix First (Breaks Core Functionality)

#### BUG 1: `/api/puzzle/latest` Returns 400
- **Where**: `shared/core/createArchiveWorker.js`
- **Why**: Route handler matches `/api/puzzle/latest` as a date, then `parseDate("latest")` fails
- **Fix**: Add explicit route handling BEFORE the date-based route:
```javascript
if (url.pathname === '/api/puzzle/latest') {
  const result = await env.DB.prepare(
    'SELECT date FROM puzzles ORDER BY date DESC LIMIT 1'
  ).first();
  if (!result) return notFound('No puzzles available');
  return getPuzzleByDate(result.date, env);
}
```

#### BUG 2: N+1 Query in `getRelatedClues()`
- **Where**: `shared/core/createArchiveWorker.js`
- **Fix**: Single query with JOIN + LIMIT 50:
```sql
SELECT c.number, c.direction, c.clue_text, c.answer, c.answer_len,
       p.date, p.formatted_date, p.day_of_week, p.title
FROM clues c
JOIN puzzles p ON p.puzzle_id = c.puzzle_id
WHERE c.answer_norm = ?
ORDER BY p.date DESC
LIMIT 50
```

#### BUG 3: Write Endpoints Use GET (CSRF Vulnerability) — **V3 HARDENED**
- **Where**: All workers with write endpoints
- **V1 Fix**: Check `request.method === 'POST'` for write routes
- **V3 Fix (Codex)**: Enforce POST-only, reject GET with 405, add `Allow: POST` header
```javascript
if (request.method !== 'POST') {
  return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'POST' } });
}
```

#### BUG 4: API Token in URL Path (Leaked in Logs/History) — **V3 HARDENED**
- **Where**: `shared/core/createArchiveWorker.js`
- **V1 Fix**: Use `Authorization: Bearer <token>` header
- **V3 Fix (Codex)**: Accept auth ONLY through `Authorization: Bearer ...` header. Disable URL-path tokens entirely. No dual-path auth.

#### BUG 5: No API_TOKEN = Open Access — **V3 HARDENED**
- **Where**: `authorizeWrite()` in shared core
- **V1 Fix**: `if (!env.API_TOKEN) return false;`
- **V3 Fix (Codex)**: Reject ALL writes if the secret is absent. No open-write fallback.
```javascript
function authorizeWrite(request, env) {
  if (!env.API_TOKEN) return false;  // No secret = no writes allowed
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.API_TOKEN}`;
}
```

#### BUG 6: NYT Mini Unknown Routes Return HTTP 200
- **Where**: `nyt-crossword/crossword mini archive/src/index.js`
- **Fix**: Add `status: 404` to the fallback Response

### 🟡 HIGH — Fix This Week

#### BUG 7: LA Times Mini Provider Broken (302 Redirect)
- **Fix**: ✅ VERIFIED — See FIX 1 above (loadToken approach)

#### BUG 8: Guardian Everyman/Speedy Still in workers.json
- **Fix**: ☠️ DEAD — Remove from workers.json (2 sources, not 3 — USA Today Quick is kept)

#### BUG 9: Non-Atomic `deletePuzzleByDate()`
- **Fix**: Use `env.DB.batch()` for delete + related clues deletion

#### BUG 10: Non-Atomic `savePuzzleToDatabase()`
- **Fix**: Use `INSERT ... RETURNING puzzle_id` or `env.DB.batch()`

#### BUG 11: NYT Mini `searchByClue()` Contains Mode Uses Wrong Column
- **Fix**: Change `WHERE LOWER(clue) LIKE ?` to `WHERE clue_norm LIKE ?`

#### BUG 12: API Key Leaked in Repo (`BloggingIo@7`)
- **Fix**: Remove from `add_puzzles.py` and `api_endpoints.txt`, rotate the key

#### BUG 13: API Shape Inconsistent Across Archives — **NEW IN V3**
- **Where**: Daily archives use `/api/...` shape, mini archives use `/today`, `/date`, `/clue`, `/answer`
- **Fix**: Move all archives to the same shared contract. Finish API unification before scaling.

#### BUG 14: Solver Mini Lookup Out of Sync — **NEW IN V3**
- **Where**: Solver returns `used_fallback: true` for internal results, deployed config drifts from local
- **Fix**: (1) Return internal exact results first. (2) Add integration test for mini lookup when `ENABLE_MINI_LOOKUP=true`.

### 🟢 MEDIUM — Fix This Month

#### BUG 15: LIKE Wildcards Silently Removed
- **Fix**: Use `LIKE ? ESCAPE '\'` and escape `%`, `_`, `\` in user input

#### BUG 16: JS vs SQL Normalization Mismatch
- **Fix**: Ensure SQL `REPLACE` handles tabs and newlines matching JS normalization

#### BUG 17: Contains Mode Not Cached
- **Fix**: Cache contains search results in Cache API with normalized query as key

#### BUG 18: Sequential Lookback Fetches
- **Fix**: Try today first (most likely), then only try yesterday if today fails

#### BUG 19: HTTP URLs for uclick XML
- **Fix**: Test `https://` variant; document if HTTP is required

#### BUG 20: CORS Inconsistency Across Workers
- **Fix**: Standardize CORS headers in `createArchiveWorker.js`

#### BUG 21: Hardcoded User-Agent
- **Fix**: Rotate between 3-4 recent Chrome/Firefox User-Agent strings

#### BUG 22: No Content-Type Validation on External Responses
- **Fix**: Validate `Content-Type` header before parsing JSON/XML

#### BUG 23: NYT Workers Have No Lookback
- **Fix**: Add lookback logic (try up to 3 days back)

#### BUG 24: NYT Workers Duplicate Shared Framework Code
- **Fix**: Eventually refactor NYT providers into `shared/providers/nyt.js`

#### BUG 25: Legacy NYT Daily Archive Writes `today.json` Back To GitHub — **NEW IN V3**
- **Where**: Runtime GitHub writebacks add external API dependency, extra latency, and secret management burden
- **Fix**: Remove GitHub writebacks. Publish `latest.json` or `today.json` to R2 or Pages static output instead.

---

## PART 4: CRON & SCHEDULER — V3 ARCHITECTURE

### Critical Free-Tier Limit Discovery

**Cloudflare Free Plan — Cron Triggers**: **5 per account** (NOT per worker).

With 17 workers each needing 1-3 crons, that's potentially 34-51 cron triggers on a limit of 5. The per-worker cron approach from V1 is **impossible** on the free tier.

### V3 Solution: Scheduler Worker + Queue Fan-Out

Replace per-worker crons with a single **scheduler worker** that has ≤5 account-level cron triggers and internally fans out to individual workers via Queues or service bindings.

```text
┌─────────────────────────────────────────────┐
│           SCHEDULER WORKER                   │
│   (5 account-level cron triggers max)        │
│                                              │
│  Cron 1: 00:00 UTC — Guardian group          │
│  Cron 2: 03:00 UTC — NYT group               │
│  Cron 3: 05:00 UTC — ET-midnight group       │
│  Cron 4: 14:00 UTC — Catch-up all            │
│  Cron 5: 23:00 UTC — NYT weekend/early       │
├─────────────────────────────────────────────┤
│  Each cron fires → Queue messages            │
│  → Individual workers pick up their job       │
│  → Each worker fetches + writes to D1         │
└─────────────────────────────────────────────┘
```

### Puzzle Publication Times (Verified)

| Source | Publishes At (ET) | UTC Time |
|--------|-------------------|----------|
| NYT Daily (Mon) | 6 PM Sun | 23:00 Sun |
| NYT Daily (Tue-Sat) | 10 PM prev day | 03:00 |
| NYT Daily (Sun) | 6 PM Sat | 23:00 Sat |
| NYT Mini | Same as daily | Same |
| Guardian | Midnight GMT | 00:00 |
| LA Times / Atlantic / USA Today / WaPo / New Yorker | Midnight ET | 05:00 |

### Scheduler Cron Configuration

| Cron # | Expression (UTC) | Groups Triggered | Why |
|--------|-----------------|------------------|-----|
| 1 | `0 0 * * *` | Guardian Quick, Cryptic, Prize, Quiptic, Weekend | Midnight GMT |
| 2 | `0 3 * * *` | NYT Daily, Mini, Midi | 10 PM ET (Tue-Sat) |
| 3 | `0 5 * * *` | Atlantic, LA Times Daily/Mini, USA Today Daily/Quick, WaPo Daily/Mini/Sunday, New Yorker/Mini, Newsday, Universal, Vox, Daily Pop | Midnight ET |
| 4 | `0 14 * * *` | ALL workers (catch-up) | Missed puzzles from earlier in the day |
| 5 | `0 23 * * 0,6` | NYT Daily, Mini | Weekend 6 PM ET publications |

This fits within the 5-account-cron limit exactly.

### Scheduler Worker Code Structure

```javascript
// workers/scheduler/src/index.js
import { QUEUE } from './queue-config.js';

export default {
  async scheduled(event, env, ctx) {
    const groups = getGroupsForCron(event.cron);
    for (const group of groups) {
      for (const worker of group.workers) {
        await env.INGEST_QUEUE.send({
          workerSlug: worker.slug,
          date: getTargetDate(worker, event.cron),
          scheduledAt: new Date().toISOString(),
        });
      }
    }
  },

  // Optional: handle queue consumer side if using same worker
  async queue(batch, env) {
    for (const msg of batch.messages) {
      try {
        await fetch(`https://${msg.body.workerSlug}-worker.${env.DOMAIN}/api/update/latest`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.API_TOKEN}` },
        });
      } catch (e) {
        msg.retry({ delay: 60 });
      }
    }
  },
};
```

### NYT Oracle — Pre-Flight Check

**Discovery**: NYT has oracle endpoints that show current and next puzzle dates:
- `https://www.nytimes.com/svc/crosswords/v2/oracle/daily.json`
- `https://www.nytimes.com/svc/crosswords/v2/oracle/mini.json`

**Response**:
```json
{
  "status": "OK",
  "results": {
    "current": { "print_date": "2026-05-25" },
    "next": { "print_date": "2026-05-26" }
  }
}
```

**Use Case**: Before fetching, check the oracle. If `next` date matches today, the puzzle is available. This saves one failed request per cron run.

### Cloudflare Free-Tier Limits (Re-Verified 2026-05-28)

| Resource | Limit | Impact |
|----------|-------|--------|
| Worker Requests | 100,000/day | Sharding across accounts doesn't help — optimize reads instead |
| D1 Reads | 5,000,000/day | Fine for ingest, but hot lookups should NOT all sit on D1 |
| D1 Writes | 100,000/day | Fine for daily ingest |
| KV Reads | 100,000/day | NOT enough for main global cache |
| KV Writes | 1,000/day | Very limited — use for config/secrets only |
| Cron Triggers | **5 per account** | Scheduler worker is mandatory |
| Cache API | Unlimited | Edge-local only — great for local hot cache, NOT global replication |
| Queues | 10,000 ops/day | Enough for scheduler-to-ingest fan-out |

---

## PART 5: FUTURE DATE ACCESS — WHICH SOURCES EXPOSE ANSWERS IN ADVANCE

| Source | Future Access? | How Far Ahead? | Verified? |
|--------|---------------|---------------|-----------|
| **NYT Daily** | ❌ NO | 2026-05-28 returns 404 | ✅ Tested from CF Worker |
| **NYT Mini** | ❌ NO | 2026-05-28 returns 404 | ✅ Tested from CF Worker |
| **WaPo Daily** | ✅ YES | T+1 day (tomorrow available today) | ✅ Tested from CF Worker |
| **WaPo Mini** | ✅ YES | T+1 day | ✅ Tested from CF Worker |
| **WaPo Sunday** | ❌ NO | Only current/past Sundays | ✅ Tested from CF Worker |
| **uclick XML (LA Times)** | ❌ NO | Only today's and past dates | ✅ Known |
| **uclick XML (USA Today)** | ❌ NO | Only today's and past dates | ✅ Known |
| **Atlantic (AmuseLabs)** | ❌ NO | Only published puzzles | ✅ Known |
| **Guardian API** | ❌ NO | Only published puzzles | ✅ Known |
| **New Yorker** | ❌ NO | Only published puzzles (date page returns 404 for future) | ✅ Known |

### Recommendation
- **DO NOT** expose future answers in the public API
- **DO** fetch WaPo T+1 puzzles in the cron and store them (they become "today's" puzzle the next day)
- Add a `published_at` column to the puzzles table and check it before serving

---

## PART 6: READ-PATH ARCHITECTURE — V3 4-LAYER CACHE

### V1 vs V3 Architecture Change

**V1 (master-plan.md)**: Multi-account sharding first, Cache API as main cache.
**V3 (this plan)**: Single-account-first, static read plane for global traffic, Cache API for edge-local hot cache only.

The key insight from Codex: Cache API is **edge-local** — a cache hit in JFK doesn't help a request hitting LAX. Immutable puzzle data should be served from Cloudflare's globally replicated static assets, not from per-edge Worker execution.

### The 4-Layer Read Path

```text
Request Flow:
  1. Static JSON on Pages/R2 (globally replicated, ~0ms, NO Worker execution, NO D1 read)
     → HIT? Return immediately
  2. Cache API (edge-local, ~0ms, NO D1 read)
     → HIT? Return immediately
  3. KV Hot Cache (globally replicated, ~5ms, NO D1 read)
     → HIT? Return + populate Cache API
  4. D1 Database (~20ms, counts against 5M read/day limit)
     → HIT? Return + populate KV + Cache API
  5. NOT FOUND → 404
```

### Read-Plane Split

#### A. Workers For Ingest and Admin ONLY
- Per-source fetch and update
- Manual backfill
- Source-specific parsing
- D1 writes

#### B. Static Public Reads — Published After Successful Ingest

Publish these as static JSON after each successful cron ingest:
- `/archive/{source}/{date}.json` — Full puzzle data for a specific date
- `/latest/{source}.json` — Most recent puzzle for a source
- `/lookup/clue/{sha1-prefix}.json` — Precomputed clue lookup shards
- `/lookup/answer/{sha1-prefix}.json` — Precomputed answer lookup shards

Serve from Pages static assets or R2 with long TTLs (24h+ for archive, 1h for latest).

#### C. Workers Only For Dynamic or Slow Paths
- Partial contains search (can't be precomputed)
- Related clues (if not precomputed)
- Admin write paths
- Source canary and health endpoints
- Search with complex filters

### Implementation: Cache API + Static Publish Pipeline

```javascript
// Edge-local hot cache — fast but NOT globally replicated
async function getPuzzleWithCache(date, env) {
  const cacheKey = new Request(`https://cache.local/puzzle/${date}`);
  const cache = caches.default;

  // Layer 2: Cache API (edge-local)
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Layer 3: KV
  const kvKey = `puzzle:${date}`;
  const kvData = await env.HOT_CACHE.get(kvKey, { type: 'json' });
  if (kvData) {
    const response = jsonResponse(kvData, 3600);
    await cache.put(cacheKey, response.clone());
    return response;
  }

  // Layer 4: D1 (expensive — counts against daily read limit)
  const puzzle = await getPuzzleFromDB(date, env);
  if (!puzzle) return null;

  const isToday = date === new Date().toISOString().slice(0, 10);
  const ttl = isToday ? 3600 : 86400;
  const response = jsonResponse(puzzle, ttl);

  // Populate all cache layers
  await cache.put(cacheKey, response.clone());
  await env.HOT_CACHE.put(kvKey, JSON.stringify(puzzle), {
    expirationTtl: ttl,
  });

  return response;
}
```

### Static Publish After Ingest

After a successful cron fetch + D1 write, publish the puzzle as static JSON:

```javascript
async function publishToStaticAssets(puzzle, sourceSlug, date, env) {
  const key = `archive/${sourceSlug}/${date}.json`;
  await env.STATIC_BUCKET.put(key, JSON.stringify(puzzle), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { 'cache-control': 'public, max-age=86400' },
  });

  // Also update latest.json
  await env.STATIC_BUCKET.put(`latest/${sourceSlug}.json`, JSON.stringify(puzzle), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { 'cache-control': 'public, max-age=3600' },
  });
}
```

### D1 Query Optimization

**Must-have indexes** (add via migration):
```sql
CREATE INDEX IF NOT EXISTS idx_clues_clue_norm ON clues(clue_norm);
CREATE INDEX IF NOT EXISTS idx_clues_answer_norm ON clues(answer_norm);
CREATE INDEX IF NOT EXISTS idx_clues_answer_len ON clues(answer_len);
CREATE INDEX IF NOT EXISTS idx_clues_puzzle_id ON clues(puzzle_id);
CREATE INDEX IF NOT EXISTS idx_puzzles_date ON puzzles(date);
```

**Must-do query changes**:
1. Add `LIMIT 50` to ALL search queries
2. Use `INSERT ... RETURNING` instead of INSERT + SELECT
3. Use `env.DB.batch()` for all multi-step writes

### Solver API — Specific Optimizations

1. **Cache solver results** in Cache API with 24h TTL
2. **Precompute common clues** — batch solve top 5000 clues, store in D1
3. **Use internal DB as primary** — add cold archive with doshea/nyt_crosswords dataset
4. **Reduce external fallback** — cache aggressively, slow and fragile
5. **Prioritize internal results** over external API results

### Cache TTL Summary

| Query Type | Primary Cache | TTL | Fallback |
|------------|--------------|-----|----------|
| Puzzle by date (archive) | Static JSON / R2 | 24h+ | Cache API → KV → D1 |
| Puzzle by date (today) | Static JSON / R2 | 1h | Cache API → KV → D1 |
| Latest puzzle | Static JSON / R2 | 1h | Cache API → KV → D1 |
| Exact clue search | KV → Cache API | 24h | D1 |
| Exact answer search | KV → Cache API | 24h | D1 |
| Contains search | Cache API | 1h | D1 |
| Solver result | Cache API | 24h | External APIs |

---

## PART 7: ANALYTICS — DEFERRED BUT CODE-READY

### V3 Decision: Write analytics code now, enable in production only after read-plane is stable.

Adding analytics before the read path is optimized would add D1 reads to every puzzle fetch, wasting quota. However, the analytics computation is pure and doesn't affect read performance if it runs on the write path (during cron ingest) rather than on the read path.

### Category 1: Zero DB Change Analytics (Computed on Write, Cached with Puzzle)

These are computed from existing `clues` and `puzzles` tables at ingest time and stored as JSON in the puzzle's static asset:

| # | Metric | Computation | xwordinfo.com Equivalent |
|---|--------|-------------|--------------------------|
| 1 | Scrabble score | Sum of letter values × answer | Scrabble Score |
| 2 | Scrabble average | Score / total letters | Scrabble Average |
| 3 | Average word length | Sum of answer_len / count | Average Word Length |
| 4 | Missing letters | A-Z not in any answer | Missing Letters |
| 5 | Pangram check | All 26 letters present | Is Pangram? |
| 6 | Cheater squares | Black squares adjacent to 1 white square | Cheater Squares |
| 7 | Open squares | Black squares adjacent to 3+ white squares | Open Squares |
| 8 | Grid flow | Longest connected white region / total | Grid Flow |
| 9 | Word length distribution | Histogram of answer lengths | Word Length Distribution |
| 10 | Letter distribution | Histogram of letter usage | Letter Distribution |
| 11 | Unique answer count | Distinct answers in puzzle | Unique Answers |
| 12 | Debut count | Answers not in previous puzzles | Debut Count |
| 13 | Freshness score | % of debuts / total answers | Freshness Score |
| 14 | Day-of-week difficulty | Relative Scrabble score vs DoW average | Relative Difficulty |

### Category 2: Analytics With New Table (After Read-Plane Is Stable)

**New `puzzle_analytics` table** (migration 0002):
```sql
CREATE TABLE IF NOT EXISTS puzzle_analytics (
    puzzle_id INTEGER PRIMARY KEY,
    scrabble_score INTEGER,
    scrabble_average REAL,
    avg_word_length REAL,
    missing_letters TEXT,
    is_pangram INTEGER DEFAULT 0,
    cheater_count INTEGER,
    open_squares INTEGER,
    grid_flow REAL,
    word_length_dist TEXT,
    letter_dist TEXT,
    unique_answer_count INTEGER,
    debut_count INTEGER DEFAULT 0,
    freshness_score REAL,
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (puzzle_id) REFERENCES puzzles(puzzle_id)
);
```

### Analytics API Endpoints (When Enabled)

```
GET /api/analytics/:date     — Analytics for a specific puzzle
GET /api/analytics/latest    — Analytics for the most recent puzzle
GET /api/stats/distribution  — Aggregate stats across the archive
```

---

## PART 8: IMPLEMENTATION PHASES — V3 ORDER

### Phase 0 — Stop Drift (IMMEDIATE)
1. ✅ DONE — Removed generated `workers/` from git tracking, added to `.gitignore`
2. ✅ DONE — One canonical runtime tree in `sujitbhai7710/all-crossword-worker`
3. Freeze any other copies as read-only or delete

### Phase 1 — Correctness First (Week 1)
4. Remove Guardian Everyman and Guardian Speedy from `config/workers.json`
5. Keep USA Today Quick — add canary test in scheduler
6. Fix Guardian exact-date validation (BUG: series-page returns wrong puzzle for non-latest dates)
7. Port LA Times Mini loadToken fix into canonical runtime (already in repo)
8. Harden write auth: POST-only + Bearer token + reject if no secret (BUGs 3-5)
9. Fix `/api/puzzle/latest` 400 error (BUG 1)
10. Fix N+1 query in `getRelatedClues()` (BUG 2)
11. Standardize the mini archive onto the shared archive API contract (BUG 13)
12. Add `Cache-Control` and `ETag` headers to all public read endpoints

### Phase 2 — Scheduler and Deployment Cleanup (Week 2)
13. Build the scheduler worker with ≤5 account-level cron triggers
14. Add Queues or service-binding fan-out for provider update jobs
15. Remove per-worker crons from `scripts/generate.mjs` and generated `wrangler.toml`
16. Remove legacy GitHub `today.json` writebacks (BUG 25)
17. Add NYT Oracle pre-flight check in scheduler before NYT fetches

### Phase 3 — Read-Path Scale (Week 3-4)
18. Extend the cold-archive shard generator into a full static publish pipeline
19. Serve exact clue and answer lookups plus per-date puzzle JSON from Pages or R2 static assets
20. Add Cache API in the archive runtime for edge-local hot caching
21. Add KV as the middle cache layer between Cache API and D1
22. Add must-have D1 indexes (migration)
23. Add `LIMIT 50` to all search queries

### Phase 4 — Solver Optimization (Week 4-5)
24. Make internal exact lookups the first return path
25. Add static-shard lookup before any external solver fallback
26. Add integration test for mini lookup when `ENABLE_MINI_LOOKUP=true`
27. Cache solver results in Cache API with 24h TTL
28. Precompute top 5000 common clues into D1

### Phase 5 — Analytics (After Read-Plane Is Stable)
29. Write analytics computation code (Category 1: zero DB change)
30. Add analytics computation to the cron ingest path (write-only, no extra D1 reads)
31. Publish analytics as static per-date JSON alongside puzzle data
32. Add `puzzle_analytics` table (Category 2) only when D1 read budget allows
33. Enable analytics API endpoints in production

### Phase 6 — Scale If Measured (ONLY IF METRICS REQUIRE IT)
34. Monitor actual traffic vs free-tier limits
35. If a single account can't handle the read load after static optimization, then shard
36. Shard by putting high-traffic workers in separate accounts
37. Each shard gets its own 100K requests/day + 5M D1 reads/day

---

## APPENDIX A: Smoke Test Results From All Reviews

### Live Provider Fetches (2026-05-25 to 2026-05-28)

| Provider | Date Tested | Result | Notes |
|----------|------------|--------|-------|
| Atlantic | 2026-05-25 | ✅ Pass | Root provider works |
| Guardian Quick (root) | 2026-05-25 to 28 | ❌ Fail | Recent dates not found |
| Guardian Quick (series page) | 2026-05-25 to 28 | ⚠️ Partial | Returns same latest puzzle for all dates — exact-date validation needed |
| LA Times Mini (root) | 2026-05-25 to 28 | ❌ Fail | No `rawc` payload |
| LA Times Mini (planned) | 2026-05-25 to 28 | ✅ Pass | loadToken fix works |
| USA Today Daily | 2026-05-25 | ✅ Pass | Root provider works |
| USA Today Quick | 2026-05-21 to 28 | ✅ Pass | **Not dead — works as of 2026-05-28** |
| New Yorker | 2026-05-25 | ✅ Pass | Conde Nast API with UUID |
| New Yorker Mini | 2026-05-25 | ✅ Pass | Same API, mini path |
| Universal | 2026-05-25 | ✅ Pass | AM Universal JSON API |
| Newsday | 2026-05-25 | ✅ Pass | AmuseLabs with loadToken |
| Vox | 2026-05-25 | ✅ Pass | AmuseLabs with loadToken |
| Daily Pop | 2026-05-25 | ✅ Pass | PuzzleNation API |
| NYT Midi | 2026-05-25 | ✅ Pass | NYT v6 API |
| WaPo Daily | 2026-05-26 | ✅ Pass | WaPo JSON API |
| WaPo Mini | 2026-05-26 | ✅ Pass | WaPo JSON API |
| WaPo Sunday | 2026-05-24 | ✅ Pass | WaPo JSON API |

### Sources Not Re-Tested (Should Add to Canary Suite)
- `latimes-daily`
- `washington-post-daily`
- `washington-post-mini`
- `washington-post-sunday`
- `usa-today-daily`

### Deployed Endpoint Checks
- `crossword-archive-worker.mitomat.workers.dev`: Public read works, but no cache headers
- `nyt-mini-archive.nytsolver.workers.dev`: Exact clue lookup works, no cache headers
- `crossword-solver-api.mitomat.workers.dev`: Solver responses include cache headers ✅

---

## APPENDIX B: Official Docs Used

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 pricing and limits: https://developers.cloudflare.com/d1/platform/pricing/
- Workers KV limits: https://developers.cloudflare.com/kv/platform/limits/
- Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Queues on free plan: https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/
- Cache API behavior: https://developers.cloudflare.com/workers/runtime-apis/cache/
