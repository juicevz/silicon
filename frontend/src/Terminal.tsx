import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCode2,
  Layers3,
  LockKeyhole,
  Radio,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useData } from "./data";
import { useWallet } from "./wallet";
import {
  api,
  money,
  short,
  type Access,
  type Leaderboard as LeaderData,
  type Market,
} from "./api";
import { Header } from "./components/Header";
import { Dot, Empty, External, Modal } from "./components/ui";
import {
  AssetCards,
  AssetDetail,
  Benchmark,
  ProviderTable,
} from "./components/MarketViews";
import Ticket from "./components/Ticket";
import StrategyTool from "./components/StrategyTool";
import { LiveContract, PositionRows, usePortfolio } from "./components/Live";

type PriceAlert = {
  id: string;
  market: string;
  price: number;
  direction: "above" | "below";
  triggered: boolean;
};
function readAlerts(): PriceAlert[] {
  try {
    const data: unknown = JSON.parse(
      localStorage.getItem("silicon:alerts") ?? "[]",
    );
    return Array.isArray(data)
      ? data
          .filter(
            (a) =>
              typeof a === "object" &&
              a !== null &&
              typeof a.price === "number" &&
              ["above", "below"].includes(a.direction),
          )
          .slice(0, 20)
      : [];
  } catch {
    return [];
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage can be disabled by the browser. */
  }
}

function Tutorial({ close }: { close: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: "A new way to follow compute.",
      body: "These cards track what providers charge to rent a GPU. Select one to inspect its rates.",
    },
    {
      title: "Choose a view. Know the risk.",
      body: "Rise is a call. Fall is a put. The ticket shows your premium, maximum loss and capped payout.",
    },
    {
      title: "Your token opens the market.",
      body: "Any holding unlocks trades. Above 5,000 tokens, platform trading fees are zero.",
    },
  ];
  return (
    <aside className="tutorial" aria-label="Terminal introduction">
      <div className="tutorial-top">
        <span className="eyebrow">WELCOME TO SILICON</span>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Dismiss introduction"
        >
          <X size={13} />
        </button>
      </div>
      <h3>{steps[step].title}</h3>
      <p>{steps[step].body}</p>
      <div className="tutorial-bottom">
        <div className="tutorial-dots">
          {steps.map((_, i) => (
            <button
              key={i}
              className={step === i ? "active" : ""}
              onClick={() => setStep(i)}
              aria-label={`Introduction step ${i + 1}`}
            />
          ))}
        </div>
        <button
          className="text-button"
          onClick={() => (step === 2 ? close() : setStep(step + 1))}
        >
          {step === 2 ? "Got it" : "Next"}
          <ArrowRight size={12} />
        </button>
      </div>
    </aside>
  );
}

