# All Crossword Worker

This folder contains a shared Cloudflare Worker archive runtime plus separate worker projects for the crossword games that are currently working from the existing scraping codebase.

Included workers:

- `atlantic`
- `guardian-cryptic`
- `guardian-prize`
- `guardian-quick`
- `guardian-quiptic`
- `guardian-weekend`
- `latimes-daily`
- `latimes-mini`
- `usa-today-daily`
- `usa-today-quick`
- `washington-post-daily`
- `washington-post-mini`
- `washington-post-sunday`

Not included in this scaffold:

- `nyt-crossword`
- `nyt-mini`

Reason: NYT daily and NYT mini were already covered in the existing setup.

Shared pieces:

- `shared/core/createArchiveWorker.js`: common Worker API, D1 persistence, search, add/update/delete, and scheduled sync.
- `shared/core/amuselabs.js`: shared AmuseLabs decoding used by Atlantic and LA Times Mini.
- `shared/providers/*.js`: source-specific fetchers.
- `shared/migrations/*.sql`: shared D1 schema copied from the existing archive worker design.

Generated worker projects live under `workers/`.

Setup docs:

- See `SETUP-COMMANDS.md` for step-by-step Wrangler commands for every worker.

After any change to `config/workers.json`, regenerate the per-worker folders:

```bash
npm run generate
```
