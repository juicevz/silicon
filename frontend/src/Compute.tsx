import { useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, Check, ChevronRight, Code2, Copy, KeyRound, Layers3, Loader2, MessageSquare, Play, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useCompute } from "./compute-context";
import { computeApi, usageCost, type ComputeKey, type CreatedKey, type MarketId, type Mode, type UsageRecord } from "./compute-api";
import { useData } from "./data";
import { money, short } from "./api";
import ApiKeyControls from "./components/ApiKeyControls";
import { ComputeAssistant, ComputeSignIn } from "./components/ComputeAssistant";
import "./compute.css";

const views = [
  { id: "chat", name: "Playground", icon: Play, description: "Choose a model. Give your next idea some room." },
  { id: "market", name: "Market assistant", icon: MessageSquare, description: "Explore the references and providers behind GPU markets." },
  { id: "strategy", name: "Strategy drafts", icon: Layers3, description: "Turn a rental-price view into an editable paper scenario." },
  { id: "api", name: "API access", icon: Code2, description: "Connect your tools with a private Silicon key." },
  { id: "usage", name: "Usage", icon: Activity, description: "Follow requests and their recorded cost." },
] as const;
type View = typeof views[number]["id"];

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [status, setStatus] = useState("");
  useEffect(() => { if (!status) return; const timer = setTimeout(() => setStatus(""), 3000); return () => clearTimeout(timer); }, [status]);
  return <button className="button" onClick={() => void navigator.clipboard.writeText(value).then(() => setStatus("Copied")).catch(() => setStatus("Select and copy manually"))}>{status === "Copied" ? <Check size={14} /> : <Copy size={14} />}{status || label}</button>;
}

