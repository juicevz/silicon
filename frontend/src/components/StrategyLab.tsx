import { useEffect, useRef, useState } from "react";
import { ArrowDownUp, ArrowUpRight, Bell, ChartNoAxesCombined, Landmark, SlidersHorizontal } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { api, money, type Protocol } from "../api";
import type { components } from "../api-schema";
import { useData } from "../data";
import { useBenefits } from "../benefits";
import { StrategyTemplates, GpuCompare } from "./ResearchTools";
import { downloadCsv } from "../workspace";
import { LiveContract } from "./Live";
import { PayoffChart } from "./PayoffChart";
import { SmoothRange } from "./SmoothRange";
import StrategyTool from "./StrategyTool";
import "./StrategyLab.css";

type Overview = components["schemas"]["StrategyOverview"];
type Book = components["schemas"]["PaperBook"];
type Paper = components["schemas"]["PaperRecord"];
type Tool = "vault" | "trend" | "spread";
const date = (value: string | number) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const titles = { vault: "Premium vault", trend: "Trend builder", spread: "Generation spread" };

function Evidence({ overview, spread }: { overview: Overview | null; spread: boolean }) {
  return <div className="strategy-evidence">
    <h3>What the data supports</h3>
    {overview ? overview.evidence.filter(e => spread || e.market === "h100-sxm").map(e => <p key={e.market}><strong>{e.market === "h100-sxm" ? "H100" : "B200"}</strong> · {e.observations} observations across {money(e.history_hours / 24, 1)} days · {e.distinct_prices} distinct prices. <span className={e.fresh ? "green" : "gold"}>{e.fresh ? "Recent reference available." : "Waiting for a fresh reference."}</span></p>) : <p>Loading recorded source history…</p>}
    <p>Flat prices and a short history do not establish a profitable trend. These tools start with 7, 14 or 30 days.</p>
  </div>;
}

function PaperHistory({ book }: { book: Book | null }) {
  const records = book?.records ?? [];
  return <section className="panel paper-history">
    <div className="strategy-section-heading"><div><h2>Your paper record</h2><p>Saved for this browser. Entry terms stay fixed after recording.</p></div><div><strong className={Number(book?.realized_profit ?? 0) >= 0 ? "green" : "red"}>{book?.settled_count ? `${money(book.realized_profit)} USDG` : "No settled results"}</strong><span>{book?.settled_count ?? 0} completed strategies</span></div></div>
    {records.length ? <div className="paper-records">{records.map(record => <article className="paper-record" key={record.id}>
      <div><strong>{record.kind === "trend" ? `H100 ${record.side === "put" ? "fall" : "rise"}` : `${record.side === "call" ? "B200" : "H100"} outperforms`}</strong><span>{date(record.created_at)} → {date(record.expiry)}</span></div>
      <div><span>Assumed cost</span><strong>{money(record.cost)} USDG</strong></div>
      <div><span>{record.status === "settled" ? "Realized paper result" : "Status"}</span><strong className={record.status === "settled" ? Number(record.profit) >= 0 ? "green" : "red" : "gold"}>{record.status === "settled" ? `${money(record.profit)} USDG` : record.status === "cancelled" ? "Cancelled · no timely data" : "Recording forward"}</strong></div>
      {record.thesis && <blockquote className="paper-saved-thesis">{record.thesis}</blockquote>}
      <div className="paper-timeline"><span>Recorded {new Date(record.created_at).toLocaleString()}</span><span>{record.closed_at ? `${record.status === "settled" ? "Result recorded" : "Cancelled"} ${new Date(record.closed_at).toLocaleString()}` : `Observing until ${new Date(record.expiry).toLocaleString()}`}</span></div>
      <details><summary>Entry & outcome</summary><div className="paper-receipts"><p>{money(record.units, 3)} units · {money(record.premium_per_unit)} USDG assumed premium per unit · 1% fee. Expiry {new Date(record.expiry).toLocaleString()}.</p>{Object.entries(record.entry_prices).map(([market, price]) => <p key={market}>{market === "h100-sxm" ? "H100" : "B200"}: ${money(price, 4)}/hr at entry. <a href={`/api/v1/receipts/${record.entry_receipts[market]}`} target="_blank" rel="noreferrer">Entry receipt ↗</a>{record.exit_prices?.[market] && <> Exit ${money(record.exit_prices[market], 4)}/hr. <a href={`/api/v1/receipts/${record.exit_receipts?.[market]}`} target="_blank" rel="noreferrer">Exit receipt ↗</a></>}</p>)}{record.status === "cancelled" && <p>No paired reference was available inside the settlement window. The paper cost is returned and this entry is excluded from performance.</p>}<p>Paper results exclude gas and execution slippage. Premiums are your assumptions, so this is not a record of executable returns.</p></div></details>
    </article>)}</div> : <div className="strategy-empty"><ChartNoAxesCombined size={28} /><h3>Your first thesis starts the record.</h3><p>Record a strategy with the builder above. Its result will use the first eligible source observation after expiry, with a three-hour source window.</p></div>}
  </section>;
}

