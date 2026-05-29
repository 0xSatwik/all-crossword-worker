# Crossword Archiving System - Plan V4

## Issues

- Planning documents disagree on source inventory. `master-plan.md` says remove `usa-today-quick`, `planv3.md` says keep it, and `plan/all-crossword-worker/config/workers.json` currently removes it anyway.

- Worker counts do not reconcile. The outer tracked `config/workers.json` has 15 workers, the nested `plan/all-crossword-worker/config/workers.json` has 19 workers, and `planv3.md` says the final count is 17.

- Repo state and plan state are not the same project right now. The outer repo still tracks `workers/` and has no root `.gitignore`, while `plan/all-crossword-worker` is a separate nested Git repo with its own `.gitignore`.

- `plan/all-crossword-worker` is not merged into the main repo. The outer repo currently shows `plan/` as untracked, so it is not correct to describe that tree as the live canonical runtime for this repository.

- The `DONE` claims about removing generated workers from Git tracking and having one canonical runtime are not true for the current outer repo state.

- USA Today Quick is still unresolved for real Cloudflare Worker execution. Local provider tests may pass, but the deployed test worker response for `2026-05-28` did not confirm a successful puzzle fetch and instead showed GraphQL failures.

- Guardian freshness is still only partially solved. The newer fallback code in `plan/all-crossword-worker/shared/providers/guardian.js` can scrape the series page, but it does not validate that the fetched puzzle actually matches the requested date before returning it.

- The tracked outer runtime still uses the older Guardian Content API-only provider, so the freshness fallback described in the newer plan is not present in the current root code.

- The shared runtime still exposes write operations as GET routes with optional token in the URL path. That means the V3 hardening language is ahead of the actual code.

- The legacy NYT archive worker still uses URL-path token support and still writes `today.json` back to GitHub, so that cleanup is not complete.

- Search behavior is still inconsistent across runtimes. The NYT mini archive still uses a different contains-mode search path than the normalized shared worker path.

- `getRelatedClues()` still performs N+1 database reads in the shared runtime, so the read-path scaling story is not yet backed by the actual query shape.

- The nested plan repo docs and setup commands assume generated worker directories such as `workers/new-yorker`, but `plan/all-crossword-worker/workers/` does not currently exist in the filesystem.

- Several provider claims are stronger than the evidence attached to the current tracked runtime. Some providers look promising, but not all "verified" sources are re-proven from the same deployed edge/runtime combination.

## Extra Findings

- The outer repo root `config/workers.json` still includes `guardian-everyman`, `guardian-speedy`, and `usa-today-quick`.

- The nested `plan/all-crossword-worker/config/workers.json` removes `guardian-everyman`, `guardian-speedy`, and `usa-today-quick`, and adds `new-yorker`, `new-yorker-mini`, `universal`, `newsday`, `vox`, `daily-pop`, and `nyt-midi`.

- `planv3.md` does not match either config file on final worker count.

- The outer repo has no root `.gitignore`.

- The nested `plan/all-crossword-worker` tree has its own `.git` directory, which is a major reason the docs, configs, and runtime code are drifting apart.

- `git status` in the outer repo shows `?? plan/` and `?? planv3.md`, so the newer planning/runtime work is not part of the main tracked history yet.

- The deployed USA Today Quick Cloudflare test on `2026-05-28` showed GraphQL failure responses rather than a confirmed working ingest path.

- The deployed Guardian Quick Cloudflare test on `2026-05-28` still showed same-day Content API lag, so the freshness issue is confirmed.

- The biggest current risk is repo/runtime drift, not lack of ideas. The architecture direction is mostly fine, but the source of truth is not.

## Better Approach

- Pick one repo as the real source of truth first. Either merge `plan/all-crossword-worker` into the outer repo and remove the nested `.git`, or stop using it as a parallel runtime and port only proven changes back into root.

- Change every status marker that is not merged into the main tracked runtime from `DONE` to `PROPOSED`, `PARTIAL`, or `VERIFIED IN TEST TREE ONLY`.

- Freeze worker inventory before more planning. Keep one authoritative `workers.json`, one worker count, and one deployment list.

- Treat USA Today Quick as `unproven on Cloudflare edge` until one end-to-end Worker ingest test stores a real puzzle successfully.

- Keep the Guardian dual strategy, but finish it correctly: Content API for historical lookups, series-page fallback for freshness, and strict exact-date validation before save.

- Fix the admin/write surface before scale work. Move add/update/delete to POST-only routes, accept auth only through `Authorization`, and remove token-in-path behavior from shared and NYT legacy workers.

- Unify clue and answer search behavior across shared workers, solver workers, and NYT mini workers before adding traffic optimization layers.

- Keep the static read-plane idea, but prefer R2 as the archive source of truth and use Pages mainly as the frontend delivery layer if needed.

- Add the scheduler worker only after runtime unification; otherwise it will automate drift between two runtimes instead of solving it.

- Keep analytics after read-plane stabilization, not before.

- Add one Cloudflare-edge canary suite for every kept provider and use that as the gate for keep/remove/build decisions.
