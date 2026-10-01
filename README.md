# Silicon

Silicon compares GPU rental prices and implements capped calls and puts on the
H100 rental reference. The app uses React, TypeScript and Vite, a Python/FastAPI
API, and Solidity contracts on **Robinhood Chain, chain ID 4663**.
USDG settles positions. ETH pays network fees.

Market data, calculators, paper strategies and holder workspace tools are available.
Live trading requires a verified, funded, unpaused series and a fresh executable quote.
SILICON ownership is optional; launching the token does not activate a trading round.

## SILICON token

| Property | Value |
| --- | --- |
| Name | Silicon Markets |
| Symbol | SILICON |
| Network | Robinhood Chain (4663) |
| Decimals | 18 |
| Total supply, verified October 1, 2026 | 1,000,000,000 SILICON |
| Contract address | `0x389860f1f8eaba66d8b2925923a40b739a67e6b0` |
| Explorer | [View the SILICON token](https://robinhoodchain.blockscout.com/token/0x389860f1f8eaba66d8b2925923a40b739a67e6b0) |

This is the SILICON token address. USDG settlement and individual market and vault
contracts use separate addresses. The app checks the connected wallet's onchain
balance of this exact token. Strictly more than 5,000 SILICON unlocks 100 browser
alerts, 50 saved templates, comparisons across 16 GPU models and batch CSV export.
Exactly 5,000 tokens keeps standard access. Holder balances refresh every 30 seconds;
RPC failures do not grant eligibility. Saved alerts and templates remain accessible
after a balance change.

The 1% premium fee is waived only in rounds deployed with this token configured.
The original 100 USDG pilot remains paused and has no fee token; its fee and
withdrawal calendar cannot be changed by updating app configuration. Its
security-patched replacement still requires confirmed opening/expiry dates,
backing and writer-approved call/put premiums. No collateral has been migrated.
Live H100 quotes require all five fixed provider listings; a currently withheld
reference cannot be replaced by an older archived receipt.

## Setup and development

Requirements: Python 3.12+, Node 22+, Foundry (Forge and Anvil).

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cp .env.example .env
chmod 600 .env
npm --prefix frontend ci
```

Set `PRIVY_APP_ID` through your secret manager. The read API does not need the Privy app
secret or a signing key. All frontend values, including `VITE_` variables, are public.

Run these in separate terminals:

```bash
cd backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 4286
```

```bash
npm --prefix frontend run dev
```

Frontend: http://127.0.0.1:5286. API: http://127.0.0.1:4286.
`SILICON_API_PROXY` overrides the frontend's API proxy for isolated review.
API docs: `/api/docs`. OpenAPI: `/api/openapi.json`.

## Tests and build

```bash
cd contracts
forge build
forge test -vv
cd ..
PYTHONPATH=backend .venv/bin/pytest -q backend/tests
.venv/bin/ruff check backend scripts/prepare_series_tx.py
npm --prefix frontend run sync:api
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e
```

Foundry tests execute the real contract, including calls/puts, reserve limits,
fees, stale quotes, settlement challenges, cancellations, claims and withdrawals.
The Python integration test starts an isolated Anvil on loopback with chain ID
4663, deploys compiled bytecode with disposable accounts, and exercises the API
reader and transaction review. Tests never spend the dev wallet's funds.
Set `SILICON_TEST_URL` to test a particular frontend preview.

## Chain and dev wallet

Network: Robinhood Chain mainnet, chain ID `4663`.
Public RPC: `https://rpc.mainnet.chain.robinhood.com/`.
Explorer: `https://robinhoodchain.blockscout.com`.
USDG: `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (six decimals).

The original project dev/deployer wallet is
`0xf7654bf2e3139d059Db1f015897766EA3A2aEfBE`, configured through
`DEV_WALLET_ADDRESS`. The signing key is managed outside the repository.
This public address is not a deployed token or market.
Never install the signing key in the web service or frontend.

`.env.example` documents the variables. `RPC_URL` is server-side and can use an
authenticated provider. The wallet receives the public Robinhood RPC address.
The backend checks the RPC chain ID and USDG identity; arbitrary public-chain
collateral substitutions are rejected. Loopback RPC supports isolated tests.
`TOKEN_ADDRESS`, `MARKET_ADDRESS`, and `MARKET_START_BLOCK` identify the actual
official SILICON benefits token, series, and deployment block. On public RPCs,
`TOKEN_ADDRESS` must match the official address above; loopback test chains may use
disposable tokens. Set `TRADING_ENABLED=true` only for
a reviewed, funded launch. Claims and withdrawals remain available when new
funding/trading is disabled.

## Reference, collateral and settlement

The H100 reference is the median of five fixed on-demand USD full-instance
listings from GPU Economy, normalized per GPU-hour. All five must be confirmed
within three hours. Other GPU models are comparison references and are not
executable. Source data is CC BY 4.0 with visible source links. SQLite stores
observations and canonical keccak256 source receipts. Charts use recorded data;
missing history is not fabricated.

Each `SiliconSeries` contract holds its own USDG collateral. Writers deposit
before opening; their capital is locked during trading. Buyers purchase capped
calls or puts, with index 100 as the strike and a 10 USDG payout cap per unit.
New positions and funding are open to nonholders. An optional Silicon token
provides a fee waiver; it is not a trading or deposit requirement.
The standard fee is 1% of premium. Strictly more than 5,000 SILICON waives
the platform fee in token-enabled rounds. ETH network fees remain separate.

Every purchase reserves the larger of maximum payout and cancellation refund
before its premium enters the contract. Fees stay in the pool. Writers receive
remaining equity after buyer obligations; writer principal is at risk.

A designated publisher reports source observations and proposes the expiry
result. A one-hour challenge period allows the guardian to cancel a disputed
result and refund premiums plus fees. Proposals close two hours before the
24-hour settlement timeout, so every accepted result keeps at least a full
hour to finalize. Missing or unresolved settlement cancels permissionlessly
after 24 hours. The publisher is trusted for offchain data. Claims pay the
recorded buyer and require no continuing Silicon token holding; a buyer may
redirect a payout to another wallet with `claimTo` if their own address cannot
receive USDG.

## Premium vaults and paper strategies

`/terminal/strategies` contains the premium vault, H100 trend builder and
B200/H100 generation spread. The first-visit terminal guide highlights one
area at a time, dims the rest, supports keyboard dismissal and replay, and
respects reduced motion. It stores its completion under `silicon:intro:v3`.

Premium vaults use isolated writer shares in `SiliconSeries`. Deposits close at
opening. After settlement, redemption uses remaining equity after buyer reserves;
the entire principal can be lost. `SiliconPremiumVaultFactory` creates 7, 14 or
30-day `SiliconPremiumVaultRound` contracts with an immutable per-round deposit
ceiling. Scheduling requires at least one day's notice and a two-day gap after
the previous expiry. A pause blocks new round deposits. Depositors explicitly
choose each round; no operator can roll their shares or withdraw for them.

Add reviewed round addresses to `VAULT_ROUND_ADDRESSES` as a JSON array. The API
checks collateral, token, methodology, balances and fee threshold separately for
each round. `/api/v1/vaults` exposes those results. The portfolio endpoint accepts
`?series=ADDRESS`; transaction review accepts `series_address`. Only configured
rounds can receive approvals or deposits. The active `MARKET_ADDRESS` remains
the only trading market. Keep historical rounds configured for redemptions.

The builders are forward paper trading, with no automatic execution. They use
7/14/30-day horizons and user-assumed premiums plus the standard 1% fee, excluding
gas and slippage. Creating a record fixes its server timestamp, expiry, size,
direction and archived entry receipts. Scenario sliders never set entry prices
or recorded outcomes. `/api/v1/strategies` reports actual observation counts,
distinct prices and time span; it does not turn a sparse history into a backtest.

`GET/POST /api/v1/strategies/paper` reads/creates records in the SQLite
`paper_strategies` table. A random HttpOnly, SameSite=Strict cookie identifies the
browser; only its SHA-256 digest is stored alongside records. There is no wallet
identity claim. Clearing browser cookies loses access to that browser's records.
POSTs reject foreign origins. Reverse proxies must preserve the original Host
and HTTPS scheme. Record limits and the API rate limiter bound storage growth.

An optional `thesis` (up to 600 characters) is stored with the immutable entry.
The builder supplies a `request_id`; retries with the same browser, ID and terms
return the original record, including its original prices and expiry. Reusing
an ID with different terms returns 409. The `paper_requests` table is created
additively; existing paper records remain readable without a thesis.

Reading a paper book reconciles expired entries using the first source receipt
in the three hours after expiry. Spread legs must be within 15 minutes; the
earlier feed advances to the first matching pair. Missing data remains pending
until 24 hours after expiry, then cancels with its assumed cost returned and is
excluded from performance. Settled terms and receipts remain fixed. Results are
paper returns with assumed premiums, not proof of available real-market yield.

`SiliconSpreadSeries` implements a separate capped spread. It normalizes B200 and
H100 to their immutable opening prices; one percentage point of B200 return minus
H100 return pays one USDG per call unit, capped at ten. Puts pay the reverse. Both
source prices, times and receipt hashes are required; the inherited single-index
publication methods are disabled. The existing reserve, challenge, refund and
claim rules remain in force. Receipts do not remove trust in the publisher.

The B200 feed is currently a comparison median. Live spread trading stays closed
until a fixed B200 basket and methodology are verified, contracts are reviewed
and deployed, and their funding and execution adapter are activated. New contract
source and local tests are not evidence of a public deployment or an audit.

## API and wallet flow

| Route | Purpose |
| --- | --- |
| `GET /health` | Process health |
| `GET /api/v1/config` | Public chain, USDG, token, market and dev-wallet addresses |
| `GET /api/v1/markets`, `/stream` | Rental observations and network status |
| `GET /api/v1/history/{market}?range=1h` | Recorded history |
| `GET /api/v1/markets/{market}/context` | Market mode, readiness reasons, contracts and source rules |
| `GET /api/v1/methodology`, `/receipts` | Source methodology and receipts |
| `GET /api/v1/receipts/{hash}` | An archived receipt |
| `GET /api/v1/access/{wallet}` | Verified USDG, ETH and Silicon balances |
| `POST /api/v1/quote` | Calculator or funded-series quote |
| `GET /api/v1/protocol` | Contract reserves, state and activity |
| `GET /api/v1/vaults/{address}/accounting` | Verified balances, indexed cash flows and reconciled round result |
| `GET /api/v1/portfolio/{wallet}` | Positions, claims and writer equity |
| `GET /api/v1/leaderboard?period=7d` | Settled performance |
| `POST /api/v1/transactions/review` | Validate and simulate exact EVM calldata |
| `GET /api/v1/transactions/{hash}` | Receipt status after two confirmations |
| `GET /api/v1/transactions/{hash}/replacement/{replacement}` | Check a mined replacement's wallet, nonce and confirmations |

Privy connects EVM wallets, including MetaMask and WalletConnect. The app adds or
switches to Robinhood Chain, rechecks the account, and compares reviewed calldata
with the exact action the user chose. Any required USDG approval is for the
exact amount. Signing and broadcasting happen in the user's wallet. The API
never signs transactions or receives a user's private key. Confirmation polling
keeps tracking the original hash through temporary RPC failures.

After submission, Activity stores the hash and reviewed terms in this browser,
scoped to wallet and chain. Returning to the terminal with that wallet connected
resumes receipt checks; it never signs or rebroadcasts automatically. A wallet
flow lock prevents repeated clicks (and simultaneous tabs when Web Locks are
available). Unresolved submissions block another wallet action. A wallet-cancelled
or sped-up transaction can be resolved using its replacement hash only after
the API verifies the same sender and nonce and two confirmations. If the node
cannot retrieve the original transaction, it cannot prove the replacement and
keeps the action unresolved. Confirmed approvals do not automatically resume a
buy after reload: the user must review a fresh quote. Storage contains no keys.

The source drawer exposes archived observation constituents separately from
current provider quotes. Round accounting sums each configured contract's
indexed deposits, premiums plus fees, buyer payments and provider withdrawals.
It withholds cumulative totals while indexing and final performance until
transfers reconcile with current accounted assets. A finalized provider result
is withdrawals plus remaining available equity minus deposits; unclaimed buyer
liabilities remain reserved. This is an amount for the whole round, not an APY.

The service verifies token/methodology identity and reserve coverage. Source
freshness is rechecked before reviewing a buy. Position and activity indexing
use contract logs with a confirmation delay. A history outage is displayed as
syncing and does not invalidate an independently verified series.

## GPU price movers and background alerts

The terminal's GPU price movers rank absolute percentage changes over 24 hours
from immutable rental receipts. Each comparison ends at that GPU's latest source
observation and uses a baseline at or before 24 hours earlier, with at most two
hours of baseline tolerance. Both receipt hashes, timestamps and matched provider
listing changes are visible. A changed provider/instance/region/scope basket,
stale source or insufficient history withholds the percentage. No interpolation
or synthetic changes are used. Other GPU models remain comparison references.

The bell opens server alerts for price thresholds, exact provider listing price
changes, and H100 benchmark recovery. The API collector and a 30-second monitor
continue when the tab is closed. Price thresholds trigger on the first observed
fresh reference at or beyond the chosen level, including if the condition already
holds when saved. Provider alerts compare the same provider, instance, region and
scope, and can report fresh individual listings while a median is withheld.
Recovery means the H100 feed becomes fresh again; it does not enable trading.
All rules fire once, expire after 90 days, and can be deleted and recreated.
Changes that occur entirely between collection cycles may not be observed.

An anonymous HttpOnly, SameSite=Strict cookie identifies the browser session.
Only its SHA-256 digest is stored. Server rules have a separate 20-rule limit,
with at most 10,000 browser sessions. Rules, checkpoints, triggered events and
push delivery state persist in the existing SQLite database. Events are retained
for 30 days, the inbox displays the latest 100, and inactive sessions are deleted
after 90 days. Clearing browser site data loses access to that inbox. Existing
local browser alerts remain available, retain the 20/100 holder allowances, and
can be explicitly moved to the server. Local alerts run only while Silicon is open.

Optional Web Push requires browser permission and a supported browser. See the
[Web Push overview](https://web.dev/articles/push-notifications-overview) and
[pywebpush documentation](https://github.com/web-push-libs/pywebpush). The worker
`/alerts-sw.js` handles notifications and same-origin terminal navigation only;
it does not cache API responses or wallet data. The push service receives an
encrypted message. Only supported browser push-service HTTPS hosts are accepted.
Failed delivery leaves the event in the inbox; transient failures retry at most
three times and expired subscriptions are removed. Delivery is best effort.
On iPhone/iPad, Web Push requires the installed Home Screen app. The server inbox
works without push permission or wallet connection.

Configure a persistent VAPID identity outside the repository:

```bash
.venv/bin/python scripts/init_alert_push.py --directory /absolute/private/silicon-alerts
```

The command preserves an existing private key and creates an `alerts.env` file
containing the public key and private-key file path. Load it through the API
service's `EnvironmentFile` or export its two settings in local development.
`ALERTS_VAPID_PUBLIC_KEY` is public browser data;
`ALERTS_VAPID_PRIVATE_KEY_PATH` points to a mode-600 server file. Keep that file
outside source control, readable only by the service user, and backed up with the
persistent database. Do not regenerate it on every release. Serve `/alerts-sw.js`
as JavaScript over HTTPS with revalidation; service-worker scope is `/`.
Without this configuration, monitoring/inbox work and the push control states
that browser push is unavailable.

| Route | Purpose |
| --- | --- |
| `GET /api/v1/movers` | Daily recorded changes and receipt evidence |
| `GET /api/v1/alerts` | Establish session and read rules/inbox/push availability |
| `POST /api/v1/alerts` | Create a single-use background rule |
| `DELETE /api/v1/alerts/{id}` | Delete this session's rule and events |
| `POST /api/v1/alerts/read` | Mark this session's inbox read |
| `POST /api/v1/alerts/push` | Save this browser's opt-in subscription |
| `DELETE /api/v1/alerts/push/subscription` | Disable push while preserving rules |

Alert mutations require an existing session, reject cross-site origins, and use
bounded request bodies and IP rate limits. The reverse proxy must preserve Host
and HTTPS scheme, and the API should use one worker with the current SQLite setup.

Validation: `PYTHONPATH=backend .venv/bin/pytest -q backend/tests/test_monitoring.py`
and `npm --prefix frontend run test:e2e -- monitoring.spec.ts` cover receipt
comparisons, session isolation, restart persistence, stale sources, one-shot
alerts, delivery failures, migration and desktop/mobile behavior. Mock push
transport in tests; do not notify real subscribers during release verification.

## Publisher operations

Prepare unsigned transactions from archived source receipts:

```bash
.venv/bin/python scripts/prepare_series_tx.py --mode quote --contract "$SILICON_SERIES" --call-premium 2 --put-premium 2
.venv/bin/python scripts/prepare_series_tx.py --mode propose --contract "$SILICON_SERIES"
.venv/bin/python scripts/prepare_series_tx.py --mode finalize --contract "$SILICON_SERIES"
```

Premiums above are examples. The script verifies Robinhood Chain, requires the
current complete benchmark for quote publication, selects its matching archived
receipt, simulates from the contract's publisher, and prints unsigned
calldata with an estimated gas limit. It does not sign or broadcast. Deployment,
funding, quote publication and settlement are separate operator transactions.

## Compute workspace

`/compute` provides text model chat, a market assistant, paper-strategy drafts,
private API keys and usage history. The terminal embeds the same market assistant.
Drafts pre-fill editable paper inputs; recording still requires the user's existing
action. Model-generated payout estimates are discarded and the paper builder
calculates outcomes and fees. The assistant cannot trade, provision GPUs or run
server commands.

Development loads ignored `.env.compute` after `.env`. Set `OPENROUTER_API_KEY`
through a secret manager and keep this file permission-restricted. No provider
keys, balances, funding amounts or pilot allocations belong in public configuration
or copy. Set `COMPUTE_ORIGIN` to the exact frontend origin, HTTPS in production.
Compute defaults to disabled and requires a positive private spend limit.

`COMPUTE_GRANT_USD` assigns one allowance per admitted wallet.
`COMPUTE_GRANT_POOL_USD` bounds all admission allocations and must fit inside
`COMPUTE_SPEND_LIMIT_USD`. `COMPUTE_MAX_ACCOUNTS` caps enrollment. Access defaults
to `COMPUTE_ALLOWED_WALLETS`, a JSON address array; `COMPUTE_OPEN_ENROLLMENT`
permits bounded public admission when enabled. A wallet is not a unique person.
Signing in or creating more keys never replenishes an account. Changing the grant
configuration does not retroactively credit accounts that already exist.

Sign-in consumes a five-minute wallet-message nonce and creates a twelve-hour
HttpOnly, SameSite=Strict cookie. Browser mutations check Origin. API keys are
shown once, stored as hashes and revocable. All keys for a wallet share its ledger.
Conversations stay in browser memory; SQLite stores request metadata, without
prompt or answer text. Prompts reach OpenRouter and the selected model provider,
with data-collection opt-out and price ceilings. Provider retention policies apply.

The persistent SQLite ledger atomically reserves a conservative maximum before
each request. Upstream usage settles the reservation. Disconnected requests retain
their holds while the reconciler checks known generation IDs. Requests without
an ID require operator review against provider billing. Do not delete the ledger
or release unknown holds to reset a budget. Back up the database before releases.
Compute does not change onchain fee distribution or activate a trading-fee subsidy.

Browser endpoints use `/api/v1/compute`: `/models`, `/auth/challenge`,
`/auth/verify`, `/auth/logout`, `/account`, `/chat`, `/keys`, `/keys/{id}` and
`/usage`. Compatible clients use Bearer-authenticated `/api/v1/models`,
`/api/v1/chat/completions` and `/api/v1/key`. Text chat, SSE and client-executed
function tools are supported. Images, audio, Responses API, provider plugins and
arbitrary models are not accepted. Extended reasoning is disabled on the selected
models so the bounded completion allowance produces visible answers. A repeated
`Idempotency-Key` returns 409 without another upstream request. `/api/docs`
documents request limits and schemas.

Run `PYTHONPATH=backend .venv/bin/pytest backend/tests/test_compute.py` for mocked
authentication, accounting and failure checks. With the backend and frontend
running, `npm --prefix frontend run test:e2e -- compute.spec.ts` checks browser
flows using mocked model responses. These tests do not spend provider credit.

## Design and asset provenance

Landing typography is self-hosted Inter Variable at 400/500, with Space Grotesk
retained on the Silicon wordmark. Their OFL licenses ship at `/licenses/inter.txt`
and `/licenses/space-grotesk.txt`. Sophon's Suisse Intl face is represented by the
open-source Inter alternative. The terminal retains IBM Plex Mono and its license
at `/licenses/ibm-plex-mono.txt`. References informed spacing and visual language;
their source code and financial data were not cloned.

Original editorial GPU imagery was generated through the explicitly requested
Google Gemini API, model `gemini-3-pro-image`. Full prompt and generation code:
`scripts/generate_hardware.py`. Saved originals:
`frontend/public/assets/gpu-editorial.jpg` and optimized
`frontend/public/assets/gpu-editorial.webp`. The prompt specifies an isometric,
photorealistic graphite SXM module with detailed solder, muted purple/gold lighting,
and no text or branding. These are illustrations, not verified hardware CAD.

The landing keeps the approved Dreamlike composition. The current logo is L02,
the glass wafer bloom selected for [@SiliconGPU](https://x.com/SiliconGPU).
`frontend/public/silicon.svg` clips the original generated artwork into its
three-petal silhouette and embeds the image; it is not a newly generated mark or
a pure vector redraw. The same versioned `?v=5` asset is used by the navbar,
footer, docs, favicon, error view and Privy appearance. The H06 cover selected on
X supplies the site's social preview under `/assets/identity/silicon-x-cover.jpg`.

The `/#ambf` founder section uses the supplied checkerboard reference and the
public [AMBF](https://x.com/AMBF) avatar. `FounderWorld.tsx` renders instanced 3D
tiles with a procedural water surface and seamless forward movement; the supplied
image provides the cloud band and the static fallback. It shares the landing's
animation clock, pauses outside the viewport or when the document is hidden, and
respects both the motion control and reduced-motion preferences. Founder links
point to the supplied X and [GitHub](https://github.com/juicevz) profiles.

Light mode uses lavender, pearl and chrome; dark mode keeps the same layout with
Industrial's graphite and copper palette. `dreamlike.css` scopes these styles to
the landing and its menu. The existing terminal layout and market controls remain.
Landing prose uses self-hosted Inter Variable with regular weights and lowercase
copy, informed by Sophon's typography and reading rhythm. The Silicon wordmark
keeps Space Grotesk; terminal data keeps IBM Plex Mono. Font licenses are included
under `frontend/public/licenses/`. `landingStory.ts` handles staggered entrances
and the mechanics section's scroll progress on the shared animation clock.
Pause also disables scroll inertia and reveals all content immediately;
keyboard focus and reduced motion keep every section accessible.
The Gemini-generated Dreamlike and Industrial environments and their object
fallback renders are self-hosted as WebP files in `public/assets/silicon/`.

`SiliconScene.tsx`, `siliconSceneRuntime.ts` and `siliconObjects.ts` render the wafer,
crystal, ring, die and chrome beads, with a separate GPU exhibit. Five vertical
rows select H100, H200, B200, A100 or L40S; the terminal retains all 16 models.
`catalogHardwareModels.ts` and `hardwareModels.ts` supply the same product-form
GPU illustrations used by the catalogue. These are illustrations, not manufacturer
CAD or changes to the rental benchmarks. The existing source-backed rental
average remains in the exhibit caption, with the model name and a readable rate.

GPU switches warm and cache meshes, then fade the canvas without rebuilding its
WebGL context. Software-only WebGL and unavailable contexts use local rendered
images with compositor movement. `landingMotion.ts` advances Lenis and both scenes
in one frame loop. Critical damping is independent of refresh rate, the objects'
movement range is multiplied by 1.10, and their ambient clock by 1.05. Offscreen
scenes stop drawing. Pause freezes the pose; reduced motion removes ambient,
pointer and transition movement. Each fresh page load starts in light mode before
first paint. The theme toggle switches palettes for the current visit, without
restoring an earlier saved dark preference. Material buttons use damped pointer reflections.
`Gpu.tsx` uses lightweight transparent renders of the same hardware in searchable market rows.
The 16-model catalogue spans Hopper, Blackwell, Ada, Ampere and Turing.
`RentalChart.tsx` provides timestamp-scaled history, keyboard and pointer scrubbing,
price axes, observed bounds and current eligible provider comparisons.
A comparison with insufficient provider coverage shows its listings without
publishing an unsupported median. All additions remain monitoring references. Terminal inputs and
scenario values update directly from input events.

`frontend/src/preview.ts` calculates illustrative payouts locally. Remote quotes
remain independent and input-keyed, and are still required before execution.
The contracts directory lists all three assets, actual series and platform
addresses; undeployed assets retain explicit status. Browser checks include a
1500ms delayed-API test proving slider values update on the next animation frame,
chart pointer/keyboard scrubbing, menu focus, tutorial persistence and mobile routes.
The editorial image remains the terminal WebGL fallback. NVIDIA's mark comes from the
Simple Icons project and is used only to identify the manufacturer. No affiliation
with NVIDIA, cloud providers or GPU Economy is claimed.

## Open access and optional benefits

Series with `ACCESS_POLICY=2` allow nonholder purchases and funding. A zero token
address launches a standard-fee round; its fee-token choice is immutable. A
configured token waives the 1% premium fee strictly above 5,000 tokens. Failed
balance reads fall back to the standard fee, bounded by the signed maximum cost.
Readers reject legacy access policies rather than advertise their gates as open.

`GET /api/v1/benefits/{address}` separates verified collateral balances from
optional benefit verification. Recorded savings use indexed purchase events from
configured rounds, exclude cancelled rounds, and remain unavailable until history
is verified and synced. Claims and withdrawals remain independent of holdings.

The existing terminal navigation is preserved. Benefits opens beside the wallet.
Core calculators and paper recording are public. Browser workspace allowances are
20 alerts / 10 strategy templates / 2 comparison models, or 100 / 50 / 16 for
verified balances above the waiver threshold, with CSV batch exports. Existing
items survive eligibility changes. Browser workspace limits are convenience
entitlements, not server authorization or financial permissions.

### Rental planner and API key controls

See the [release notes](docs/updates/2026-10-01-cost-planner-key-controls/README.md) for planner inputs, estimate assumptions, per-key lifetime caps, atomic reservations, pause/resume and usage attribution. Public routes: `/terminal/planner` and `/compute?view=api`. No additional service or credentials are required.


## Synced holder workspaces and recurring alerts

Open `/terminal?workspaces=1` or `/terminal?holderAlerts=1`. This release adds
five wallet-linked workspaces and 100 advanced server rules for verified balances
**strictly greater than 5,000 SILICON** on chain 4663. Public data, basic server
alerts and the existing paper tools retain their current access.

A gas-free wallet message establishes a separate 12-hour HttpOnly, Secure,
SameSite Strict holder cookie. It does not create a Compute grant or authorize
transactions. Challenges bind domain, URI, chain, random nonce, five-minute
expiry and browser cookie. Signatures are verified and nonces consumed once;
only hashes of session tokens are stored. Private requests must include
`X-Silicon-Wallet` matching the authenticated owner. Writes require
`Origin=COMPUTE_ORIGIN`; this existing setting must match the site's origin.
No new key or environment variable is needed. This EOA message flow follows
Silicon's existing wallet sign-in; contract-wallet signature verification is not
implemented.

Workspace snapshots contain a name, selected GPU, 1h/6h/24h range, search,
watchlist, notes (10,000 characters) and at most 50 validated templates. Save is
explicit. Updates and deletes require the version last read. A conflicting save
returns 409 and retains the client draft. Loading merges templates without opening
paper or live positions, and refuses a merge above 50. Data is stored in shared
SQLite, not onchain or end-to-end encrypted. Authenticated owners retain read
and delete access after losing eligibility. New saves and advanced rule creation
recheck holdings on the backend; UI gating alone never grants access.

Advanced rules AND together up to three price, 24-hour percentage-change or
complete/fresh H100 benchmark conditions. Relative changes reuse immutable
matched-provider receipts from GPU movers: the baseline is at least 24 hours
old relative to the latest source, with two hours of tolerance. Unsupported
history, stale/future data and changed baskets withhold the percentage. A first
match can trigger immediately. A recurring rule needs an observed non-match to
rearm, then must match after its chosen 5/15/30/60/240/1440-minute cooldown.
Unknown price data cannot rearm it. Benchmark availability is a boolean condition.
Rules expire after 90 days; one-shot rules complete after the first match.

The monitor runs every 30 seconds after each evaluation, checks eligible owners
with bounded RPC concurrency and at most a 60-second eligibility cache, and
pauses on failed verification. Collection cadence bounds what can be observed.
Rule states and last triggers survive restarts. Wallet inboxes use a distinct
owner namespace from anonymous alerts; the latest 100 events are visible for
30 days. The existing Web Push sender handles opt-in delivery with three attempts.
Only the holder monitor can deliver holder events, after eligibility verification.
One browser push destination is retained per wallet; enabling another replaces
it. In the UI, opting into holder push transfers this browser's basic-alert push
subscription. Events stay in both inboxes. Sign-out revokes the session, not the
explicit background subscription. Disable notifications on shared devices.

Tables `holder_challenges`, `holder_sessions`, `holder_workspaces` and
`holder_rules` are created additively at startup in the existing shared database.
No contract, token threshold, environment secret or VAPID key is replaced.
Back up shared SQLite before a release; roll back with the prior immutable
release symlink. Existing versions ignore these new tables. Private writes have
a 96 KB body cap and the holder route group has a 90-request/minute per-IP limit.
Auth challenges also have a separate five-per-minute IP/wallet limit.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/holders/auth/challenge` | Request a browser-bound wallet message |
| `POST /api/v1/holders/auth/verify` | Verify the signature and create a session |
| `POST /api/v1/holders/auth/logout` | Revoke the current holder session |
| `GET /api/v1/holders/account` | Authenticated owner and current eligibility |
| `GET /api/v1/holders/workspaces` | Read this wallet's saved snapshots |
| `POST /api/v1/holders/workspaces` | Create a workspace at revision zero |
| `PUT /api/v1/holders/workspaces/{id}` | Save using the last-read revision |
| `DELETE /api/v1/holders/workspaces/{id}?revision=N` | Delete a known version |
| `GET /api/v1/holders/alerts` | Wallet rules, events and push availability |
| `POST /api/v1/holders/alerts` | Create a conditional server rule |
| `DELETE /api/v1/holders/alerts/{id}` | Delete this wallet's rule and its events |
| `POST /api/v1/holders/alerts/read` | Mark this wallet's events read |
| `POST /api/v1/holders/alerts/push` | Opt into one browser push destination |
| `DELETE /api/v1/holders/alerts/push/subscription` | Disable holder push |

`backend/tests/test_holders.py` covers signed session ownership, replay/binding,
expiry, cross-device concurrency, strict write gates, durable storage, limits,
recurrence, missing data and notification retries. Browser coverage is in
`frontend/tests/holder-workspaces.spec.ts`; wallet/provider fixtures are used
without signing transactions or spending Compute credit.

Release details and post-ready copy: [holder workspace update](docs/updates/2026-10-01-holder-workspaces/README.md).
