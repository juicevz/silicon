# Silicon

GPU rental-price terminal with an isolated, fully collateralized H100 options series.

## Current scope

- Working landing page, original hardware imagery and cursor-responsive Three.js
  H100/A100/B200 illustrations. Square, compact desktop and mobile terminal.
- Privy wallet picker with detected Ethereum wallets, including Rabby when installed.
  The browser receives only the public app ID. No embedded wallet is created.
- Live source collection, immutable observation receipts, SQLite history, streamed
  updates, provider filtering, asset detail panels and browser-local price alerts.
- Call/put payout calculator. H100 is the first defined tradable benchmark; A100
  and B200 are monitoring references. History is never seeded with fabricated ticks.
- Holder check: any positive balance for new trades and advanced tools. The standard
  platform fee is 1% of premium; strictly more than 5,000 tokens makes it zero.
  Existing claims and writer withdrawals never require retaining the token.
- Solidity funding, quote, buy, settlement, challenge/cancellation, claim and writer
  withdrawal paths; typed API reader, event indexing, positions and leaderboard.
- The token and series addresses are intentionally unset. No contract deployment,
  reserve deposit, publisher signature or treasury transaction has been made.
  The planned 300 USDG reserve is not displayed as funded collateral.

## Architecture and data flow

`frontend/` uses React, strict TypeScript and Vite. `backend/app/` uses FastAPI and
typed response models. REST response types are generated from `/api/openapi.json`.
SQLite lives in a persistent directory outside the release. One service runs the
collector, network monitor and contract reader; no extra queue or cache is needed.

The collector checks GPU Economy every 180 seconds. Upstream observations are
usually hourly. H100 uses five exact, fixed USD on-demand full-instance listings:
Lambda, Hyperstack, Verda, Crusoe and Nebius. All five must be confirmed within
three hours. The median has equal provider weights. Changed listing identities,
stale quotes and missing constituents withhold a new benchmark. The UI retains
the last observation with its actual source timestamp. GPU-only, spot, reserved,
non-USD and marketplace-floor prices do not enter this reference.

A100/B200 compare each eligible provider's cheapest region. These are different
baskets and configurations; a price ratio does not imply interchangeable compute.

Each observation stores a canonical JSON receipt and its keccak256 hash. Repeated
collection cannot change the same timestamp's price. A source refresh is distinct
from a price change. Charts contain stored source observations; requested 1h/6h/24h
changes remain unavailable until sufficient history exists.

The server polls the chain every 15 seconds. The browser receives snapshots over
SSE. A configured contract is checked against the expected USDG, token, methodology,
fee threshold and actual USDG balance. Its log indexer waits 16 blocks and resumes
from a persistent cursor. Wallet transactions are simulated, network/account
checked, signed by the user and confirmed before success appears. Trade approvals
are exact amounts. The web service never holds a transaction signer.

## Local setup

