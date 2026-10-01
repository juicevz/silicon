import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CircleHelp,
  Calculator,
  Clock3,
  Cloud,
  Layers3,
  Radio,
  Search,
  Trophy,
} from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useData, useConfig } from "./data";
import { useWallet } from "./wallet";
import RentalPlanner from "./components/RentalPlanner";
import GpuMovers from "./components/GpuMovers";
import BackgroundAlerts, { useAlertInbox } from "./components/BackgroundAlerts";
import { useBenefits } from "./benefits";
import { TerminalAssistant } from "./components/ComputeAssistant";
import {
  api,
  explorer, money,
  short,
  type Leaderboard as LeaderData,
  type Market,
} from "./api";
import { Dot, Empty, External, Modal, RequestError } from "./components/ui";
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
import { MarketContextBar, SavedTransactions, useTransactionRecovery } from "./components/TerminalInsights";
import HolderTools from "./components/HolderTools";
import { useHolderSession } from "./holder-session";
import type { WorkspaceState } from "./holders-api";
import { readTemplates, TEMPLATE_KEY } from "./workspace";

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
          .slice(0, 100)
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
  const { protocol, protocolError } = useData();
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
        title={protocolError ? "Activity is unavailable." : !protocol ? "Loading activity…" : "The first trade starts the feed."}
      >
        {protocolError ? "Retry the connection above to check contract activity."
          : !protocol ? "Checking the latest contract activity."
          : "Filled positions, collateral deposits and settlements will link directly to their transactions."}
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const count = result?.rows.length ?? 0;
  const config = useConfig();
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    setLoading(true);
    void api<LeaderData>(`/leaderboard?period=${period}`, {
      signal: controller.signal,
    })
      .then(value => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("The leaderboard could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [period, revision]);
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
            Top performers <span className="count mono">{loading || error ? "—" : count}</span>
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
        {error ? <RequestError message={error} retry={() => setRevision(value => value + 1)} retryLabel="Retry leaderboard" />
        : loading ? <div className="empty-state" role="status">Loading leaderboard…</div>
        : <Empty icon={<Trophy size={26} />} title="A clean slate.">
          Rankings begin with the first settled contracts. Open positions and
          unrealized gains do not count.
        </Empty>}
      </section>
    </div>
  );
}

