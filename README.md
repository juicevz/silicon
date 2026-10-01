# Silicon

Silicon compares GPU rental prices and implements capped calls and puts on the
H100 rental reference. The app uses React, TypeScript and Vite, a Python/FastAPI
API, and Solidity contracts on **Robinhood Chain, chain ID 4663**.
USDG settles positions. ETH pays network fees.

Market data and calculators are available before launch. Trading remains disabled
until a funded series is configured and verified onchain. The Silicon token is optional.

## SILICON token

| Property | Value |
| --- | --- |
| Name | Silicon Markets |
| Symbol | SILICON |
| Network | Robinhood Chain (4663) |
| Contract address | `0x389860f1f8eaba66d8b2925923a40b739a67e6b0` |
| Explorer | [View the SILICON token](https://robinhoodchain.blockscout.com/token/0x389860f1f8eaba66d8b2925923a40b739a67e6b0) |

This is the SILICON token address. USDG settlement and individual market and vault
contracts use separate addresses. Holder benefits depend on each round's configured
token.

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
optional Silicon benefits token, series, and deployment block. Set `TRADING_ENABLED=true` only for
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
The standard fee is 1% of premium. Strictly more than 5,000 Silicon tokens waives
the platform fee. ETH network fees remain separate.

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

## Publisher operations

Prepare unsigned transactions from archived source receipts:

```bash
.venv/bin/python scripts/prepare_series_tx.py --mode quote --contract "$SILICON_SERIES" --call-premium 2 --put-premium 2
.venv/bin/python scripts/prepare_series_tx.py --mode propose --contract "$SILICON_SERIES"
.venv/bin/python scripts/prepare_series_tx.py --mode finalize --contract "$SILICON_SERIES"
```

Premiums above are examples. The script verifies Robinhood Chain, selects an
eligible receipt, simulates from the contract's publisher, and prints unsigned
calldata with an estimated gas limit. It does not sign or broadcast. Deployment,
funding, quote publication and settlement are separate operator transactions.

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
