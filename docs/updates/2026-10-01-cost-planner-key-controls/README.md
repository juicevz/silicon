# Cost planner and key controls · 1 October 2026

## What changed

The [GPU rental planner](https://siliconmarkets.io/terminal/planner) estimates daily, 30-day and selected-period rental costs from fresh provider listings. Enter machines, GPUs per machine, hours per day and duration; compare listings, inspect their source timestamps and URLs, share the inputs or download CSV.

[Compute API access](https://siliconmarkets.io/compute?view=api) now supports per-key lifetime USD caps, pause/resume and used/pending/request totals. Each key links to its filtered usage history.

GPU movers and background price alerts from the preceding release remain available.

## Concrete example

At an observed $2 per GPU-hour, two assumed eight-GPU machines running six hours daily cost $192/day, $5,760 for 30 days and $1,344 for seven days. This is arithmetic from an observed listing, not a hardware reservation or availability claim.

## Mechanics and limits

- Planner estimates exclude stale listings and assume constant prices. Tax, storage, bandwidth, discounts and future changes are excluded. Provider minimum instance configuration may differ from the entered machine size.
- API calls reserve estimated costs atomically against key, account and platform capacity before contacting the provider. Used costs plus pending reservations count against the lifetime key cap.
- Pausing and lowering a cap do not cancel accepted calls or erase holds. Interrupted requests retain reservations across restarts. Final reported provider costs are recorded even if they exceed an estimate; caps govern admission rather than guaranteeing upstream billing.
- Blank caps use existing account capacity. Zero blocks new calls. Lifetime caps have no monthly reset and do not grant additional credit.
- Existing keys survive an additive SQLite migration. Older requests lack trustworthy key attribution and remain explicitly unattributed. Account history and all existing reservations remain intact.
- Playground and assistant requests remain subject to account/platform controls. No contract or wallet-funding changes are included.

## API

`POST /api/v1/rental-plan`: market, machines, gpus_per_machine, hours_per_day and days.

`POST /api/v1/compute/keys`: name and optional limit_usd.

`PATCH /api/v1/compute/keys/{id}`: limit_usd (null removes dedicated cap) and/or paused.

`GET /api/v1/compute/usage?key_id={id}`: owner-scoped history, including revoked keys.

`GET /api/v1/key`: key usage, holds, cap/pause state and effective remaining account/key room.

## Copy

One [founder tweet](FOUNDER-TWEETS.txt) and one [Silicon tweet](OFFICIAL-TWEETS.txt), covering the new features and preceding monitoring updates. These are drafts for manual posting.

## Validation

Backend tests cover calculation units, stale listing exclusion, input bounds, owner isolation, both API response modes, atomic simultaneous reservations, restart persistence and pending cost settlement. Browser tests cover planner inputs/CSV/mobile width and key cap/pause/usage controls. Release checks include frontend build/lint, backend lint, secret scan and public production health.
