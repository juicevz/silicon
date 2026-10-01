import { useEffect, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { computeApi, usageCost, type ComputeKey } from "../compute-api";

export default function ApiKeyControls({ value, changed, revoked }: { value: ComputeKey; changed: () => void; revoked: (id: string) => void }) {
  const [limit, setLimit] = useState(value.limit_usd ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setLimit(value.limit_usd ?? ""), [value.id, value.limit_usd]);
  const update = async (body: { paused?: boolean; limit_usd?: string | null }) => {
    if (busy) return;
    setBusy(true); setError("");
    try { await computeApi<ComputeKey>(`/keys/${encodeURIComponent(value.id)}`, { method: "PATCH", body: JSON.stringify(body) }); changed(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const save = () => {
    if (limit.trim() && (!Number.isFinite(Number(limit)) || Number(limit) < 0 || Number(limit) > 100000 || !/^\d+(?:\.\d{1,9})?$/.test(limit))) { setError("Use a USD amount from 0 to 100,000, with up to nine decimals."); return; }
    void update({ limit_usd: limit.trim() ? limit : null });
  };
  const remove = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { await computeApi<void>(`/keys/${encodeURIComponent(value.id)}`, { method: "DELETE" }); revoked(value.id); changed(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <article className="compute-key-card" aria-label={`API key ${value.name}`}>
    <div className="compute-key-card-heading"><div><strong>{value.name}</strong><code>{value.prefix}</code><span>{value.revoked ? "Revoked" : value.paused ? "Paused" : "Active"}</span></div><Link className="text-button" to={`/compute?view=usage&key=${encodeURIComponent(value.id)}`}>View usage ↗</Link></div>
    <div className="compute-key-metrics"><div><span>Lifetime cap</span><strong>{value.limit_usd == null ? "Account cap" : usageCost(value.limit_usd)}</strong></div><div><span>Used</span><strong>{usageCost(value.used_usd ?? "0")}</strong></div><div><span>Pending holds</span><strong>{usageCost(value.pending_usd ?? "0")}</strong></div><div><span>Key room</span><strong>{value.available_usd == null ? "Account cap" : usageCost(value.available_usd)}</strong></div><div><span>Requests</span><strong>{value.request_count ?? 0}</strong></div></div>
    <p className="compute-note">{value.last_used_at ? `Last used ${new Date(value.last_used_at * 1000).toLocaleString()}. ` : "Not used yet. "}Account capacity also applies. Pausing blocks new requests; active requests keep their holds.</p>
    {!value.revoked && <div className="compute-key-budget-actions"><label htmlFor={`limit-${value.id}`}>Lifetime cap in USD<input id={`limit-${value.id}`} aria-label={`Lifetime cap for ${value.name}`} type="text" inputMode="decimal" placeholder="Account cap" value={limit} onChange={e => setLimit(e.target.value)} /></label><button className="button" disabled={busy} onClick={save}>Save cap</button><button className="button" disabled={busy} onClick={() => void update({ paused: !value.paused })} aria-label={`${value.paused ? "Resume" : "Pause"} ${value.name}`}>{value.paused ? <Play size={13} /> : <Pause size={13} />}{value.paused ? "Resume" : "Pause"}</button><button className="button" disabled={busy} aria-label={`Revoke ${value.name}`} onClick={() => void remove()}><Trash2 size={13} />Revoke</button></div>}
    {error && <p role="alert" className="inline-error">{error}</p>}
  </article>;
}
