# Crossword Archiving System — Plan V5

**Last Updated**: 2026-05-29
**Status**: HARDENED PLAN — Incorporates Codex V4 audit findings
**Principle**: If it is not proven working on the actual Cloudflare edge, remove it. Do not build unproven sources. Fix core before scaling.

**Repo (SINGLE source of truth)**:
- https://github.com/sujitbhai7710/all-crossword-worker

**Production Endpoints**:
- https://crossword-archive-worker.mitomat.workers.dev (NYT Daily Archive)
- https://crossword-solver-api.mitomat.workers.dev (Solver API)
- https://nyt-mini-archive.nytsolver.workers.dev (NYT Mini Archive)

---

## V4 AUDIT — WHAT WAS WRONG WITH V3

Codex's V4 audit found that V3 claimed more than the code could deliver. The core problems were:

| # | Issue | Impact | V5 Resolution |
|---|-------|--------|---------------|
| 1 | Worker counts disagreed across docs and configs | Nobody knew the real count | **One workers.json, one count** |
| 2 | USA Today Quick marked "WORKING" but deployed CF test showed GraphQL failures | False confidence in a broken source | **REMOVE — unproven on CF edge** |
| 3 | Guardian series page fix had no date validation in actual tracked code | Same puzzle returned for all dates | **Fix before deploy, not after** |
| 4 | Write endpoints still use GET routes with token-in-path in tracked code | Security claims ahead of actual code | **Fix writes BEFORE any scale work** |
| 5 | Legacy NYT archive still writes today.json to GitHub | External dependency, leaked tokens | **Remove GitHub writebacks first** |
| 6 | Search behavior inconsistent across runtimes | Broken user experience | **Unify search BEFORE adding traffic** |
| 7 | `getRelatedClues()` still does N+1 DB reads | Read-path scaling story not real | **Fix query shape first** |
| 8 | New source providers "verified" only in test tree, not deployed edge | Claims stronger than evidence | **Mark PROPOSED, not DONE** |
| 9 | Nested `plan/all-crossword-worker` had its own `.git` | Runtime drift between two trees | **One repo, no nested git** |
| 10 | Status markers said DONE for unmerged work | Misleading project tracking | **Honest markers: PROVEN / PROPOSED / PARTIAL / UNPROVEN** |

### V5 Decision Rule

> **If a source is not working correctly end-to-end on the Cloudflare edge (fetch → parse → store → read back), do not build it. Remove it from the plan until it is proven.**

This means:
- Sources that only work in local tests or test-worker sandowns are **PROPOSED**, not **PROVEN**
- Sources that fail deployed Worker tests are **REMOVED**
- Partial fixes that are not merged into the tracked runtime are **PARTIAL**, not **DONE**

---

## SOURCE STATUS — HONEST ASSESSMENT

### Tier 1: PROVEN — Working in Production Right Now

These sources have deployed Workers that successfully fetch, store, and serve puzzles.

| # | Source | Status | Worker Deployed? | Evidence |
|---|--------|--------|-----------------|----------|
| 1 | NYT Daily | PROVEN | Yes (mitomat.workers.dev) | Production traffic, verified daily |
| 2 | NYT Mini | PROVEN | Yes (nytsolver.workers.dev) | Production traffic, verified daily |

These two are the ONLY sources running in production. Everything else is either in the shared framework (not deployed) or in the test worker only.

### Tier 2: PROVEN IN TEST — Works From Test Worker, Not Yet Deployed Individually

These sources have been verified from the test worker (`crossword-test-worker.slideshow.workers.dev`) but have NOT been deployed as individual production Workers yet.

| # | Source | Status | Test Worker? | Individual Deploy? | Known Issues |
|---|--------|--------|-------------|-------------------|--------------|
| 3 | Atlantic | PROVEN IN TEST | Yes | No | None |
| 4 | LA Times Daily | PROVEN IN TEST | Yes | No | None |
| 5 | LA Times Mini | PROVEN IN TEST | Yes | No | Needs loadToken fix (verified) |
| 6 | USA Today Daily | PROVEN IN TEST | Yes | No | None |
| 7 | WaPo Daily | PROVEN IN TEST | Yes | No | None |
| 8 | WaPo Mini | PROVEN IN TEST | Yes | No | None |
| 9 | WaPo Sunday | PROVEN IN TEST | Yes | No | None |