export default function Terminal({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const { snapshot, protocol, connected, marketError, protocolError, retryData } = useData();
  const alertState = useAlertInbox();
  const [holderTab, setHolderTab] = useState<"workspaces" | "alerts" | null>(null);
  const holderSession = useHolderSession(holderTab !== null);
  const [watchlist, setWatchlist] = useState<WorkspaceState["watchlist"]>([]);
  const [notes, setNotes] = useState("");
  const { eligible } = useBenefits();
  const journal = useTransactionRecovery();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [range, setRange] = useState("24h"),
    [detail, setDetail] = useState<Market | null>(null),
    [alertOpen, setAlertOpen] = useState(false),
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
  const tab = location.pathname.replace(/^\/terminal\/?/, "").replace(/\/$/, "") || "markets";
  useEffect(() => { setWatchlist([]); setNotes(""); }, [holderSession.address]);
  const captureWorkspace = (): WorkspaceState => ({ market: (market?.id ?? "h100-sxm") as WorkspaceState["market"], range: range as WorkspaceState["range"], filter, watchlist, notes, templates: readTemplates() });
  const loadWorkspace = (state: WorkspaceState) => {
    const templates = [...state.templates, ...readTemplates().filter(item => !state.templates.some(saved => saved.id === item.id))];
    if (templates.length > 50) throw new Error("Loading this workspace would exceed 50 templates. Remove unused local templates first; your saved workspace is safe.");
    try { localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates)); }
    catch { throw new Error("Browser storage is unavailable. The workspace was not loaded."); }
    window.dispatchEvent(new Event("silicon:templates"));
    setRange(state.range); setFilter(state.filter); setShowSearch(!!state.filter); setWatchlist(state.watchlist); setNotes(state.notes);
    const next = new URLSearchParams(params); next.set("asset", state.market); setParams(next, { replace: true });
  };
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
  const openAlert = () => setAlertOpen(true);
  useEffect(() => {
    if (params.get("alerts") === "1") setAlertOpen(true);
    if (params.get("holderAlerts") === "1") setHolderTab("alerts");
    else if (params.get("workspaces") === "1") setHolderTab("workspaces");
  }, [params]);
  return (
    <>
      <div className="terminal-status">
        <span>
          <Dot state={connected ? "green" : "gold"} />
          {connected ? "DATA CONNECTED" : marketError ? "DATA UNAVAILABLE" : "CONNECTING DATA"}
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
          <em>Collateral</em> {money(protocolError ? null : protocol?.funded)} USDG
        </span>
        <span className="status-right">
          <Clock3 size={11} />
          Robinhood Chain · {snapshot?.trading_enabled ? "trading open" : "market data open"}
        </span>
      </div>
      {(marketError || protocolError) && <div className="terminal-data-errors">
        {marketError && <RequestError message={`${marketError}${snapshot ? " Showing the last loaded prices." : " Retry to load GPU prices."}`} retry={retryData} retryLabel="Retry market data" />}
        {protocolError && <RequestError message={protocolError} retry={retryData} retryLabel="Retry contract data" />}
      </div>}
      {tab === "markets" ? (
        <main className="terminal-body">
          <div className="market-workspace">
            <div className="workspace-toolbar">
              <div>
                <h1>GPU markets</h1>
                <span className="muted">Rental rates, across providers.</span>
              </div>
              <div className="workspace-tools">
                <button className="strategies-shortcut" aria-label="Open holder workspaces" onClick={() => setHolderTab("workspaces")}><Cloud size={17} /><span>Workspaces</span></button>
                <Link className="strategies-shortcut" aria-label="Cost planner" to={`/terminal/planner?asset=${market?.id ?? "h100-sxm"}`}><Calculator size={17} /><span>Cost planner</span></Link>
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
                  {(alerts.some(a => !a.triggered) || alertState.inbox?.events.some(e => !e.read) || alertState.inbox?.rules.some(r => !r.triggered_at && new Date(r.expires_at).getTime() > Date.now())) && (
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
                {!!watchlist.length && <div className="holder-watchlist-bar"><span>Watching {watchlist.length} GPUs</span><button className="text-button" onClick={() => setWatchlist([])}>Show all</button><button className="text-button" onClick={() => setHolderTab("workspaces")}>Edit workspace</button></div>}
                <AssetCards
                  markets={markets.filter((m) =>
                    (!watchlist.length || watchlist.includes(m.id as WorkspaceState["market"])) &&
                    `${m.name} ${m.architecture}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )}
                  selected={market.id}
                  select={(id) => setParams({ asset: id })}
                  range={range}
                  info={setDetail}
                />
                <GpuMovers select={(id) => setParams({ asset: id })} />
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
                    <MarketContextBar market={market} evidence={() => setDetail(market)} />
                    <TerminalAssistant market={market} />
                  </>
                )}
                <div className="positions-activity">
                  <Positions notify={notify} />
                  <ActivityView compact />
                </div>
                <SavedTransactions {...journal} compact />
              </>
            ) : (
              <div className="data-loading">
                {!marketError && <span className="loading-chip" />}
                <strong>{marketError ? "Market data is unavailable." : "Loading markets."}</strong>
                <p>{marketError ? "Use Retry market data above to reconnect." : "Loading provider quotes and network status."}</p>
              </div>
            )}
          </div>
          {market && <Ticket market={market} notify={notify} />}
        </main>
      ) : tab === "planner" ? (
        <main className="full-page"><div className="page-intro"><span className="eyebrow">SILICON / RENTAL ESTIMATES</span><h1>GPU cost planner</h1><p>Compare provider listing costs for your machine count and runtime.</p></div><RentalPlanner /></main>
      ) : tab === "contracts" ? (
        <Contracts notify={notify} />
      ) : tab === "strategies" ? (
        <StrategyLab notify={notify} />
      ) : tab === "leaderboard" ? (
        <Leaderboard />
      ) : tab === "activity" ? (
        <main className="full-page">
          <div className="page-intro">
            <span className="eyebrow">FOLLOW THE MARKET</span>
            <h1>Activity</h1>
            <p>Positions, deposits and settlements as they happen onchain.</p>
          </div>
          <SavedTransactions {...journal} />
          <ActivityView />
          <Positions notify={notify} />
        </main>
      ) : (
        <main className="full-page">
          <div className="page-intro">
            <h1>Page not found</h1>
            <p>This terminal page does not exist.</p>
          </div>
          <Link className="button primary" to="/terminal">Back to markets</Link>
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
        <Modal title={`${market?.name ?? "GPU"} · background alerts`} close={() => {
          setAlertOpen(false);
          if (params.has("alerts")) { const next = new URLSearchParams(params); next.delete("alerts"); setParams(next, { replace: true }); }
        }}>
          <div className="modal-body"><button className="button" onClick={() => { setAlertOpen(false); setHolderTab("alerts"); }}><Cloud size={14} />Holder recurring alerts</button></div>
          <BackgroundAlerts market={market} markets={markets} state={alertState} notify={notify} legacy={alerts} localLimit={eligible ? 100 : 20} saveLocal={(rule) => {
            const next = [...alerts, rule]; setAlerts(next); remember("silicon:alerts", JSON.stringify(next));
          }} migrated={(id) => {
            const next = alerts.filter(rule => rule.id !== id);
            setAlerts(next); remember("silicon:alerts", JSON.stringify(next));
          }} />
        </Modal>
      )}
      {holderTab && <HolderTools key={holderSession.address} session={holderSession} initialTab={holderTab} markets={markets} capture={captureWorkspace} load={loadWorkspace} notify={notify} close={() => {
        setHolderTab(null);
        if (params.has("holderAlerts") || params.has("workspaces")) { const next = new URLSearchParams(params); next.delete("holderAlerts"); next.delete("workspaces"); setParams(next, { replace: true }); }
      }} />}
    </>
  );
}