Use Python 3.12+, Node 22+ and Foundry for contract tests.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cp .env.example .env
chmod 600 .env
cd frontend
npm ci
```

Populate `PRIVY_APP_ID` through a private secret store. The saved Privy secret is not necessary
for the public read API or externally signed wallet transactions. Do not put the
deployer key into the web service. `.env` is ignored by Git.

Start each process in a separate terminal:

```bash
cd backend
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 4286
```

```bash
cd frontend
npm run dev
```

Frontend: http://127.0.0.1:5286. Backend: http://127.0.0.1:4286.
The Vite proxy forwards `/api` and `/health`. The public app can be explored without
a wallet. `Access terminal` opens Privy; `Explore markets` opens the public view.

## Checks and builds

```bash
cd contracts
git clone --depth 1 --branch v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts.git lib/openzeppelin-contracts
git clone --depth 1 --branch v1.10.0 https://github.com/foundry-rs/forge-std.git lib/forge-std
forge test
```

Dependency commits: OpenZeppelin `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0`;
forge-std `8bbcf6e3f8f62f419e5429a0bd89331c85c37824`.

```bash
cd backend
PYTHONPATH=. ../.venv/bin/pytest -q tests
../.venv/bin/ruff check .
```

The integration test starts its own loopback-only Anvil process, deploys the actual
compiled bytecode and exercises funding, fee exemption, quote reading, portfolio,
settlement, rankings and claims after token disposal. It does not transact on the
public network. It skips if Foundry or compiled artifacts are unavailable.

```bash
cd frontend
npm run sync:api
npm run lint
npm run build
npm run test:e2e
SILICON_TEST_URL=https://siliconmarkets.io npm run test:e2e
```

Browser tests cover the landing, GPU switching, wallet picker, provider filters,
source dialogs, sizing, calls/puts, alert persistence, all routes and mobile overflow.
Playwright screenshots/traces are local ignored artifacts. The Privy SDK loads only
when a wallet is requested; market browsing does not load that bundle.

## API

Interactive contract: `/api/docs`. Schema: `/api/openapi.json`.

| Route | Purpose |
| --- | --- |
| `GET /health` | Process readiness |
| `GET /api/v1/config` | Public wallet/chain/contract configuration |
| `GET /api/v1/markets` | Quotes, history, source freshness and RPC state |
| `GET /api/v1/stream` | Live snapshots, every 15 seconds |
| `GET /api/v1/history/{market}?range=1h` | Stored 1h/6h/24h observations |
| `GET /api/v1/methodology` | Basket, exclusions and settlement policy |
| `GET /api/v1/receipts?market=h100-sxm` | Archived observation receipt hashes |
| `GET /api/v1/receipts/{hash}` | Exact canonical receipt content |
| `GET /api/v1/access/{wallet}` | Onchain token, USDG and ETH balances |
| `POST /api/v1/quote` | Explicitly indicative calculator or verified executable quote |
| `GET /api/v1/protocol` | Verified series state and indexed activity |
| `GET /api/v1/portfolio/{wallet}` | Positions, claims and writer equity |
| `GET /api/v1/leaderboard?period=7d` | Realized settled results over 24h/7d/30d |

Read APIs do not need private authentication. Financial authorization is enforced
by the contract. Access and quote requests are rate-limited. Secret values are never
returned. Malformed addresses and nonfinite/unbounded inputs are rejected. Failed
verification yields an indicative calculator, never an executable quote.

## Contracts and launch configuration

`contracts/src/SiliconSeries.sol` is one isolated expiry, not a perpetual or an NFT.
Premiums are paid in USDG. The strike is index 100 and the payout is 1 USDG per
index point per unit, capped at 10. Units have six decimals. The starting rental
price is recorded with eight decimals. Quotes can change; the contract checks the
buyer's maximum cost and a deadline. Quotes last at most 15 minutes and trading
closes five minutes before expiry.

Writers fund before `openAt`. Deposits/withdrawals close while trading is open.
Every fill needs its entire maximum liability already available before collecting
the new premium. Premiums and platform fees remain in the series. Final writer
equity excludes unclaimed buyer payouts. Direct token donations are not counted
as writer deposits. There is no admin function to withdraw the escrow.

The designated publisher is trusted to report the real benchmark and set premiums.
The contract cannot verify web data. Settlement uses the first archived eligible
observation at or after expiry, within three hours. A one-hour challenge window
allows the designated guardian to cancel a disputed result; cancellation refunds
premiums and fees. Missing/unfinalized settlement cancels permissionlessly after
24 hours. These trust and loss risks are explained in the product documentation.

Before enabling a real series, record the actual token address, publisher and
guardian roles, base-price receipt, opening time, expiry and the funding transaction.
Review the contract independently. Set `TOKEN_ADDRESS`, `MARKET_ADDRESS` and
`MARKET_START_BLOCK` in `/etc/silicon/app.env`, then restart `silicon-api`. A usable
quote also needs fresh market data, a positive holder balance and sufficient reserve.
No address is guessed from another project. Only H100 is connected to execution.

Prepare an unsigned, simulated publisher transaction from archived data:

```bash
.venv/bin/python scripts/prepare_series_tx.py --mode quote --contract "$SILICON_SERIES" --call-premium 2 --put-premium 2
.venv/bin/python scripts/prepare_series_tx.py --mode propose --contract "$SILICON_SERIES"
.venv/bin/python scripts/prepare_series_tx.py --mode finalize --contract "$SILICON_SERIES"
```

The premiums above are examples, not an automated pricing model. The script emits
reviewable calldata and gas estimates. It never loads a private key, signs or
broadcasts. The publisher/settlement sender must be activated separately for launch.

## Deployment and operation

`scripts/deploy.sh` uploads a built frontend and backend to an immutable release on
`deploy-server`, installs dependencies in a shared venv, switches `current`, restarts
the API and verifies health. A failed health check restores the prior release.
Persistent data is `<deploy-root>/shared/data/silicon.sqlite`.
Credentials are installed by a private secret store at `/etc/silicon/app.env`, mode 0600.

```bash
bash scripts/deploy.sh
ssh deploy-server 'systemctl status silicon-api --no-pager'
ssh deploy-server 'journalctl -u silicon-api -n 40 --no-pager'
curl -fsS https://siliconmarkets.io/health
curl -fsS https://siliconmarkets.io/api/v1/markets
```

Nginx serves static files and proxies the API/SSE to loopback port 4286. The service
runs as `ubuntu`, restarts on failure and writes only to its shared data directory.
Certbot handles certificate renewal. The final hostname must be added to nginx and
Privy's allowed origins, followed by a certificate and public wallet-flow check.

Source staleness and RPC failures are visible in the terminal. A healthy `/health`
response confirms the process, not source freshness or funded trading readiness.
Back up the SQLite database with SQLite's online backup API before migrations.
Do not copy a live WAL database using plain file copying.

## Design and asset provenance

Typography is self-hosted Manrope and IBM Plex Mono. Design rules are documented locally. References informed spacing and visual language;
their source code and financial data were not cloned.

Original editorial GPU imagery was generated through the explicitly requested
Google Gemini API, model `gemini-3-pro-image`. Full prompt and generation code:
`scripts/generate_hardware.py`. Saved originals:
`frontend/public/assets/gpu-editorial.jpg` and optimized
`frontend/public/assets/gpu-editorial.webp`. The prompt specifies an isometric,
photorealistic graphite SXM module with detailed solder, muted purple/gold lighting,
and no text or branding. These are illustrations, not verified hardware CAD.

`frontend/src/components/Gpu.tsx` contains original cursor-responsive procedural
models. They stop rendering when still/offscreen and respect reduced-motion settings.
The editorial image is the WebGL fallback. NVIDIA's actual mark comes from the
Simple Icons project and is used only to identify the manufacturer. No affiliation
with NVIDIA, Robinhood, cloud providers or GPU Economy is claimed.