### Tier 3: PROPOSED — Code Exists But Not Proven On Edge

These sources have provider code in the repo but have NOT been verified from a deployed Cloudflare Worker. They are **not ready to build** until a canary test proves them on the edge.

| # | Source | Status | Code In Repo? | Can Be Built? | Blocker |
|---|--------|--------|--------------|---------------|---------|
| 10 | Guardian Quick | PROPOSED | Yes (but no date validation) | Not yet | Fix date validation first |
| 11 | Guardian Cryptic | PROPOSED | Yes (but no date validation) | Not yet | Fix date validation first |
| 12 | Guardian Prize | PROPOSED | Yes (but no date validation) | Not yet | Fix date validation first |
| 13 | Guardian Quiptic | PROPOSED | Yes (but no date validation) | Not yet | Fix date validation first |
| 14 | Guardian Weekend | PROPOSED | Yes (but no date validation) | Not yet | Fix date validation first |
| 15 | New Yorker | PROPOSED | Yes | Not yet | Needs edge canary |
| 16 | New Yorker Mini | PROPOSED | Yes | Not yet | Needs edge canary |
| 17 | Universal | PROPOSED | Yes | Not yet | Needs edge canary |
| 18 | Newsday | PROPOSED | Yes | Not yet | Needs edge canary |
| 19 | Vox | PROPOSED | Yes | Not yet | Needs edge canary |
| 20 | Daily Pop | PROPOSED | Yes | Not yet | Needs edge canary |
| 21 | NYT Midi | PROPOSED | Yes | Not yet | Needs edge canary (same auth as NYT Daily) |

### Tier 4: REMOVED — Do Not Build

These sources are either dead, unproven on the edge, or broken. Per V5 principle: remove rather than risk.

| # | Source | Status | Why Removed |
|---|--------|--------|------------|
| 22 | Guardian Everyman | DEAD | Last puzzle April 2025, 404 confirmed |
| 23 | Guardian Speedy | DEAD | Last puzzle April 2025, 404 confirmed |
| 24 | USA Today Quick | UNPROVEN | Deployed CF Worker test on 2026-05-28 showed GraphQL failures. Local tests may pass but edge does not. **Remove until someone proves it end-to-end.** |
| 25 | Puzzmo | PARTIAL | GraphQL schema changed, endpoint responds but no working query. Not worth building. |
| 26 | NYT Workers (Daily/Mini) as shared workers | OUT OF SCOPE | NYT workers have their own separate codebases and are not part of the shared framework migration yet |

---

## AUTHORITATIVE WORKER COUNT

There is **not yet one authoritative workers.json in the current workspace**.

Verified current state:
- Outer tracked `config/workers.json` has **15 entries**
- Nested `plan/all-crossword-worker/config/workers.json` has **19 entries**
- The outer tracked config still includes `guardian-everyman`, `guardian-speedy`, and `usa-today-quick`
- The nested plan config removes those three and adds `new-yorker`, `new-yorker-mini`, `universal`, `newsday`, `vox`, `daily-pop`, and `nyt-midi`

So the correct V5 statement is:
- **Current repo state is split**
- **Do not call either count canonical until the repo is unified**
- **USA Today Quick should remain removed from the target deploy list unless it is proven end-to-end on Cloudflare edge**

---

## PHASE 0: FIX THE REPO — Before Any Code Changes

Before writing ANY new code, fix the repo state. This is the foundation for everything else.

### 0.1 — One Repo, One Source of Truth

The repo at `sujitbhai7710/all-crossword-worker` IS the single source of truth. No nested git repos, no parallel runtimes.
Verified correction: this is the target state, not the current workspace state. The current workspace still has a nested `plan/all-crossword-worker/.git` and still has tracked generated `workers/` files in the outer repo.