function Contracts({
  open,
  notify,
}: {
  open: (m: Market) => void;
  notify: (s: string) => void;
}) {
  const { snapshot, protocol, config } = useData();
  const market = snapshot?.markets[0];
  if (protocol?.contracts?.length)
    return (
      <div className="full-page">
        <div className="page-intro">
          <span className="eyebrow">THE ONCHAIN LEDGER</span>
          <h1>Contracts</h1>
          <p>Funded series, reserved payouts and your writer capital.</p>
        </div>
        {protocol.contracts.map((series) => (
          <LiveContract key={series.address} series={series} notify={notify} />
        ))}
      </div>
    );
  return (
    <div className="full-page">
      <div className="page-intro">
        <span className="eyebrow">THE ONCHAIN LEDGER</span>
        <h1>Contracts</h1>
        <p>Every series, its collateral and its settlement, in one place.</p>
      </div>
      <div className="protocol-stats">
        <div>
          <span>Verified collateral</span>
          <strong className="mono">
            {money(protocol?.funded ?? 0)}
            <small> USDG</small>
          </strong>
        </div>
        <div>
          <span>Committed to payouts</span>
          <strong className="mono">
            {money(protocol?.reserved ?? 0)}
            <small> USDG</small>
          </strong>
        </div>
        <div>
          <span>Available capacity</span>
          <strong className="mono">
            {money(protocol?.available ?? 0)}
            <small> USDG</small>
          </strong>
        </div>
        <div>
          <span>Contract status</span>
          <strong className="gold compact-value">
            {protocol?.verified ? "Verified" : "Preparing first series"}
          </strong>
        </div>
      </div>
      <div className="contract-grid">
        <section className="panel contract-plan">
          <div className="panel-heading">
            <h2>H100 rental reference</h2>
            <span className="mini-label gold">PREPARING</span>
          </div>
          <div className="contract-plan-body">
            <span className="contract-icon">
              <FileCode2 size={30} />
            </span>
            <div>
              <h3>The first Silicon market.</h3>
              <p>
                Capped calls and puts on the five-provider H100 reference.
                Address, expiry and premiums will appear here when a funded
                series is deployed.
              </p>
            </div>
          </div>
          <div className="contract-facts">
            <div>
              <span>Underlying</span>
              <strong>H100 SXM · 80 GB</strong>
            </div>
            <div>
              <span>Settlement currency</span>
              <strong>USDG</strong>
            </div>
            <div>
              <span>Payout coverage</span>
              <strong>100% of maximum liability</strong>
            </div>
            <div>
              <span>Current funding</span>
              <strong>Awaiting deposit</strong>
            </div>
          </div>
          <div className="contract-actions">
            <button className="button" disabled>
              <LockKeyhole size={13} />
              Funding opens with deployment
            </button>
            {market && (
              <button className="text-button" onClick={() => open(market)}>
                Inspect benchmark
                <ArrowUpRight size={13} />
              </button>
            )}
          </div>
        </section>
        <section className="panel writer-panel">
          <ShieldCheck size={23} />
          <h3>Provide the collateral.</h3>
          <p>
            Writers deposit USDG before a series opens and collect premiums.
            Payouts come from that pool, so writer capital can be lost.
          </p>
          <ul>
            <li>Terms are fixed before funds are locked.</li>
            <li>New positions reserve their maximum payout.</li>
            <li>Capital returns after claims are accounted for.</li>
          </ul>
          <Link className="text-button" to="/docs#collateral">
            Read the writer mechanics
            <ArrowUpRight size={12} />
          </Link>
        </section>
      </div>
      <div className="contract-source">
        <Dot state="gold" />
        <span>
          {config.market_address
            ? `Configured contract: ${config.market_address}`
            : "No deployed market is being presented as funded."}
        </span>
      </div>
    </div>
  );
}

function ActivityView({ compact = false }: { compact?: boolean }) {
  const { protocol, config } = useData();
  if (protocol?.activity.length)
    return (
      <section className={`panel activity-panel ${compact ? "compact" : ""}`}>
        <div className="panel-heading">
          <h2>
            <Activity size={14} />
            Market activity
          </h2>
          <span className="eyebrow">ONCHAIN</span>
        </div>
        <div className="activity-rows">
          {protocol.activity.slice(0, compact ? 4 : 50).map((event) => (
            <div key={`${event.tx}-${event.log_index}`}>
              <Link to="/terminal/contracts">
                <span>{event.wallet ? short(event.wallet) : "Series"}</span>
                <small>
                  {event.kind}
                  {event.position_id != null ? ` · #${event.position_id}` : ""}
                </small>
              </Link>
              <span className="mono">
                {event.amount != null ? `${money(event.amount)} USDG` : "—"}
              </span>
              <External href={`${config.explorer_url}/tx/${event.tx}`}>
                Tx
              </External>
            </div>
          ))}
        </div>
      </section>
    );
  return (
    <section className={`panel activity-panel ${compact ? "compact" : ""}`}>
      <div className="panel-heading">
        <h2>
          <Activity size={14} />
          Market activity
        </h2>
        <span className="eyebrow">ONCHAIN</span>
      </div>
      <div className="activity-columns mono">
        <span>WALLET / ACTION</span>
        <span>CONTRACT</span>
        <span>USDG</span>
      </div>
      <Empty
        icon={<Radio size={19} />}
        title="The first trade starts the feed."
      >
        Filled positions, collateral deposits and settlements will link directly
        to their transactions.
      </Empty>
    </section>
  );
}