function ApiAccess() {
  const { account, catalog, sessionVersion } = useCompute();
  const [keys, setKeys] = useState<ComputeKey[]>([]), [created, setCreated] = useState<CreatedKey | null>(null);
  const [name, setName] = useState(""), [limit, setLimit] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [revision, setRevision] = useState(0);
  const endpoint = `${window.location.origin}/api/v1`;
  const model = catalog?.models.find(m => m.available)?.id;
  const example = `curl ${endpoint}/chat/completions \\\n  -H "Authorization: Bearer $SILICON_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify({ model: model ?? "MODEL_ID_FROM_MODELS", messages: [{ role: "user", content: "Explain GPU inference in one paragraph." }], max_tokens: 256, stream: true }, null, 2)}'`;
  useEffect(() => {
    if (!account) return;
    const abort = new AbortController();
    void computeApi<ComputeKey[]>("/keys", { signal: abort.signal }).then(value => { setKeys(value); setLoaded(true); }).catch(e => { if (!abort.signal.aborted) { setError((e as Error).message); setLoaded(true); } });
    return () => abort.abort();
  }, [account?.address, revision, sessionVersion]);
  const create = async () => {
    if (busy || !name.trim()) return;
    if (limit.trim() && (!Number.isFinite(Number(limit)) || Number(limit) < 0 || Number(limit) > 100000 || !/^\d+(?:\.\d{1,9})?$/.test(limit))) { setError("Enter a valid nonnegative USD cap, or leave it blank for the account cap."); return; }
    setBusy(true); setError(""); setCreated(null);
    try {
      const value = await computeApi<CreatedKey>("/keys", { method: "POST", body: JSON.stringify({ name, limit_usd: limit.trim() ? limit : null }) });
      setCreated(value); setName(""); setLimit(""); setRevision(v => v + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <div className="compute-detail-view"><section className="compute-detail-section"><div className="compute-section-title"><KeyRound size={19} /><h2>Your API keys</h2></div><p>Use a separate key for each tool. Set a lifetime spending cap for each key and pause a tool without revoking it. Account capacity also applies.</p><ComputeSignIn />{account && <>
    <form className="compute-key-form" onSubmit={e => { e.preventDefault(); void create(); }}><label htmlFor="compute-key-name">Key name<input id="compute-key-name" placeholder="My terminal" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="off" /></label><label className="compute-key-create-limit" htmlFor="compute-key-cap">Lifetime cap (USD)<input id="compute-key-cap" aria-label="New key lifetime cap" inputMode="decimal" placeholder="Account cap" value={limit} onChange={e => setLimit(e.target.value)} autoComplete="off" /></label><button className="button primary" disabled={busy || !name.trim() || account.access !== "ready"}>{busy ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />}Create key</button></form>
    {created && <div className="compute-created-key" role="status"><strong>Save your key now</strong><p>It is shown once. Keep it in your tool’s secret settings.</p><label className="sr-only" htmlFor="created-compute-key">New Silicon API key</label><input id="created-compute-key" type="password" value={created.key} readOnly autoComplete="off" onFocus={e => e.currentTarget.select()} /><div><CopyButton value={created.key} label="Copy key" /><button className="text-button" onClick={() => setCreated(null)}>I saved it</button></div></div>}
    {!loaded ? <p className="compute-note">Loading keys…</p> : keys.length ? <div>{keys.map(key => <ApiKeyControls key={key.id} value={key} changed={() => setRevision(v => v + 1)} revoked={(id) => { if (created?.info.id === id) setCreated(null); }} />)}</div> : <p className="compute-empty-row">You have no API keys yet.</p>}
  </>}{error && <p className="inline-error" role="alert">{error}</p>}</section>
  <section className="compute-detail-section"><div className="compute-section-title"><Code2 size={19} /><h2>Connect a compatible client</h2></div><p>Set your tool’s API base URL and Silicon key. Choose a model from <code>GET /models</code>.</p><div className="compute-endpoint"><code>{endpoint}</code><CopyButton value={endpoint} /></div><div className="compute-code-heading"><span className="eyebrow">SHELL · CHAT COMPLETIONS</span><CopyButton value={example} /></div><pre className="compute-code"><code>{example}</code></pre><p className="compute-note">Set <code>SILICON_API_KEY</code> through your shell’s secret manager. Text chat, streamed responses and tool-call messages are supported. Your client runs any tools you enable locally.</p></section>
  </div>;
}

function Usage() {
  const { account, refresh } = useCompute();
  const [params, setParams] = useSearchParams();
  const keyId = params.get("key") ?? "";
  const [keys, setKeys] = useState<ComputeKey[]>([]);
  const [rows, setRows] = useState<UsageRecord[] | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!account) return;
    const abort = new AbortController();
    const load = () => { void computeApi<UsageRecord[]>(keyId ? `/usage?key_id=${encodeURIComponent(keyId)}` : "/usage", { signal: abort.signal }).then(value => { setRows(value); setError(""); }).catch(e => { if (!abort.signal.aborted) setError((e as Error).message); }); void refresh(); };
    setRows(null);
    void computeApi<ComputeKey[]>("/keys", { signal: abort.signal }).then(setKeys).catch(() => setKeys([]));
    load(); const timer = setInterval(load, 15_000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [account?.address, refresh, revision, keyId]);
  return <div className="compute-detail-view"><ComputeSignIn />{account && <><div className="compute-usage-stats"><div><span>Account recorded usage</span><strong>{usageCost(account.used_usd)}</strong></div><div><span>Account requests</span><strong>{account.request_count}</strong></div><div><span>Access</span><strong className={account.access === "ready" ? "green" : "gold"}>{account.access === "ready" ? "Ready" : account.access === "pending" ? "Pending" : account.access === "exhausted" ? "Exhausted" : "Unavailable"}</strong></div></div><section className="compute-detail-section"><div className="compute-usage-heading"><h2>Recent requests</h2><button className="button" onClick={() => setRevision(v => v + 1)}><RefreshCw size={14} />Refresh</button></div><label className="compute-usage-filter">Filter requests<select aria-label="Usage API key" value={keyId} onChange={e => setParams({ view: "usage", ...(e.target.value ? { key: e.target.value } : {}) })}><option value="">All account requests</option>{keys.map(key => <option value={key.id} key={key.id}>{key.name}{key.revoked ? " (revoked)" : ""}</option>)}</select></label><p>Usage is recorded after the model responds. Interrupted requests can remain pending while their final cost is checked.</p>{error && <p className="inline-error" role="alert">{error}</p>}{rows === null ? <p className="compute-note" role="status">Loading usage…</p> : rows.length === 0 ? <div className="compute-usage-empty"><Activity size={28} /><h3>Your requests will appear here.</h3><p>Start a conversation or connect a tool with your Silicon key.</p><Link className="button" to="/compute">Open playground <ArrowUpRight size={14} /></Link></div> : <div className="compute-usage-table"><table><thead><tr><th>Model / time</th><th>Tool</th><th>Tokens in / out</th><th>Status</th><th>Cost</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.model.split("/").at(-1)}</strong><time dateTime={new Date(row.created_at * 1000).toISOString()}>{new Date(row.created_at * 1000).toLocaleString()}</time></td><td>{row.key_name ?? (row.mode === "chat" ? "Playground" : row.mode === "market" ? "Assistant" : row.mode === "strategy" ? "Draft" : "Legacy API · unattributed")}</td><td className="mono">{row.prompt_tokens ?? "—"} / {row.completion_tokens ?? "—"}</td><td><span className={`compute-status ${row.status === "completed" ? "green" : row.status === "failed" ? "red" : "gold"}`}>{row.status === "reserved" ? "Running" : row.status === "completed" ? "Complete" : row.status === "failed" ? "Failed" : "Pending"}</span></td><td className="mono">{usageCost(row.cost_usd)}</td></tr>)}</tbody></table></div>}</section></>}</div>;
}