- [x] Nested `plan/all-crossword-worker` with its own `.git` — does not exist in current repo (verified)
- [x] Generated `workers/` directory removed from git tracking (verified)
- [ ] Root `.gitignore` needs to exist and cover `workers/`, `node_modules/`, `.env*`

### 0.2 — Freeze Worker Inventory

The current `config/workers.json` with 19 entries is frozen. No additions or removals until Phase 1 canary tests are complete.
Verified correction: the outer tracked `config/workers.json` currently has 15 entries, while the nested `plan/all-crossword-worker/config/workers.json` has 19. Do not treat the 19-entry list as canonical until the repo is unified.

Current workers.json entries (19):
```
atlantic, guardian-cryptic, guardian-prize, guardian-quick, guardian-quiptic,
guardian-weekend, latimes-daily, latimes-mini, usa-today-daily,
washington-post-daily, washington-post-mini, washington-post-sunday,
new-yorker, new-yorker-mini, universal, newsday, vox, daily-pop, nyt-midi
```

Note: `guardian-everyman`, `guardian-speedy`, and `usa-today-quick` are already removed. Good.
Verified correction: that is true in the nested plan config, but not in the outer tracked `config/workers.json`, which still includes all three.

### 0.3 — Honest Status Markers

Every claim in this plan uses one of four markers:
- **PROVEN** — Working in production with real traffic
- **PROVEN IN TEST** — Verified from test worker, not individually deployed
- **PROPOSED** — Code exists but not proven on edge
- **REMOVED** — Do not build, dead or unproven

---

## PHASE 1: FIX CORE BUGS — No New Features Until These Are Done

This is the most important phase. Every V4 issue that Codex flagged about the code being ahead of itself comes from skipping these fixes.

### 1.1 — Fix Write Surface (CRITICAL — Do This First)

**Problem**: The shared runtime still exposes write operations as GET routes with optional token in URL path. V3 claimed POST+Bearer hardening but the actual tracked code does not have it.

**What to fix in `shared/core/createArchiveWorker.js`**:

```javascript
// BEFORE (current code — INSECURE):
// Write routes accept GET requests
// Token can be in URL path
// No API_TOKEN = open access

// AFTER (V5 fix):
function authorizeWrite(request, env) {
  // No secret = no writes, ever
  if (!env.API_TOKEN) return false;
  // Only accept Bearer header, not URL path
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.API_TOKEN}`;
}

// Every write route must check method first
if (request.method !== 'POST') {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { 'Allow': 'POST' }
  });
}
if (!authorizeWrite(request, env)) {
  return new Response('Unauthorized', { status: 401 });
}
```

**Status**: PROPOSED — not yet in tracked code

### 1.2 — Fix N+1 Query in getRelatedClues()

**Problem**: `getRelatedClues()` fetches clue IDs, then does individual queries per date. This is N+1 reads.

**Fix**: Single JOIN query with LIMIT 50:
```sql
SELECT c.number, c.direction, c.clue_text, c.answer, c.answer_len,
       p.date, p.formatted_date, p.day_of_week, p.title
FROM clues c
JOIN puzzles p ON p.puzzle_id = c.puzzle_id
WHERE c.answer_norm = ?
ORDER BY p.date DESC
LIMIT 50
```

**Status**: PROPOSED — not yet in tracked code

### 1.3 — Fix `/api/puzzle/latest` Returns 400

**Problem**: Route handler matches `/api/puzzle/latest` as a date, then `parseDate("latest")` fails.
Verified correction: this is not true for the current shared runtime in `shared/core/createArchiveWorker.js`; that file already handles `/api/puzzle/latest` before the date route. Keep this only as a legacy-runtime audit item if needed.

**Fix**: Add explicit route handling BEFORE the date-based route:
```javascript
if (url.pathname === '/api/puzzle/latest') {
  const result = await env.DB.prepare(
    'SELECT date FROM puzzles ORDER BY date DESC LIMIT 1'
  ).first();
  if (!result) return notFound('No puzzles available');
  return getPuzzleByDate(result.date, env);
}
```

**Status**: PROPOSED — not yet in tracked code

### 1.4 — Fix Guardian Date Validation

**Problem**: The current `shared/providers/guardian.js` has `fetchGuardianPuzzleFromSeriesPage()` that returns the FIRST puzzle found on the series page without checking if its date matches the requested date. Codex live-tested this and confirmed the same latest puzzle was returned for all tested dates.

**Fix**: Add exact-date validation using `webPublicationDate`:
```javascript
// In fetchGuardianPuzzleFromSeriesPage(), after decoding props:
const pubDate = props.data?.webPublicationDate
  ? props.data.webPublicationDate.slice(0, 10)  // "2026-05-25T23:00:00Z" -> "2026-05-25"
  : props.data?.date;