function Positions({ notify }: { notify: (s: string) => void }) {
  const wallet = useWallet();
  const { portfolio, error } = usePortfolio();
  if (error)
    return (
      <section className="panel positions-panel">
        <div className="panel-heading">
          <h2>My positions</h2>
        </div>
        <p className="inline-index-note">{error}</p>
      </section>
    );
  if (portfolio?.positions.length)
    return (
      <section className="panel positions-panel">
        <div className="panel-heading">
          <h2>
            My positions{" "}
            <span className="count mono">{portfolio.positions.length}</span>
          </h2>
        </div>
        <PositionRows portfolio={portfolio} notify={notify} />
      </section>
    );
  return (
    <section className="panel positions-panel">
      <div className="panel-heading">
        <h2>
          My positions <span className="count mono">0</span>
        </h2>
        <Link to="/terminal/contracts" className="text-button">
          All contracts
          <ArrowUpRight size={12} />
        </Link>
      </div>
      <Empty
        icon={<Layers3 size={19} />}
        title={
          wallet.address
            ? "Your positions will appear here."
            : "Your view. Your positions."
        }
      >
        {wallet.address
          ? "Track expiry, reserved collateral and claimable USDG after your first trade."
          : "Connect your wallet to follow open contracts and claimable USDG."}
      </Empty>
    </section>
  );
}