function Builder({ spread, overview, book, refresh, notify }: { spread: boolean; overview: Overview | null; book: Book | null; refresh: () => void; notify: (s: string) => void }) {
  const { snapshot } = useData();
  const { eligible } = useBenefits();
  const [side, setSide] = useState<"call" | "put">(spread ? "call" : "put");
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [units, setUnits] = useState(1), [premium, setPremium] = useState("2"), [move, setMove] = useState(spread ? 5 : -5), [h100Move, setH100Move] = useState(0);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const [thesis, setThesis] = useState("");
  const saving = useRef(false);
  const attempt = useRef<{ body: string; id: string } | null>(null);
  const validPremium = /^\d+(\.\d{1,6})?$/.test(premium) && Number(premium) >= .1 && Number(premium) <= 9.9;
  const cost = validPremium ? Math.floor(Number(premium) * units * 1e6) / 1e6 + Math.floor(Number(premium) * units * 10000) / 1e6 : 0;
  const relativeMove = spread ? move - h100Move : move;
  const market = snapshot?.markets.find(m => m.id === "h100-sxm"), b200 = snapshot?.markets.find(m => m.id === "b200");
  const fresh = overview?.evidence.filter(e => spread || e.market === "h100-sxm").every(e => e.fresh) && (overview?.evidence.length ?? 0) > 0;
  const save = async () => {
    if (!validPremium || saving.current) return;
    saving.current = true;
    setPending(true); setError("");
    try {
      const terms = { kind: spread ? "generation_spread" : "trend", side, days, units, premium_per_unit: premium, thesis };
      const body = JSON.stringify(terms), storageKey = `silicon:paper-attempt:${terms.kind}`;
      try { if (!attempt.current) attempt.current = JSON.parse(sessionStorage.getItem(storageKey) ?? "null"); } catch { /* The in-memory request ID still protects retries. */ }
      if (attempt.current?.body !== body) attempt.current = { body, id: crypto.randomUUID() };
      try { sessionStorage.setItem(storageKey, JSON.stringify(attempt.current)); } catch { /* Site storage can be restricted. */ }
      await api<Paper>("/strategies/paper", { method: "POST", body: JSON.stringify({ ...terms, request_id: attempt.current!.id }) });
      attempt.current = null;
      try { sessionStorage.removeItem(storageKey); } catch { /* The server already saved the record. */ }
      refresh(); notify("Paper strategy recorded. No funds moved.");
    } catch (e) { setError((e as Error).message); }
    finally { saving.current = false; setPending(false); }
  };
  return <>
    <section className="strategy-builder panel">
      <div className="strategy-controls">
        <h2>{spread ? "Which generation leads?" : "What happens to H100 rents?"}</h2>
        <p>{spread ? "Compare each GPU against its own starting price. The difference in their percentage returns determines the payout." : "Build a position around a rental-price thesis, then record it against future observations."}</p>
        <div className="strategy-direction" aria-label="Strategy direction"><button aria-pressed={side === "put"} onClick={() => setSide("put")}>{spread ? "H100 outperforms" : "H100 prices fall"}</button><button aria-pressed={side === "call"} onClick={() => setSide("call")}>{spread ? "B200 outperforms" : "H100 prices rise"}</button></div>
        <p className="strategy-thesis">{spread ? (side === "call" ? "Newer hardware holds its rental price better." : "H100 holds its rental price better than B200.") : side === "put" ? "New supply pushes H100 rental prices down." : "Demand pushes H100 rental prices up."}</p>
        <label className="field-label" htmlFor="strategy-thesis">Your thesis (optional)</label><textarea className="strategy-thesis-input" id="strategy-thesis" value={thesis} onChange={e => setThesis(e.target.value)} maxLength={600} placeholder="What do you expect to change, and why?" /><p className="strategy-disclosure">Saved with the entry terms so you can compare your original reasoning with the result.</p>
        <label className="field-label">Observation period</label><div className="strategy-durations">{([7, 14, 30] as const).map(d => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>)}</div>
        <label className="field-label" htmlFor="strategy-premium">Assumed premium per unit</label><div className="amount-input"><input id="strategy-premium" inputMode="decimal" value={premium} onChange={e => setPremium(e.target.value)} /><span>USDG</span></div>
        {!validPremium && <p className="inline-error">Use 0.10–9.90 USDG, with at most six decimals.</p>}
        <label className="field-label" htmlFor="strategy-units">Position size</label><SmoothRange id="strategy-units" label="Strategy units" value={units} min={1} max={100} step={1} display={`${units} units`} onChange={setUnits} />
        <div className="strategy-entry"><span>Current H100 reference</span><strong>${money(market?.price, 3)}/hr</strong>{spread && <><span>Current B200 reference</span><strong>${money(b200?.price, 3)}/hr</strong></>}</div>
        <button className="button primary full-width" disabled={pending || !validPremium || !fresh || !book} onClick={() => void save()}>{pending ? "Recording…" : !fresh ? "Waiting for fresh data" : "Record paper strategy"}<ArrowUpRight size={16} /></button>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <p className="strategy-disclosure">No deposit or wallet needed. The record fixes your terms and actual starting references; the sliders only explore outcomes.</p>
        <StrategyTemplates terms={{ spread, side, days, units, premium, thesis }} load={t => { setSide(t.side); setDays(t.days); setUnits(t.units); setPremium(t.premium); setThesis(t.thesis); }} notify={notify} />
      </div>
      <div className="strategy-scenario">
        <div className="strategy-section-heading"><h2>Explore the outcome</h2><span>Scenario</span></div>
        <label className="field-label" htmlFor="strategy-move">{spread ? "B200 price change" : "H100 price change"}</label><SmoothRange id="strategy-move" label={spread ? "B200 price change" : "H100 price change"} value={move} min={-15} max={15} step={.1} display={`${move > 0 ? "+" : ""}${money(move, 1)}%`} onChange={setMove} />
        {spread && <><label className="field-label" htmlFor="h100-move">H100 price change</label><SmoothRange id="h100-move" label="H100 comparison change" value={h100Move} min={-15} max={15} step={.1} display={`${h100Move > 0 ? "+" : ""}${money(h100Move, 1)}%`} onChange={setH100Move} /><p className="spread-equation">B200 {money(move, 1)}% − H100 {money(h100Move, 1)}% = <strong>{money(relativeMove, 1)} percentage points</strong></p></>}
        <PayoffChart move={relativeMove} cost={cost} maxPayout={units * 10} side={side} onMove={spread ? undefined : setMove} spread={spread} />
        <p className="strategy-disclosure">{spread ? "1 percentage point of outperformance pays 1 USDG per unit, capped at 10. " : "1% in your chosen direction pays 1 USDG per unit, capped at 10. "}The assumed premium plus 1% fee is your maximum paper loss.</p>
        {spread && <p className="strategy-availability">{overview?.spread_reason ?? "B200 is a comparison reference. Live spread trading is not activated."}</p>}
      </div>
    </section>
    <Evidence overview={overview} spread={spread} />
    <PaperHistory book={book} />
    {eligible && !!book?.records.length && <button className="button" onClick={() => downloadCsv("silicon-paper-strategies.csv", [["ID", "Kind", "Side", "Created UTC", "Expiry UTC", "Thesis", "Cost USDG", "Status", "Paper profit USDG"], ...book.records.map(r => [r.id, r.kind, r.side, r.created_at, r.expiry, r.thesis, r.cost, r.status, r.profit])])}>Export paper history CSV</button>}
  </>;
}