if (pubDate === date) {
  return parseGuardianPuzzle(pageData, date, puzzleUrl, `Guardian ${seriesTag} crossword`);
}
// Do NOT fall back to props.data?.number — that is always truthy and matches the latest puzzle
```

**Status**: PROPOSED — not yet in tracked code. This MUST be fixed before any Guardian worker is deployed.

### 1.5 — Remove GitHub Writebacks from Legacy NYT Archive

**Problem**: The legacy NYT daily archive worker still writes `today.json` back to GitHub. This adds external API dependency, extra latency, and secret management burden. Tokens can leak through GitHub API calls.

**Fix**: Remove all GitHub writeback code. Replace with R2 publish or static Pages output.

**Status**: PROPOSED — not yet in tracked code. Separate repo, separate fix.

### 1.6 — Unify Search Behavior

**Problem**: NYT mini archive uses a different contains-mode search path than the normalized shared worker path. `searchByClue()` in the mini worker uses `WHERE LOWER(clue) LIKE ?` instead of `WHERE clue_norm LIKE ?`.

**Fix**: Move all archives to the shared contract. Use `clue_norm` everywhere.

**Status**: PROPOSED — not yet in tracked code

### 1.7 — Fix NYT Mini Unknown Routes Return HTTP 200

**Problem**: Fallback Response in NYT mini archive doesn't set status 404.

**Fix**: Add `status: 404` to the fallback Response.

**Status**: PROPOSED — not yet in tracked code. Separate repo.

---

## PHASE 2: CANARY SUITE — Prove Every Source On The Edge

Before deploying any worker individually, we need a canary test that runs on the actual Cloudflare edge (not just the test worker) and confirms end-to-end: fetch → parse → store → read back.

### 2.1 — Build The Canary Worker

Create a single canary worker that:
1. Iterates through every provider in `config/workers.json`
2. For each provider, fetches yesterday's puzzle
3. Validates the response has all required fields (title, author, clues with answers)
4. Stores the result in a canary D1 table
5. Returns a JSON report: `{ source, date, status, hasTitle, hasAuthor, clueCount, answerCount }`

```javascript
// workers/canary/src/index.js
export default {
  async scheduled(event, env, ctx) {
    const results = [];
    for (const provider of getAllProviders()) {
      try {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const puzzle = await provider.fetchByDate(yesterday, env);
        results.push({
          source: provider.slug,
          date: yesterday,
          status: 'OK',
          hasTitle: !!puzzle.title,
          hasAuthor: !!puzzle.author,
          clueCount: (puzzle.across?.length || 0) + (puzzle.down?.length || 0),
          answerCount: [...(puzzle.across || []), ...(puzzle.down || [])]
            .filter(c => c.answer).length,
        });
      } catch (e) {
        results.push({
          source: provider.slug,
          date: yesterday,
          status: 'FAIL',
          error: e.message,
        });
      }
    }
    await env.CANARY_DB.prepare(
      'INSERT INTO canary_results (run_date, results_json) VALUES (?, ?)'
    ).bind(new Date().toISOString(), JSON.stringify(results)).run();
  },
};
```

### 2.2 — Canary Gate Rule

**A source passes the canary when**:
1. It successfully fetches yesterday's puzzle from the Cloudflare edge
2. The puzzle has a non-empty title and author
3. The puzzle has at least 10 clues with answers
4. The same test passes 3 days in a row

**A source that fails the canary 3 days in a row**:
1. Is marked UNPROVEN
2. Is removed from the deploy list
3. Gets a GitHub issue to investigate
4. Is NOT re-added until a human verifies the fix

### 2.3 — Specific Canary Concerns Per Source

| Source | Canary Risk | Why |
|--------|------------|-----|
| USA Today Quick | HIGH | Deployed test on 2026-05-28 showed GraphQL failures. Already removed from workers.json, but if re-added, must pass 3-day canary. |
| Guardian (all) | MEDIUM | Content API has 3-7 day lag. Series page fallback exists but no date validation in tracked code. Must validate that correct-dated puzzle is returned. |
| Daily Pop | MEDIUM | Uses HTTP (not HTTPS) for API key fetch. CF Workers may block mixed content. Must test on edge. |
| New Yorker | LOW | Conde Nast API works in test, but UUID extraction depends on page structure. Fragile if they change HTML. |
| NYT Midi | LOW | Same auth as proven NYT Daily/Mini. Low risk, but must still pass canary. |
| AmuseLabs providers (Atlantic, Newsday, Vox) | LOW | loadToken mechanism proven for LA Times Mini. Same pattern should work. |

---

## PHASE 3: DEPLOY INDIVIDUAL WORKERS — Only After Phase 1 + 2

### 3.1 — Deploy Order

Only deploy a worker AFTER:
1. Phase 1 core bugs are fixed and merged
2. The source passes the 3-day canary
3. The write surface is hardened (POST-only, Bearer-only)

**Batch 1 — Proven in test, no code changes needed** (deploy after Phase 1):
1. Atlantic
2. LA Times Daily
3. USA Today Daily
4. WaPo Daily
5. WaPo Mini
6. WaPo Sunday

**Batch 2 — Proven in test, needs code fix first** (deploy after Phase 1.4):
7. LA Times Mini (needs loadToken fix applied)
8. Guardian Quick (needs date validation fix)
9. Guardian Cryptic (needs date validation fix)
10. Guardian Prize (needs date validation fix)
11. Guardian Quiptic (needs date validation fix)
12. Guardian Weekend (needs date validation fix)

**Batch 3 — Proposed, needs canary first** (deploy only after Phase 2 canary passes):
13. New Yorker
14. New Yorker Mini
15. Universal
16. Newsday
17. Vox
18. Daily Pop
19. NYT Midi

### 3.2 — Per-Worker Deployment Checklist

For each worker deployment:
- [ ] Provider code in `shared/providers/` is reviewed and tested
- [ ] Canary passes 3 days in a row
- [ ] Write surface is POST-only with Bearer auth
- [ ] D1 database created and migrations applied
- [ ] Worker deployed with `wrangler deploy`
- [ ] Smoke test: `curl https://{worker}/api/puzzle/latest` returns valid JSON
- [ ] Smoke test: `curl -X POST https://{worker}/api/update/latest -H "Authorization: Bearer {token}"` triggers fetch
- [ ] Cron trigger configured in scheduler worker

