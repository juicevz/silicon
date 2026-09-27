import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  Check,
  CircleHelp,
  Clock3,
  Layers3,
  Radio,
  Search,
  Trophy,
  X,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useData, useConfig } from "./data";
import { useWallet } from "./wallet";
import {
  api,
  explorer, money,
  short,
  type Leaderboard as LeaderData,
  type Market,
} from "./api";
import { Dot, Empty, External, Modal } from "./components/ui";
import {
  AssetCards,
  AssetDetail,
  Benchmark,
  ProviderTable,
} from "./components/MarketViews";
import Ticket from "./components/Ticket";
import StrategyLab from "./components/StrategyLab";
import TerminalTour from "./components/TerminalTour";
import { PositionRows, usePortfolio } from "./components/Live";
import Contracts from "./components/Contracts";

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

function ActivityView({ compact = false }: { compact?: boolean }) {
  const { protocol } = useData();
  const config = useConfig();
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
              <External href={explorer(config, "tx", event.tx)}>
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
  const config = useConfig();
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
                      href={explorer(config, "address", row.wallet)}
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
      return !localStorage.getItem("silicon:intro:v3");
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
    remember("silicon:intro:v3", "seen");
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
    <>
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
          Robinhood Chain · {snapshot?.trading_enabled ? "trading open" : "market data open"}
        </span>
      </div>
      {tab === "markets" ? (
        <main className="terminal-body">
          <div className="market-workspace">
            <div className="workspace-toolbar">
              <div>
                <h1>GPU markets</h1>
                <span className="muted">Rental rates, across providers.</span>
              </div>
              <div className="workspace-tools">
                <Link className="strategies-shortcut" to="/terminal/strategies" aria-label="Explore strategies"><Layers3 size={17} /><span>Strategies</span></Link>
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
                <strong>Loading markets.</strong>
                <p>Loading provider quotes and network status.</p>
              </div>
            )}
          </div>
          {market && <Ticket market={market} notify={notify} />}
        </main>
      ) : tab === "contracts" ? (
        <Contracts notify={notify} />
      ) : tab === "strategies" ? (
        <StrategyLab notify={notify} />
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
            : "Awaiting slot"}
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
      {tutorial && market && tab === "markets" && (
        <TerminalTour close={closeTutorial} />
      )}{" "}
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
    </>
  );
}