function PremiumVault({ notify }: { notify: (s: string) => void }) {
  const { protocol } = useData();
  const [rounds, setRounds] = useState<Protocol[] | null>(null), [error, setError] = useState("");
  const [deposit, setDeposit] = useState(100), [payouts, setPayouts] = useState(40);
  useEffect(() => { const controller = new AbortController(); void api<Protocol[]>("/vaults", { signal: controller.signal }).then(value => { setRounds(value); setError(""); }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); }); return () => controller.abort(); }, [protocol?.checked_at]);
  const finalPool = Math.max(0, 1000 + 80 + .8 - payouts), returned = finalPool * deposit / 1000;
  return <>
    <section className="strategy-builder panel vault-explainer"><div className="strategy-controls"><h2>Back one round of trades.</h2><p>You deposit USDG before the round opens. That pool covers capped H100 payouts. Once the round settles, you redeem your share of what remains.</p><ol className="vault-steps"><li><strong>Choose a defined round.</strong><span>Opening time, expiry and contract are visible before signing.</span></li><li><strong>Capital locks while trades run.</strong><span>Premiums and fees stay in the pool. Payouts come out of it.</span></li><li><strong>Redeem after settlement.</strong><span>Buyer claims remain reserved. Joining another round is a new decision.</span></li></ol><p className="strategy-availability">Your return can be negative. The full deposit is at risk. Each round is isolated and fully backs its maximum buyer liabilities.</p></div><div className="strategy-scenario"><div className="strategy-section-heading"><h2>Where the return comes from</h2><span>Example only</span></div><div className="vault-waterfall"><div><span>Deposits in the pool</span><strong>1,000.00 USDG</strong></div><div><span>Assumed premiums + fees</span><strong className="green">+80.80 USDG</strong></div><div><span>Assumed buyer payouts</span><strong className="red">−{money(payouts)} USDG</strong></div><div><span>Remaining pool value</span><strong>{money(finalPool)} USDG</strong></div></div><label className="field-label" htmlFor="vault-payouts">Change the buyer payouts</label><SmoothRange id="vault-payouts" label="Assumed buyer payouts" value={payouts} min={0} max={1080.8} step={.1} display={`${money(payouts)} USDG`} onChange={setPayouts} /><label className="field-label" htmlFor="vault-deposit">Your part of the initial pool</label><SmoothRange id="vault-deposit" label="Example vault deposit" value={deposit} min={10} max={1000} step={10} display={`${money(deposit)} USDG`} onChange={setDeposit} /><div className="vault-return"><span>Your returned amount</span><strong>{money(returned)} <small>USDG</small></strong><p className={returned >= deposit ? "green" : "red"}>{money(returned - deposit)} USDG · {money((returned / deposit - 1) * 100)}% for this round</p></div><p className="strategy-disclosure">These inputs explain the accounting. They are not an APY, a forecast or actual round performance.</p></div></section>
    <section className="vault-rounds"><h2>Vault rounds</h2><p>Deposits use USDG on Robinhood Chain. Silicon ownership is optional. ETH pays network fees.</p>{error ? <p className="inline-error" role="alert">{error}</p> : rounds === null ? <p>Checking configured rounds…</p> : !rounds.length ? <div className="panel strategy-empty"><Landmark size={28} /><h3>The first round is awaiting deployment.</h3><p>Round contracts and funding must be configured before deposits open. No advertised yield or simulated backing is shown as live.</p><Link className="text-button" to="/terminal/contracts">View contracts <ArrowUpRight size={15} /></Link></div> : rounds.map(round => round.contracts.length ? round.contracts.map(series => <LiveContract key={series.address} series={series} state={round} notify={notify} />) : <p className="inline-error" key={round.address}>Round {round.address}: verification unavailable.</p>)}</section>
  </>;
}