function ContextPanel({ view, marketId }: { view: View; marketId: MarketId }) {
  const { catalog } = useCompute(), { snapshot } = useData();
  const market = snapshot?.markets.find(m => m.id === marketId);
  return <aside className="compute-context"><div className="compute-context-heading"><span className="eyebrow">{view === "market" || view === "strategy" ? "MARKET CONTEXT" : "AVAILABLE MODELS"}</span><span className={`compute-dot ${catalog?.models.some(m => m.available) ? "ready" : ""}`} /></div>
    {view === "market" || view === "strategy" ? <><h3>{market?.name ?? "H100 SXM"}</h3><div className="compute-reference"><strong>{market?.price != null ? `$${money(market.price, 3)}` : "—"}</strong><span>/ GPU-hour</span></div><p className="compute-note">{market?.source_updated_at ? `Source observation ${new Date(market.source_updated_at).toLocaleString()}.` : "Waiting for a source observation."}</p><span className={`compute-context-tag ${market?.stale !== false ? "gold" : "green"}`}>{market?.stale !== false ? "Awaiting fresh data" : "Recent reference"}</span><p>{marketId === "h100-sxm" ? "The H100 benchmark follows a defined basket of provider listings." : "A comparison reference across providers. Live contract availability is separate."}</p><Link className="text-button" to={`/terminal?asset=${marketId}`}>View market <ArrowUpRight size={13} /></Link><hr /><h4>{view === "strategy" ? "From thesis to scenario" : "Sources travel with the answer"}</h4><p>{view === "strategy" ? "Draft H100 trends or B200 versus H100 spreads over 7, 14 or 30 days. Review the assumed premium and price move in the paper builder." : "Answers receive observed prices, provider coverage and current contract readiness. Source links let you inspect the underlying records."}</p></> : <><div className="compute-model-list">{catalog?.models.map(model => <div key={model.id}><div><span className={`compute-dot ${model.available ? "ready" : ""}`} /><strong>{model.name}</strong></div><p>{model.description}</p>{model.available && model.input_per_million != null && model.output_per_million != null ? <small>${Number(model.input_per_million)} in · ${Number(model.output_per_million)} out / 1M tokens</small> : <small>Currently unavailable</small>}</div>) ?? <p>Checking models…</p>}</div><p className="compute-note">Listed token rates can vary by provider. Usage shows each request’s recorded cost.</p></>}
    <div className="compute-context-footer"><Link to="/docs#compute">How Compute works <ArrowUpRight size={13} /></Link><span>Text inference · Silicon API</span></div>
  </aside>;
}

export default function Compute() {
  const [params, setParams] = useSearchParams();
  const { account, catalog, signOut, sessionVersion } = useCompute(), { snapshot } = useData();
  const [error, setError] = useState("");
  const view = views.find(v => v.id === params.get("view")) ?? views[0];
  const market = (snapshot?.markets.find(m => m.id === params.get("market"))?.id ?? "h100-sxm") as MarketId;
  const choose = (next: View) => { setParams({ view: next, ...(params.get("market") ? { market } : {}) }); setError(""); };
  let content: ReactNode;
  if (view.id === "api") content = <ApiAccess key={sessionVersion} />;
  else if (view.id === "usage") content = <Usage key={sessionVersion} />;
  else content = <ComputeAssistant key={`${view.id}:${market}`} mode={view.id as Mode} market={market} />;
  return <main className="compute-page"><div className="compute-page-intro"><div><span className="eyebrow">SILICON / WORKSPACE</span><h1>Compute</h1><p>Use language models, explore GPU markets and draft paper strategies.</p></div><Link className="text-button" to="/terminal">GPU markets <ArrowUpRight size={15} /></Link></div>
    <div className="compute-workspace"><aside className="compute-sidebar"><div className="compute-sidebar-title">WORKSPACE</div><nav aria-label="Compute tools">{views.map(item => <button key={item.id} aria-current={view.id === item.id ? "page" : undefined} onClick={() => choose(item.id)}><item.icon size={17} /><span>{item.name}</span>{view.id === item.id && <ChevronRight size={14} />}</button>)}</nav><div className="compute-access"><span className={`compute-dot ${catalog?.enabled && account?.access === "ready" ? "ready" : ""}`} /><span>{account ? account.access === "ready" ? "Compute ready" : "Access pending" : "Wallet sign-in"}</span>{account && <><code>{short(account.address)}</code><button className="text-button" onClick={() => void signOut().catch(e => setError((e as Error).message))}>Sign out</button></>}{error && <p className="inline-error" role="alert">{error}</p>}</div></aside>
      <div className="compute-main"><header className="compute-view-heading"><div><h2>{view.name}</h2><p>{view.description}</p></div>{view.id === "market" && <label className="compute-market-select"><span className="sr-only">Assistant market</span><select aria-label="Assistant market" value={market} onChange={e => setParams({ view: view.id, market: e.target.value })}>{snapshot?.markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>) ?? <option value="h100-sxm">H100 SXM</option>}</select></label>}{view.id === "strategy" && <Link className="text-button" to="/terminal/strategies">Paper builder <ArrowUpRight size={13} /></Link>}</header>{content}</div><ContextPanel view={view.id} marketId={view.id === "strategy" ? "h100-sxm" : market} /></div>
  </main>;
}