---

## PHASE 4: SCHEDULER WORKER — Only After Runtime Unification

**Do NOT build the scheduler worker before Phase 1-3 are complete.**

V3 said to build the scheduler worker early. Codex V4 correctly identified that if you automate a broken runtime, you just automate drift. The scheduler should only be built after:

1. All core bugs are fixed (Phase 1)
2. Canaries are passing (Phase 2)
3. Workers are individually deployed (Phase 3)

### 4.1 — Why The Scheduler Is Needed

Cloudflare free tier: **5 cron triggers per account** (not per worker).

With 19 workers, per-worker crons would need 19+ triggers. That exceeds the limit. A single scheduler worker with 5 crons fans out to individual workers.

### 4.2 — Scheduler Cron Configuration

| Cron # | Expression (UTC) | Groups Triggered | Why |
|--------|-----------------|------------------|-----|
| 1 | `0 0 * * *` | Guardian (5 sources) | Midnight GMT |
| 2 | `0 3 * * *` | NYT Daily, Mini, Midi | 10 PM ET (Tue-Sat) |
| 3 | `0 5 * * *` | Atlantic, LA Times, USA Today, WaPo, New Yorker, Newsday, Universal, Vox, Daily Pop | Midnight ET |
| 4 | `0 14 * * *` | ALL workers (catch-up) | Missed puzzles from earlier |
| 5 | `0 23 * * 0,6` | NYT Daily, Mini | Weekend 6 PM ET |