export default function StrategyLab({ notify }: { notify: (s: string) => void }) {
  const [compare, setCompare] = useState(false);
  const [params, setParams] = useSearchParams();
  const raw = params.get("tool"), tool: Tool = raw === "vault" || raw === "spread" ? raw : "trend";
  const [overview, setOverview] = useState<Overview | null>(null), [book, setBook] = useState<Book | null>(null), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [legacy, setLegacy] = useState<string | null>(null);
  const openLegacy = async (name: string) => {
    setLegacy(name);
  };
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<Overview>("/strategies", { signal: controller.signal }), api<Book>("/strategies/paper", { signal: controller.signal })]).then(([evidence, records]) => { setOverview(evidence); setBook(records); setError(""); }).catch(e => { if (!controller.signal.aborted) setError((e as Error).message); });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => { const timer = setInterval(() => setRevision(v => v + 1), 60000); return () => clearInterval(timer); }, []);
  return <main className="full-page strategy-lab">
    <div className="page-intro"><h1>GPU strategies</h1><p>Back a round, test a rental-price thesis, or compare GPU generations.</p></div>
    <div className="strategy-options">{(["vault", "trend", "spread"] as const).map(key => <button className={`panel strategy-option ${key === tool ? "selected" : ""}`} key={key} aria-pressed={key === tool} onClick={() => setParams({ tool: key })}>{key === "vault" ? <Landmark size={24} /> : key === "trend" ? <ChartNoAxesCombined size={24} /> : <ArrowDownUp size={24} />}<h2>{titles[key]}</h2><p>{key === "vault" ? "Earn premiums and fees, less buyer payouts. Your capital backs each round." : key === "trend" ? "Turn an H100 rental-price view into a position with a recorded paper result." : "Model whether B200 rental prices outperform H100 over the same period."}</p><span>{key === "vault" ? "USDG rounds" : "Paper strategies"}<ArrowUpRight size={16} /></span></button>)}</div>
    {error && <p className="inline-error" role="alert">{error} <button className="text-button" onClick={() => setRevision(v => v + 1)}>Retry</button></p>}
    {tool === "vault" ? <PremiumVault notify={notify} /> : <Builder key={tool} spread={tool === "spread"} overview={overview} book={book} refresh={() => setRevision(v => v + 1)} notify={notify} />}
    <div className="strategy-existing"><span>Analysis tools</span>{[{ name: "Compute spread", icon: <ArrowDownUp size={16} /> }, { name: "Two-way scenario", icon: <SlidersHorizontal size={16} /> }, { name: "Price ladder", icon: <Bell size={16} /> }].map(item => <button key={item.name} className="button" onClick={() => void openLegacy(item.name)}>{item.icon}{item.name}</button>)}</div>
    <button className="button" onClick={() => setCompare(true)}>Compare GPUs</button>
    {compare && <GpuCompare close={() => setCompare(false)} />}
    {legacy && <StrategyTool mode={legacy} close={() => setLegacy(null)} notify={notify} />}
  </main>;
}
