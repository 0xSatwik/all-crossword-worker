# Setup Commands

Run these from `all-crossword-worker/` after `npm run generate`.

Shared migration files:

- `shared/migrations/0000_initial_migration.sql`
- `shared/migrations/0001_normalized_lookup_columns.sql`

Optional secret for all workers:

- `API_TOKEN`: required for `POST /api/add/...`, `POST /api/update/latest`, and `POST /api/delete/...`.
- `GUARDIAN_API_KEY`: optional for Guardian workers. If omitted, the public `test` key is used.

## Atlantic Crossword

```powershell
cd workers/atlantic
npx wrangler d1 create atlantic_crossword_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
npx wrangler d1 execute atlantic_crossword_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute atlantic_crossword_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## Guardian Cryptic

```powershell
cd workers/guardian-cryptic
npx wrangler d1 create guardian_cryptic_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
# Optional: only if you want your own Guardian API key
# npx wrangler secret put GUARDIAN_API_KEY
npx wrangler d1 execute guardian_cryptic_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute guardian_cryptic_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## Guardian Prize

```powershell
cd workers/guardian-prize
npx wrangler d1 create guardian_prize_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
# Optional: only if you want your own Guardian API key
# npx wrangler secret put GUARDIAN_API_KEY
npx wrangler d1 execute guardian_prize_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute guardian_prize_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## Guardian Quick

```powershell
cd workers/guardian-quick
npx wrangler d1 create guardian_quick_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
# Optional: only if you want your own Guardian API key
# npx wrangler secret put GUARDIAN_API_KEY
npx wrangler d1 execute guardian_quick_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute guardian_quick_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## Guardian Quiptic

```powershell
cd workers/guardian-quiptic
npx wrangler d1 create guardian_quiptic_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
# Optional: only if you want your own Guardian API key
# npx wrangler secret put GUARDIAN_API_KEY
npx wrangler d1 execute guardian_quiptic_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute guardian_quiptic_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## Guardian Weekend

```powershell
cd workers/guardian-weekend
npx wrangler d1 create guardian_weekend_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
# Optional: only if you want your own Guardian API key
# npx wrangler secret put GUARDIAN_API_KEY
npx wrangler d1 execute guardian_weekend_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute guardian_weekend_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## LA Times Daily

```powershell
cd workers/latimes-daily
npx wrangler d1 create latimes_daily_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
npx wrangler d1 execute latimes_daily_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute latimes_daily_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## LA Times Mini

```powershell
cd workers/latimes-mini
npx wrangler d1 create latimes_mini_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
npx wrangler d1 execute latimes_mini_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute latimes_mini_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## USA Today Daily

```powershell
cd workers/usa-today-daily
npx wrangler d1 create usa_today_daily_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
npx wrangler d1 execute usa_today_daily_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute usa_today_daily_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## Washington Post Daily

```powershell
cd workers/washington-post-daily
npx wrangler d1 create washington_post_daily_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
npx wrangler d1 execute washington_post_daily_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute washington_post_daily_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## Washington Post Mini

```powershell
cd workers/washington-post-mini
npx wrangler d1 create washington_post_mini_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
npx wrangler d1 execute washington_post_mini_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute washington_post_mini_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```

## Washington Post Sunday

```powershell
cd workers/washington-post-sunday
npx wrangler d1 create washington_post_sunday_archive
# Copy the returned database_id into wrangler.toml
npx wrangler kv namespace create HOT_CACHE
# Copy the returned id into wrangler.toml as HOT_CACHE.id
npx wrangler kv namespace create HOT_CACHE --preview
# Copy the returned id into wrangler.toml as HOT_CACHE.preview_id
npx wrangler secret put API_TOKEN
npx wrangler d1 execute washington_post_sunday_archive --file=../../shared/migrations/0000_initial_migration.sql --remote
npx wrangler d1 execute washington_post_sunday_archive --file=../../shared/migrations/0001_normalized_lookup_columns.sql --remote
npx wrangler deploy
```