### 4.3 — Scheduler Architecture

```text
SCHEDULER WORKER (5 crons)
  |
  +--> INGEST_QUEUE (Cloudflare Queue, 10K ops/day free)
        |
        +--> Worker A: POST /api/update/latest
        +--> Worker B: POST /api/update/latest
        +--> ...
```

Each ingest message: `{ workerSlug, date, scheduledAt }`

Worker receives the POST, fetches the puzzle, writes to D1, publishes to static read plane.

**Status**: PROPOSED — do not build until Phase 1-3 are done

---

## PHASE 5: READ-PLANE OPTIMIZATION — After Workers Are Stable

### 5.1 — 4-Layer Read Path

```text
Request Flow:
  1. Static JSON on R2 (globally replicated, ~0ms, NO Worker execution, NO D1 read)
     -> HIT? Return immediately
  2. Cache API (edge-local, ~0ms, NO D1 read)
     -> HIT? Return immediately
  3. KV Hot Cache (globally replicated, ~5ms, NO D1 read)
     -> HIT? Return + populate Cache API
  4. D1 Database (~20ms, counts against 5M read/day limit)
     -> HIT? Return + populate KV + Cache API
  5. NOT FOUND -> 404
```

### 5.2 — R2 as Archive Source of Truth

Codex V4 recommended preferring R2 over Pages for the static read plane:
- R2 is the archive source of truth for puzzle JSON
- Pages is the frontend delivery layer (if needed)
- After each successful cron ingest, write the puzzle JSON to R2: `archive/{source}/{date}.json`
- R2 has no egress fees on the free tier

### 5.3 — Static Public Paths

After ingest, publish to R2:
- `/archive/{source}/{date}.json` — Full puzzle data (immutable, cache forever)
- `/latest/{source}.json` — Most recent puzzle (1h TTL, overwrite on ingest)

### 5.4 — Workers Only For Dynamic Paths