function Leaderboard() {
  const [period, setPeriod] = useState("7d");
  const [result, setResult] = useState<LeaderData | null>(null);
  const count = result?.rows.length ?? 0;
  const { config } = useData();
  useEffect(() => {
    const controller = new AbortController();
    void api<LeaderData>(`/leaderboard?period=${period}`, {
      signal: controller.signal,
    })
      .then(setResult)
      .catch(() => {});
    return () => controller.abort();
  }, [period]);
  if (result?.rows.length)
    return (
      <div className="full-page">
        <div className="page-intro">
          <h1>Leaderboard</h1>
          <p>Realized performance after premiums and fees.</p>
        </div>
        <div className="panel">
          <div className="panel-heading">
            <h2>Top performers</h2>
            <div className="segmented">
              {[
                ["24h", "24 hours"],
                ["7d", "7 days"],
                ["30d", "1 month"],
              ].map(([id, label]) => (
                <button
                  className={period === id ? "active" : ""}
                  onClick={() => setPeriod(id)}
                  key={id}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Wallet</th>
                <th>Settled</th>
                <th>Win rate</th>
                <th>Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={row.wallet}>
                  <td>{i + 1}</td>
                  <td>
                    <External
                      href={`${config.explorer_url}/address/${row.wallet}`}
                    >
                      {short(row.wallet)}
                    </External>
                  </td>
                  <td>{row.trades}</td>
                  <td>{money((row.wins / row.trades) * 100, 1)}%</td>
                  <td
                    className={`mono ${Number(row.pnl) >= 0 ? "green" : "red"}`}
                  >
                    {money(row.pnl)} USDG
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  return (
    <div className="full-page">
      <div className="page-intro">
        <span className="eyebrow">THE COMPUTE CROWD</span>
        <h1>Leaderboard</h1>
        <p>Realized performance, after premiums and platform fees.</p>
      </div>
      <section className="panel leaderboard-panel">
        <div className="panel-heading">
          <h2>
            Top performers <span className="count mono">{count}</span>
          </h2>
          <div className="segmented">
            {[
              ["24h", "24 hours"],
              ["7d", "7 days"],
              ["30d", "1 month"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={period === id ? "active" : ""}
                onClick={() => setPeriod(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="leaderboard-columns mono">
          <span>RANK</span>
          <span>WALLET</span>
          <span>SETTLED TRADES</span>
          <span>WIN RATE</span>
          <span>NET P&L</span>
        </div>
        <Empty icon={<Trophy size={26} />} title="A clean slate.">
          Rankings begin with the first settled contracts. Open positions and
          unrealized gains do not count.
        </Empty>
      </section>
    </div>
  );
}

function Strategies({ notify }: { notify: (message: string) => void }) {
  const wallet = useWallet();
  const [access, setAccess] = useState<Access | null>(null);
  const [calculator, setCalculator] = useState<string | null>(null);
  useEffect(() => {
    setAccess(null);
    if (wallet.address)
      void api<Access>(`/access/${wallet.address}`)
        .then(setAccess)
        .catch(() => {});
  }, [wallet.address]);
  const unlock = async (title: string) => {
    if (!wallet.address) {
      try {
        await wallet.connect();
      } catch (e) {
        notify((e as Error).message);
      }
      return;
    }
    if (!access?.advanced) {
      notify(
        "Advanced tools unlock with any positive Silicon token balance after launch.",
      );
      return;
    }
    setCalculator(title);
  };
  return (
    <div className="full-page">
      <div className="page-intro">
        <span className="eyebrow">FOR SILICON HOLDERS</span>
        <h1>A little more context.</h1>
        <p>Tools for looking beyond a single provider price.</p>
      </div>
      <div className="strategy-grid">
        {[
          {
            icon: <ArrowUpRight size={23} />,
            title: "Compute spread",
            tag: "RELATIVE VALUE",
            body: "Compare H100 and A100 rental costs side by side. Follow how the premium for newer hardware changes.",
            color: "purple",
          },
          {
            icon: <SlidersHorizontal size={23} />,
            title: "Two-way scenario",
            tag: "PAYOFF BUILDER",
            body: "Model a capped call and put together. See the move needed to cover both premiums before choosing a side.",
            color: "green",
          },
          {
            icon: <Bell size={23} />,
            title: "Price ladder",
            tag: "WATCH LEVELS",
            body: "Save a sequence of rental-price levels. Build a watchlist around your own thresholds.",
            color: "gold",
          },
        ].map((s) => (
          <article className={`panel strategy-card ${s.color}`} key={s.title}>
            <span className="strategy-icon">{s.icon}</span>
            <span className="eyebrow">{s.tag}</span>
            <h2>{s.title}</h2>
            <p>{s.body}</p>
            <button className="button" onClick={() => void unlock(s.title)}>
              {access?.advanced ? (
                <ChevronRight size={13} />
              ) : (
                <LockKeyhole size={13} />
              )}
              Open tool
            </button>
          </article>
        ))}
      </div>
      <div className="holder-rule">
        <Wallet size={17} />
        <p>
          Any positive token balance gives access to advanced tools.
          <br />
          <strong>
            Holding more than 5,000 also removes platform trading fees.
          </strong>
        </p>
        <Link to="/docs#token" className="text-button">
          Token mechanics
          <ArrowUpRight size={12} />
        </Link>
      </div>
      {calculator && (
        <StrategyTool
          mode={calculator}
          close={() => setCalculator(null)}
          notify={notify}
        />
      )}
    </div>
  );
}

export default function Terminal({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const { snapshot, protocol, connected } = useData();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState("24h"),
    [detail, setDetail] = useState<Market | null>(null),
    [alertOpen, setAlertOpen] = useState(false),
    [alertPrice, setAlertPrice] = useState(""),
    [alertDirection, setAlertDirection] = useState<"above" | "below">("above"),
    [alerts, setAlerts] = useState<PriceAlert[]>(readAlerts),
    [filter, setFilter] = useState(""),
    [showSearch, setShowSearch] = useState(false);
  const [tutorial, setTutorial] = useState(() => {
    try {
      return !localStorage.getItem("silicon:intro");
    } catch {
      return true;
    }
  });
  const markets = snapshot?.markets ?? [];
  const market =
    markets.find((m) => m.id === params.get("asset")) ?? markets[0];
  const tab = location.pathname.split("/")[2] ?? "markets";
  useEffect(() => {
    if (!snapshot) return;
    setAlerts((current) => {
      let changed = false;
      const next = current.map((a) => {
        const m = snapshot.markets.find((v) => v.id === a.market);
        if (a.triggered || m?.price == null || m.stale) return a;
        if (a.direction === "above" ? m.price >= a.price : m.price <= a.price) {
          changed = true;
          notify(
            `${m.name} rental reference is ${a.direction} $${money(a.price, 3)} / hr.`,
          );
          return { ...a, triggered: true };
        }
        return a;
      });
      if (changed) remember("silicon:alerts", JSON.stringify(next));
      return changed ? next : current;
    });
  }, [snapshot, notify]);
  useEffect(() => {
    const refresh = () => setAlerts(readAlerts());
    window.addEventListener("silicon:alerts", refresh);
    return () => window.removeEventListener("silicon:alerts", refresh);
  }, []);
  const closeTutorial = () => {
    setTutorial(false);
    remember("silicon:intro", "seen");
  };
  const openAlert = () => {
    setAlertPrice(String(market?.price ?? ""));
    setAlertOpen(true);
  };
  const saveAlert = () => {
    const price = Number(alertPrice);
    if (!market || !Number.isFinite(price) || price <= 0) {
      notify("Enter a rental price above zero.");
      return;
    }
    if (alerts.length >= 20) {
      notify("Remove an alert before adding another.");
      return;
    }
    const next = [
      ...alerts,
      {
        id: crypto.randomUUID(),
        market: market.id,
        price,
        direction: alertDirection,
        triggered: false,
      },
    ];
    setAlerts(next);
    remember("silicon:alerts", JSON.stringify(next));
    notify("Price alert saved on this browser.");
    setAlertOpen(false);
  };
  return (
    <div className="terminal">
      <Header notify={notify} />
      <div className="terminal-status">
        <span>
          <Dot state={connected ? "green" : "gold"} />
          {connected ? "DATA CONNECTED" : "CONNECTING DATA"}
        </span>
        <span className="status-divider" />
        <span>
          {markets.reduce((n, m) => n + m.quote_count, 0)}{" "}
          <em>provider quotes</em>
        </span>
        <span className="status-divider" />
        <span>
          {markets.length} <em>GPU references</em>
        </span>
        <span className="status-divider" />
        <span>
          <em>Collateral</em> {money(protocol?.funded ?? 0)} USDG
        </span>
        <span className="status-right">
          <Clock3 size={11} />
          Market data open · trading prepares for launch
        </span>
      </div>
      {tab === "markets" ? (
        <main className="terminal-body">
          <div className="market-workspace">
            <div className="workspace-toolbar">
              <div>
                <h1>GPU markets</h1>
                <span className="muted">The price of an hour.</span>
              </div>
              <div className="workspace-tools">
                {showSearch && (
                  <input
                    className="market-search"
                    aria-label="Search GPU markets"
                    placeholder="Find a GPU…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    autoFocus
                  />
                )}
                <button
                  className="icon-button"
                  aria-label="Search markets"
                  onClick={() => {
                    setShowSearch(!showSearch);
                    setFilter("");
                  }}
                >
                  <Search size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Price alerts"
                  onClick={openAlert}
                >
                  <Bell size={15} />
                  {alerts.filter((a) => !a.triggered).length > 0 && (
                    <span className="notification-dot" />
                  )}
                </button>
                <button
                  className="icon-button"
                  aria-label="Show introduction"
                  onClick={() => setTutorial(true)}
                >
                  <CircleHelp size={15} />
                </button>
              </div>
            </div>
            {markets.length ? (
              <>
                <AssetCards
                  markets={markets.filter((m) =>
                    `${m.name} ${m.architecture}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )}
                  selected={market.id}
                  select={(id) => setParams({ asset: id })}
                  range={range}
                  info={setDetail}
                />
                {market && (
                  <>
                    <Benchmark
                      market={market}
                      range={range}
                      setRange={setRange}
                      info={() => setDetail(market)}
                      alert={openAlert}
                    />
                    <ProviderTable market={market} />
                  </>
                )}
                <div className="positions-activity">
                  <Positions notify={notify} />
                  <ActivityView compact />
                </div>
              </>
            ) : (
              <div className="data-loading">
                <span className="loading-chip" />
                <strong>Connecting to compute.</strong>
                <p>Loading provider quotes and network status.</p>
              </div>
            )}
          </div>
          {market && <Ticket market={market} notify={notify} />}
        </main>
      ) : tab === "contracts" ? (
        <Contracts open={setDetail} notify={notify} />
      ) : tab === "strategies" ? (
        <Strategies notify={notify} />
      ) : tab === "leaderboard" ? (
        <Leaderboard />
      ) : (
        <main className="full-page">
          <div className="page-intro">
            <span className="eyebrow">FOLLOW THE MARKET</span>
            <h1>Activity</h1>
            <p>Positions, deposits and settlements as they happen onchain.</p>
          </div>
          <ActivityView />
          <Positions notify={notify} />
        </main>
      )}
      <footer className="terminal-footer">
        <span>
          <Dot state={snapshot?.network.connected ? "green" : "gold"} />
          {snapshot?.network.connected
            ? "Robinhood connected"
            : "Checking Robinhood"}
        </span>
        <span className="mono">
          {snapshot?.network.block
            ? `Block ${snapshot.network.block.toLocaleString()}`
            : "Awaiting block"}
        </span>
        <span className="mono">
          {snapshot?.network.latency_ms != null
            ? `${snapshot.network.latency_ms}ms RPC`
            : ""}
        </span>
        <External href="https://gpueconomy.com/data">
          GPU Economy · CC BY 4.0
        </External>
        <span className="footer-right">
          SILICON <span className="purple">/</span> COMPUTE MARKETS
        </span>
      </footer>
      {tutorial && tab === "markets" && <Tutorial close={closeTutorial} />}{" "}
      {detail && (
        <AssetDetail
          market={markets.find((m) => m.id === detail.id) ?? detail}
          close={() => setDetail(null)}
        />
      )}
      {alertOpen && (
        <Modal
          title={`${market?.name ?? "GPU"} · price alerts`}
          close={() => setAlertOpen(false)}
        >
          <div className="modal-body">
            <p>
              Get an in-terminal alert when the published reference crosses your
              level. Alerts run while this browser has Silicon open.
            </p>
            <div className="alert-form">
              <select
                aria-label="Alert direction"
                value={alertDirection}
                onChange={(e) =>
                  setAlertDirection(e.target.value as "above" | "below")
                }
              >
                <option value="above">At or above</option>
                <option value="below">At or below</option>
              </select>
              <div className="amount-input">
                <span>$</span>
                <input
                  aria-label="Alert rental price"
                  type="number"
                  min=".001"
                  step=".01"
                  value={alertPrice}
                  onChange={(e) => setAlertPrice(e.target.value)}
                />
                <span>/hr</span>
              </div>
            </div>
            <button className="button primary full-width" onClick={saveAlert}>
              <Bell size={13} />
              Save price alert
            </button>
            <div className="saved-alerts">
              {alerts.map((a) => (
                <div key={a.id}>
                  <span>
                    {markets.find((m) => m.id === a.market)?.name ?? a.market}
                  </span>
                  <span className="mono">
                    {a.direction === "above" ? "≥" : "≤"} ${money(a.price, 3)}
                  </span>
                  <span className={a.triggered ? "green" : "muted"}>
                    {a.triggered ? <Check size={13} /> : "Watching"}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Remove alert"
                    onClick={() => {
                      const next = alerts.filter((v) => v.id !== a.id);
                      setAlerts(next);
                      remember("silicon:alerts", JSON.stringify(next));
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
