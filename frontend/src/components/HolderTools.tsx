import { useState } from "react";
import { Bell, Cloud, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { short, type Market } from "../api";
import { holderApi, type AlertCondition, type AdvancedRequest, type SavedWorkspace, type WorkspaceState } from "../holders-api";
import { useHolderSession } from "../holder-session";
import { monitoring } from "../monitoring-api";
import { Modal } from "./ui";
import "./HolderTools.css";

type Session = ReturnType<typeof useHolderSession>;
type Tab = "workspaces" | "alerts";
const statuses = { watching: "Watching", waiting_data: "Waiting for data", cooldown: "Cooling down", waiting_reset: "Waiting for reset", paused: "Holder check paused", complete: "Completed", expired: "Expired" };

export default function HolderTools({ session, initialTab, close, markets, capture, load, notify }: {
  session: Session; initialTab: Tab; close: () => void; markets: Market[];
  capture: () => WorkspaceState; load: (state: WorkspaceState) => void; notify: (message: string) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return <Modal title="Your holder workspace" close={close} wide>
    <div className="holder-tools">
      <div className="holder-intro"><div><Cloud size={24} /><h2>Pick up where you left off.</h2><p>Your watchlists, notes and rules. Saved to your wallet, across devices.</p></div><Link to="/docs#holder-workspaces" className="text-button">How it works ↗</Link></div>
      <div className="holder-tabs" role="tablist" aria-label="Holder tools"><button role="tab" aria-selected={tab === "workspaces"} onClick={() => setTab("workspaces")}><Cloud size={15} />Workspaces</button><button role="tab" aria-selected={tab === "alerts"} onClick={() => setTab("alerts")}><Bell size={15} />Advanced alerts</button></div>
      {session.error && <p className="inline-error" role="alert">{session.error} <button className="text-button" onClick={() => void session.refresh()}>Retry</button></p>}
      {!session.account ? <div className="holder-signin"><ShieldCheck size={28} /><h3>A signature keeps your work private.</h3><p>Sign in with the same wallet on any device. This message costs no gas and gives no permission to move funds.</p><button className="button primary" disabled={session.signing || session.loading} onClick={() => void session.signIn()}>{session.signing ? "Check your wallet…" : session.loading ? "Checking saved session…" : "Sign in with wallet"}</button><p>Saving and recurring monitoring require more than 5,000 SILICON. You can always return to read or delete saved work.</p></div> : <>
        <div className="holder-account"><span><ShieldCheck size={14} />{short(session.account.address)} · {session.account.eligible ? "Holder access" : "Read access"}</span><div><button className="icon-button" aria-label="Refresh holder tools" disabled={session.loading} onClick={() => void session.refresh()}><RefreshCw size={14} /></button><button className="text-button" onClick={() => void session.signOut()}>Sign out</button></div></div>
        {!session.account.eligible && <p className="holder-access-note">{session.account.reason} Existing work stays readable; new saves and monitoring pause.</p>}
        <div hidden={tab !== "workspaces"}><Workspaces session={session} markets={markets} capture={capture} load={load} notify={notify} /></div><div hidden={tab !== "alerts"}><AdvancedAlerts session={session} markets={markets} notify={notify} /></div>
      </>}
    </div>
  </Modal>;
}

function Workspaces({ session, markets, capture, load, notify }: { session: Session; markets: Market[]; capture: () => WorkspaceState; load: (state: WorkspaceState) => void; notify: (message: string) => void }) {
  const [draft, setDraft] = useState(capture), [name, setName] = useState("My GPU workspace");
  const [selected, setSelected] = useState<SavedWorkspace | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  const act = async (work: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError("");
    try { await work(); await session.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = (asNew: boolean) => act(async () => {
    const latest = capture();
    const state = { ...latest, watchlist: draft.watchlist, notes: draft.notes };
    const row = await holderApi<SavedWorkspace>(session.address, `/workspaces${!asNew && selected ? `/${selected.id}` : ""}`, {
      method: !asNew && selected ? "PUT" : "POST", body: JSON.stringify({ name, state, revision: !asNew && selected ? selected.revision : 0 }),
    });
    setSelected(row); setDraft(state); load(state); notify("Workspace saved to your wallet. Available on your other devices.");
  });
  return <div className="holder-workspaces" role="tabpanel" aria-label="Workspaces">
    <div className="holder-saved"><div className="holder-section-title"><h3>Saved workspaces</h3><span>{session.workspaces.length} / 5</span></div>
      {!session.workspaces.length && <p className="holder-note">Your first save will appear here.</p>}
      {session.workspaces.map(row => <article className={`holder-saved-row ${selected?.id === row.id ? "selected" : ""}`} key={row.id}><button disabled={busy} onClick={() => { try { load(row.state as WorkspaceState); setSelected(row); setName(row.name); setDraft(row.state as WorkspaceState); setError(""); notify("Workspace loaded. Templates restored without opening a position."); } catch (e) { setError((e as Error).message); } }}><strong>{row.name}</strong><small>{new Date(row.updated_at).toLocaleString()} · v{row.revision}</small></button>{remove === row.id ? <div><button className="text-button" disabled={busy} onClick={() => void act(async () => { await holderApi(session.address, `/workspaces/${row.id}?revision=${row.revision}`, { method: "DELETE" }); if (selected?.id === row.id) setSelected(null); setRemove(null); })}>Delete</button><button className="text-button" onClick={() => setRemove(null)}>Keep</button></div> : <button className="icon-button" aria-label={`Delete workspace ${row.name}`} disabled={busy} onClick={() => setRemove(row.id)}><Trash2 size={14} /></button>}</article>)}
      <p className="holder-note">Click a saved workspace to load its latest version. Saves are explicit; unsaved edits stay in this open panel.</p>
    </div>
    <div className="holder-editor"><label className="holder-field">Workspace name<input maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="holder-section-title"><h3>GPU watchlist</h3><span>{draft.watchlist.length || "All"} models</span></div>
      <div className="holder-watchlist">{markets.map(m => <button key={m.id} aria-pressed={draft.watchlist.includes(m.id as WorkspaceState["market"])} onClick={() => setDraft(current => ({ ...current, watchlist: current.watchlist.includes(m.id as WorkspaceState["market"]) ? current.watchlist.filter(id => id !== m.id) : [...current.watchlist, m.id as WorkspaceState["market"]] }))}>{m.name}</button>)}</div>
      <label className="holder-field">Research notes<textarea rows={5} maxLength={10000} placeholder="What are you watching?" value={draft.notes} onChange={e => setDraft(current => ({ ...current, notes: e.target.value }))} /></label>
      <p className="holder-note">Includes your current GPU, chart range, search and {capture().templates.length} saved strategy templates. Loading merges templates into this browser. Your research is private to your signed-in wallet.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="holder-actions"><button className="button primary" disabled={busy || !session.account?.eligible || !name.trim()} onClick={() => void save(false)}><Save size={14} />{busy ? "Saving…" : selected ? "Save changes" : "Save workspace"}</button>{selected && <button className="button" disabled={busy || !session.account?.eligible || session.workspaces.length >= 5 || !name.trim()} onClick={() => void save(true)}><Plus size={14} />Save as new</button>}<button className="text-button" onClick={() => { try { load({ ...capture(), watchlist: draft.watchlist, notes: draft.notes }); setError(""); notify("Watchlist applied to this terminal. Save to keep it across devices."); } catch (e) { setError((e as Error).message); } }}>Apply watchlist</button></div>
      {selected && <p className="holder-note">Editing {selected.name}, version {selected.revision}. A newer save on another device is protected from overwrites.</p>}
    </div>
  </div>;
}

function AdvancedAlerts({ session, markets, notify }: { session: Session; markets: Market[]; notify: (message: string) => void }) {
  const [name, setName] = useState("H100 watch");
  const [conditions, setConditions] = useState<AlertCondition[]>([{ market: "h100-sxm", kind: "change", direction: "below", threshold: -3 }]);
  const [recurring, setRecurring] = useState(true), [cooldown, setCooldown] = useState<AdvancedRequest["cooldown_minutes"]>(60);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const inbox = session.inbox;
  const act = async (work: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(""); try { await work(); await session.refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const patch = (index: number, update: Partial<AlertCondition>) => setConditions(rows => rows.map((row, i) => i === index ? { ...row, ...update } : row));
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const enablePush = () => act(async () => {
    if (!supported || !inbox?.vapid_public_key) throw new Error("This browser cannot enable notifications here. Your wallet inbox still works.");
    if (await Notification.requestPermission() !== "granted") throw new Error("Notifications were not enabled. Your wallet inbox still works.");
    await navigator.serviceWorker.register("/alerts-sw.js", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;
    const text = inbox.vapid_public_key.replace(/-/g, "+").replace(/_/g, "/");
    const key = Uint8Array.from(atob(text + "=".repeat((4 - text.length % 4) % 4)), char => char.charCodeAt(0));
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    // Explicit opt-in transfers this browser's notification destination; basic inbox events remain.
    const basic = await monitoring.inbox(); await monitoring.stopPush();
    try { await holderApi(session.address, "/alerts/push", { method: "POST", body: JSON.stringify(subscription.toJSON()) }); }
    catch (e) { if (basic.push_enabled) await monitoring.push(subscription.toJSON()).catch(() => {}); else if (!existing) await subscription.unsubscribe(); throw e; }
    notify("This browser now receives your holder alerts.");
  });
  return <div className="holder-advanced" role="tabpanel" aria-label="Advanced alerts">
    <div className="holder-rule-editor"><label className="holder-field">Alert name<input value={name} maxLength={80} onChange={e => setName(e.target.value)} /></label><div className="holder-section-title"><h3>When all conditions match</h3><span>AND</span></div>
      {conditions.map((condition, index) => <div className="holder-condition" key={index}><div className="holder-condition-top"><span>Condition {index + 1}</span>{conditions.length > 1 && <button className="icon-button" aria-label={`Remove condition ${index + 1}`} onClick={() => setConditions(rows => rows.filter((_, i) => index !== i))}><Trash2 size={13} /></button>}</div>
        <label className="holder-field">Signal<select aria-label={`Signal ${index + 1}`} value={condition.kind} onChange={e => { const kind = e.target.value as AlertCondition["kind"]; patch(index, { kind, market: kind === "benchmark" ? "h100-sxm" : condition.market, threshold: kind === "benchmark" ? null : kind === "price" ? 2 : -3 }); }}><option value="change">24-hour change (%)</option><option value="price">Rental price ($ / GPU-hour)</option><option value="benchmark">All five H100 providers fresh</option></select></label>
        {condition.kind !== "benchmark" && <div className="holder-condition-fields"><label className="holder-field">GPU<select aria-label={`GPU ${index + 1}`} value={condition.market} onChange={e => patch(index, { market: e.target.value as AlertCondition["market"] })}>{markets.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="holder-field">Direction<select aria-label={`Direction ${index + 1}`} value={condition.direction} onChange={e => patch(index, { direction: e.target.value as AlertCondition["direction"] })}><option value="below">At or below</option><option value="above">At or above</option></select></label><label className="holder-field">{condition.kind === "change" ? "Percent" : "USD / hr"}<input aria-label={`Threshold ${index + 1}`} type="number" min={condition.kind === "price" ? .0001 : -99} max={1000} step="any" value={condition.threshold ?? ""} onChange={e => patch(index, { threshold: e.target.value === "" ? null : Number(e.target.value) })} /></label></div>}
      </div>)}
      <button className="text-button" disabled={conditions.length >= 3} onClick={() => setConditions(rows => [...rows, { market: "h100-sxm", kind: "benchmark", direction: "below", threshold: null }])}><Plus size={14} />Add condition</button>
      <div className="holder-recurring"><label><input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />Keep watching after a trigger</label><label className="holder-field">Minimum time between alerts<select aria-label="Alert cooldown" disabled={!recurring} value={cooldown} onChange={e => setCooldown(Number(e.target.value) as AdvancedRequest["cooldown_minutes"])}>{[[5, "5 minutes"], [15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [240, "4 hours"], [1440, "24 hours"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <p className="holder-note">Recurring rules rearm after an observed non-match, then wait for the cooldown before firing again. Missing price data cannot reset a rule. Rules expire after 90 days.</p><p className="holder-note">Percentage changes compare matching provider baskets using recorded 24-hour receipts. Insufficient history or a changed basket pauses that condition.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="button primary" disabled={busy || !session.account?.eligible || !inbox || inbox.rules.length >= 100 || !name.trim()} onClick={() => void act(async () => { await holderApi(session.address, "/alerts", { method: "POST", body: JSON.stringify({ name, conditions, recurring, cooldown_minutes: cooldown }) }); notify("Advanced alert saved. Silicon will keep watching on the server."); })}><Bell size={14} />Save advanced alert</button>
    </div>
    {inbox && <div className="holder-alert-history"><div className="holder-section-title"><h3>Your rules</h3><span>{inbox.rules.length} / 100</span></div>{!inbox.rules.length && <p className="holder-note">Your saved rules will appear here.</p>}
      <div className="holder-rules">{inbox.rules.map(rule => <article key={rule.id}><div><strong>{rule.name}</strong><span>{statuses[rule.status]} · {rule.recurring ? "Recurring" : "Once"}</span><small>{rule.conditions.map(c => c.kind === "benchmark" ? "Five fresh H100 providers" : `${markets.find(m => m.id === c.market)?.name ?? c.market} ${c.direction === "above" ? "≥" : "≤"} ${c.kind === "price" ? "$" : ""}${c.threshold}${c.kind === "change" ? "% / 24h" : "/hr"}`).join(" · AND · ")}</small><small>Expires {new Date(rule.expires_at).toLocaleDateString()}{rule.last_triggered_at && ` · Last fired ${new Date(rule.last_triggered_at).toLocaleString()}`}</small></div><button className="icon-button" aria-label={`Remove rule ${rule.name}`} disabled={busy} onClick={() => void act(() => holderApi(session.address, `/alerts/${rule.id}`, { method: "DELETE" }))}><Trash2 size={14} /></button></article>)}</div>
      <div className="holder-notifications"><h3>Notifications</h3><p className="holder-note">Your inbox follows your wallet. Push goes to the most recently enabled browser and continues after sign-out. Enabling it here moves this browser's basic-alert notifications to holder alerts; both inboxes keep their events.</p>{inbox.push_enabled && <button className="button" disabled={busy} onClick={() => void act(() => holderApi(session.address, "/alerts/push/subscription", { method: "DELETE" }))}>Disable holder notifications</button>}<button className="button" disabled={busy || !session.account?.eligible || !supported || !inbox.push_available} onClick={() => void enablePush()}>{inbox.push_enabled ? "Switch notifications to this browser" : "Use this browser for holder notifications"}</button>{(!supported || !inbox.push_available) && <p className="holder-note">Browser notifications are unavailable here. The saved inbox remains available.</p>}</div>
      <div className="holder-section-title"><h3>Wallet inbox</h3><button className="text-button" disabled={busy || !inbox.events.some(e => !e.read)} onClick={() => void act(() => holderApi(session.address, "/alerts/read", { method: "POST" }))}>Mark all read</button></div>
      <div className="server-alert-events">{!inbox.events.length && <p className="holder-note">Triggered events appear here for 30 days, even while you're away.</p>}{inbox.events.map(event => <article key={event.id} className={event.read ? "" : "unread"}><p>{event.message}</p><small>{new Date(event.created_at).toLocaleString()} · {event.delivery === "sent" ? "Push sent" : event.delivery === "pending" ? "Push pending" : event.delivery === "failed" ? "Push failed, saved here" : "Inbox"}</small>{event.receipt_hash && <a className="text-button" href={`/api/v1/receipts/${event.receipt_hash}`} target="_blank" rel="noreferrer">First condition source receipt ↗</a>}</article>)}</div>
    </div>}
  </div>;
}
