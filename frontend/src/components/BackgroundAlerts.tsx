import { useCallback, useEffect, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { money, type Market } from "../api";
import { monitoring, type AlertInbox, type AlertRequest } from "../monitoring-api";
import { RequestError } from "./ui";
import "./Monitoring.css";

export type LegacyAlert = { id: string; market: string; price: number; direction: "above" | "below"; triggered: boolean };
export function useAlertInbox() {
  const [inbox, setInbox] = useState<AlertInbox | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try { setInbox(await monitoring.inbox()); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 30000); return () => clearInterval(timer); }, [refresh]);
  return { inbox, error, refresh };
}

export default function BackgroundAlerts({ market, markets, state, notify, legacy, migrated, localLimit, saveLocal }: {
  market: Market | undefined;
  markets: Market[];
  state: ReturnType<typeof useAlertInbox>;
  notify: (message: string) => void;
  legacy: LegacyAlert[];
  migrated: (id: string) => void;
  localLimit: number;
  saveLocal: (rule: LegacyAlert) => void;
}) {
  const { inbox, error, refresh } = state;
  const [kind, setKind] = useState<"price" | "provider" | "recovery">("price");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [price, setPrice] = useState(String(market?.price ?? ""));
  const [delivery, setDelivery] = useState<"server" | "browser">("server");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const act = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setActionError("");
    try { await work(); await refresh(); }
    catch (e) { setActionError((e as Error).message); }
    finally { setBusy(false); }
  };
  const save = () => act(async () => {
    if (!market) throw new Error("Choose a GPU first.");
    const value = Number(price);
    if (kind === "price" && (!Number.isFinite(value) || value <= 0 || value >= 1000)) throw new Error("Enter a rental price between zero and $1,000.");
    if (kind === "price" && delivery === "browser") {
      if (legacy.length >= localLimit) throw new Error("Remove a browser alert before adding another.");
      saveLocal({ id: crypto.randomUUID(), market: market.id, price: value, direction, triggered: false });
      notify("Price alert saved on this browser. It runs while Silicon is open.");
      return;
    }
    await monitoring.create({ market: (kind === "recovery" ? "h100-sxm" : market.id) as AlertRequest["market"], kind, direction, price: kind === "price" ? value : null });
    notify("Background alert saved. Silicon keeps monitoring when this tab closes.");
  });
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const enablePush = () => act(async () => {
    if (!supported || !inbox?.vapid_public_key) throw new Error("Browser push is unavailable here. Your server inbox still works.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notifications were not enabled. You can still read alerts in the inbox.");
    await navigator.serviceWorker.register("/alerts-sw.js", { scope: "/" });
    const registration = await navigator.serviceWorker.ready;
    const text = inbox.vapid_public_key.replace(/-/g, "+").replace(/_/g, "/");
    const key = Uint8Array.from(atob(text + "=".repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    try { await monitoring.push(subscription.toJSON()); }
    catch (e) { if (!existing) await subscription.unsubscribe(); throw e; }
    notify("Browser notifications enabled.");
  });
  const disablePush = () => act(async () => {
    await monitoring.stopPush();
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/") : undefined;
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
    notify("Browser notifications disabled. Server alerts remain in your inbox.");
  });
  return <div className="modal-body background-alerts">
    <p>Silicon checks your rules on the server, even while this tab is closed. Each rule fires once and expires after 90 days. Price alerts use fresh published references.</p>
    {error && <RequestError message={error} retry={() => void refresh()} />}
    {actionError && <p className="inline-error" role="alert">{actionError}</p>}
    {!inbox && !error && <p role="status">Loading your alert inbox.</p>}
    {inbox && <>
      <label className="monitor-label">Watch<select aria-label="Alert type" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="price">Price threshold</option><option value="provider">Provider listing price change</option><option value="recovery">H100 benchmark recovery</option></select></label>
      {kind === "price" && <label className="monitor-label">Monitoring<select aria-label="Alert monitoring" value={delivery} onChange={e => setDelivery(e.target.value as typeof delivery)}><option value="server">Server · works while away</option><option value="browser">This browser · while open</option></select></label>}
      {kind === "price" && <div className="alert-form"><select aria-label="Alert direction" value={direction} onChange={e => setDirection(e.target.value as typeof direction)}><option value="above">At or above</option><option value="below">At or below</option></select><div className="amount-input"><span>$</span><input aria-label="Alert rental price" type="number" min="0.0001" max="999.9999" step="0.01" value={price} onChange={e => setPrice(e.target.value)} /><span>/hr</span></div></div>}
      {kind === "provider" && <p className="monitor-note">Watches the same provider, instance and region. Coverage changes alone do not count as price moves.</p>}
      {kind === "recovery" && <p className="monitor-note">Fires when the H100 reference recovers from withheld or stale data to all five fresh providers. It does not open trading.</p>}
      <button className="button primary full-width" disabled={busy || !!error || (kind === "price" && delivery === "browser" ? legacy.length >= localLimit : inbox.rules.length >= inbox.limit)} onClick={() => void save()}><Bell size={13} />{kind === "price" && delivery === "browser" ? "Save browser alert" : "Save background alert"}</button>
      <div className="push-controls"><div><strong>Browser notifications</strong><p className="monitor-note">Optional. Delivery depends on your browser and device. The inbox keeps the event if push fails.</p></div>{inbox.push_enabled ? <button className="button" disabled={busy} onClick={() => void disablePush()}>Disable notifications</button> : <button className="button" disabled={busy || !supported || !inbox.push_available} onClick={() => void enablePush()}>Enable notifications</button>}</div>
      {(!supported || !inbox.push_available) && <p className="monitor-note">{!supported ? "This browser does not support push here. On iPhone or iPad, use the installed Home Screen app." : "Browser push is not configured yet. Server monitoring is available."}</p>}
      <h3>Watching · {inbox.rules.length}/{inbox.limit}</h3>
      {!inbox.rules.length && <p className="monitor-note">No background alerts yet.</p>}
      <div className="server-alert-rules">{inbox.rules.map(rule => <div key={rule.id}><span><strong>{markets.find(m => m.id === rule.market)?.name ?? rule.market}</strong><small>{rule.kind === "price" ? `${rule.direction === "above" ? "≥" : "≤"} $${money(rule.price, 4)}/hr` : rule.kind === "provider" ? "Provider price change" : "Benchmark recovery"}</small></span><span className="muted">{rule.triggered_at ? "Triggered" : new Date(rule.expires_at).getTime() <= Date.now() ? "Expired" : "Watching"}<small>Expires {new Date(rule.expires_at).toLocaleDateString()}</small></span><button className="icon-button" aria-label={`Remove background alert ${rule.id}`} disabled={busy} onClick={() => void act(() => monitoring.remove(rule.id))}><Trash2 size={14} /></button></div>)}</div>
      <div className="alert-inbox-heading"><h3>Inbox</h3><button className="text-button" disabled={busy || !inbox.events.some(e => !e.read)} onClick={() => void act(() => monitoring.read())}>Mark all read</button></div>
      <div className="server-alert-events" aria-live="polite">{!inbox.events.length && <p className="monitor-note">Triggered alerts will appear here. Events are kept for 30 days.</p>}{inbox.events.map(event => <article key={event.id} className={event.read ? "" : "unread"}><p>{event.message}</p><small>{new Date(event.created_at).toLocaleString()} · {event.delivery === "sent" ? "Push sent" : event.delivery === "failed" ? "Push failed, saved here" : event.delivery === "pending" ? "Push pending" : "Inbox"}</small>{event.source_time && <small>Source: {new Date(event.source_time).toLocaleString()}</small>}{event.receipt_hash && <a className="text-button" href={`/api/v1/receipts/${event.receipt_hash}`} target="_blank" rel="noreferrer">Source receipt ↗</a>}</article>)}</div>
    </>}
    {legacy.length > 0 && <details className="legacy-alerts"><summary>Browser alerts · {legacy.length}/{localLimit}</summary><p className="monitor-note">These still run while Silicon is open. Move an untriggered rule to the server to watch it in the background.</p>{legacy.map(rule => <div key={rule.id}><span>{rule.market} {rule.direction} ${money(rule.price, 4)}</span><button className="text-button" disabled={busy || !inbox || rule.triggered} onClick={() => void act(async () => { await monitoring.create({ market: rule.market as AlertRequest["market"], kind: "price", direction: rule.direction, price: rule.price }); migrated(rule.id); })}>{rule.triggered ? "Triggered locally" : "Move to server"}</button><button className="icon-button" aria-label={`Remove browser alert ${rule.id}`} disabled={busy} onClick={() => migrated(rule.id)}><Trash2 size={14} /></button></div>)}</details>}
    <p className="monitor-note">Private to this browser cookie. Clearing site data loses inbox access. No wallet is required. Server alerts have a separate 20-rule limit.</p>
  </div>;
}