- Contains search (can't be precomputed)
- Related clues (if not precomputed)
- Admin write paths
- Canary health endpoints

**Status**: PROPOSED — build after Phase 4

---

## PHASE 6: ANALYTICS — After Read-Plane Stabilization

Analytics (xwordinfo.com-style statistics) are a great feature but they must come LAST, not first. V3 said "write code now, enable after read-plane fix." V5 says: **do not write analytics code until the read plane is stable.**

### 6.1 — Analytics Schema (Migration 0002)

```sql
CREATE TABLE IF NOT EXISTS puzzle_analytics (
  puzzle_id TEXT PRIMARY KEY REFERENCES puzzles(puzzle_id),
  scrabble_score INTEGER,
  scrabble_average REAL,
  avg_word_length REAL,
  missing_letters TEXT,       -- comma-separated, e.g. "J,Q,X,Z"
  is_pangram INTEGER DEFAULT 0,
  cheater_count INTEGER,      -- number of black squares
  open_squares INTEGER,       -- number of white squares
  grid_flow REAL,            -- connectivity metric
  word_length_dist TEXT,      -- JSON: {"3":5,"4":8,"5":12,...}
  letter_dist TEXT,           -- JSON: {"A":23,"B":5,...}
  unique_answer_count INTEGER,
  debut_count INTEGER,        -- first-time answers in this puzzle
  freshness_score REAL,       -- % of answers not seen in last 10 years
  calculated_at TEXT
);
```

### 6.2 — When to Build Analytics

- After Phase 5 read-plane is deployed and measured
- After at least 30 days of stable cron ingest for each source
- After the D1 read limit is no longer a concern (static reads handle traffic)

**Status**: PROPOSED — do not build until Phase 5 is done

---

## COMPLETE BUG FIX LIST — PRIORITIZED (HONEST STATUS)

### CRITICAL — Must Fix Before Any Deployment

| Bug | Description | V3 Claimed | Actual Status | V5 Action |
|-----|-------------|-----------|---------------|-----------|
| BUG-1 | `/api/puzzle/latest` returns 400 | FIX DESCRIBED | NOT IN TRACKED CODE | Fix in Phase 1.3 |
| BUG-2 | N+1 query in `getRelatedClues()` | FIX DESCRIBED | NOT IN TRACKED CODE | Fix in Phase 1.2 |
| BUG-3 | Write endpoints use GET | V3 HARDENED | NOT IN TRACKED CODE | Fix in Phase 1.1 |
| BUG-4 | API token in URL path | V3 HARDENED | NOT IN TRACKED CODE | Fix in Phase 1.1 |
| BUG-5 | No API_TOKEN = open access | V3 HARDENED | NOT IN TRACKED CODE | Fix in Phase 1.1 |
| BUG-6 | Guardian no date validation | FIX DESCRIBED | NOT IN TRACKED CODE | Fix in Phase 1.4 |
| BUG-7 | NYT Mini returns 200 for 404s | FIX DESCRIBED | NOT IN TRACKED CODE | Fix in Phase 1.7 |

### HIGH — Fix This Week (After Criticals)

| Bug | Description | V5 Action |
|-----|-------------|-----------|
| BUG-8 | LA Times Mini 302 redirect | Apply loadToken fix (verified) |
| BUG-9 | Non-atomic `deletePuzzleByDate()` | Use `env.DB.batch()` |
| BUG-10 | Non-atomic `savePuzzleToDatabase()` | Use `INSERT ... RETURNING` or `env.DB.batch()` |
| BUG-11 | NYT Mini search uses wrong column | Change to `clue_norm` |
| BUG-12 | API key leaked in repo | Remove, rotate key |
| BUG-13 | API shape inconsistent across archives | Unify to shared contract |
| BUG-14 | Solver mini lookup out of sync | Fix internal result priority |
| BUG-15 | Legacy NYT writes today.json to GitHub | Remove GitHub writebacks, use R2 |
| BUG-16 | Search behavior inconsistent across runtimes | Unify search paths |

### MEDIUM — Fix This Month

| Bug | Description |
|-----|-------------|
| BUG-17 | LIKE wildcards silently removed |
| BUG-18 | JS vs SQL normalization mismatch |
| BUG-19 | Contains mode not cached |
| BUG-20 | Sequential lookback fetches |
| BUG-21 | HTTP URLs for uclick XML |
| BUG-22 | CORS inconsistency across workers |
| BUG-23 | Hardcoded User-Agent |
| BUG-24 | No Content-Type validation on external responses |
| BUG-25 | NYT workers have no lookback |
| BUG-26 | NYT workers duplicate shared framework code |

---

## CLOUDFLARE FREE-TIER LIMITS (VERIFIED)

| Resource | Limit | Impact |
|----------|-------|--------|
| Worker Requests | 100,000/day | Optimize reads, not accounts |
| D1 Reads | 5,000,000/day | Fine for ingest, not for hot reads |
| D1 Writes | 100,000/day | Fine for daily ingest |
| KV Reads | 100,000/day | NOT enough for main cache |
| KV Writes | 1,000/day | Config/secrets only |
| Cron Triggers | **5 per account** | Scheduler worker mandatory |
| Cache API | Unlimited | Edge-local only, NOT global |
| Queues | 10,000 ops/day | Enough for scheduler fan-out |
| R2 Storage | 10 GB free | Archive source of truth |
| R2 Class A ops | 1,000,000/month | Writes after ingest |
| R2 Class B ops | 10,000,000/month | Reads for static path |

---

## FUTURE DATE ACCESS

| Source | Future Access? | Action |
|--------|---------------|--------|
| WaPo Daily/Mini | T+1 day | Fetch and store, add `published_at` column, don't serve until publish date |
| All others | No | No action needed |

**DO NOT** expose future answers in the public API. Add `published_at` column and check before serving.

---

## NYT ORACLE — Pre-Flight Check

NYT has oracle endpoints showing current and next puzzle dates:
- `https://www.nytimes.com/svc/crosswords/v2/oracle/daily.json`
- `https://www.nytimes.com/svc/crosswords/v2/oracle/mini.json`

Response: `{ "status": "OK", "results": { "current": { "print_date": "..." }, "next": { "print_date": "..." } } }`

Use in scheduler: before fetching NYT, check oracle. If `next.print_date` matches target date, the puzzle is available. Saves one failed request per cron run.

---

## CANNOT BUILD — Permanently Blocked Sources

| Source | Why Blocked | xword-dl Status | Workaround? |
|--------|-------------|-----------------|-------------|
| WSJ | TLS fingerprinting anti-bot | Also disabled | No |
| McKinsey | SSL handshake sniffing | Also disabled | No |
| The Modern | Paywall | Also disabled | No |
| Globe and Mail | Outlet changed format | Also disabled | No |
| NYT Variety | No longer published digitally | Also disabled | No |

---

## PHASE SUMMARY — Execution Order

```
PHASE 0: Fix the repo           [1-2 days]
  -> One repo, one workers.json, honest status markers

PHASE 1: Fix core bugs          [1 week]
  -> Write surface hardening
  -> N+1 query fix
  -> /api/puzzle/latest fix
  -> Guardian date validation
  -> Search unification
  -> Remove GitHub writebacks

PHASE 2: Canary suite           [3 days minimum (3-day canary)]
  -> Build canary worker
  -> Run canary for every source
  -> Gate: source must pass 3 days to proceed

PHASE 3: Deploy workers         [2 weeks]
  -> Batch 1: Proven sources (7 workers)
  -> Batch 2: Sources needing code fixes (7 workers)
  -> Batch 3: Sources needing canary proof (7 workers)

PHASE 4: Scheduler worker       [1 week]
  -> Build AFTER runtime unification
  -> 5 cron triggers, queue fan-out
  -> Include canary as Cron #5 or health endpoint

PHASE 5: Read-plane optimization [2 weeks]
  -> R2 static JSON after ingest
  -> 4-layer cache
  -> Workers only for dynamic paths

PHASE 6: Analytics              [1-2 weeks]
  -> puzzle_analytics table
  -> xwordinfo.com-style stats
  -> AFTER read-plane is stable
```

Total estimated timeline: **6-8 weeks** from start to analytics, assuming no major blockers.

---

## WHAT V5 CHANGES FROM V3

| Item | V3 | V5 | Why |
|------|----|----|-----|
| USA Today Quick | Keep with canary | **REMOVE** | Deployed CF test showed GraphQL failures |
| Puzzmo | Keep as PARTIAL | **REMOVE** | Not worth building, broken GraphQL |
| Status markers | DONE / VERIFIED | **PROVEN / PROVEN IN TEST / PROPOSED / REMOVED** | Honest assessment |
| Guardian date validation | Described but not in code | **Must fix BEFORE deploy** | Codex proved the bug |
| Write surface | "V3 HARDENED" | **PROPOSED — not in tracked code** | Fix first, claim later |
| Scheduler worker | Build early | **Build AFTER Phase 1-3** | Don't automate a broken runtime |
| Analytics | "Write code now" | **Build AFTER Phase 5** | Don't add features on unstable core |
| New sources | "VERIFIED" | **PROPOSED** | Not proven on deployed edge |
| Worker count | 17 | **11 deployable today, up to 21 after canary** | Honest count |
| Repo state | Assumed unified | **Fix repo first (Phase 0)** | Foundation for everything |
| Canary suite | Not mentioned | **Required before any deploy** | Prove it on the edge |
| R2 vs Pages | Pages mentioned | **R2 as archive source of truth** | Codex V4 recommendation |
| getRelatedClues | "Fix described" | **Must fix before scale** | N+1 reads break scaling story |
