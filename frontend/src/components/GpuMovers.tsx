import { useCallback, useEffect, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { money } from "../api";
import { monitoring, type Movers } from "../monitoring-api";
import { Change, RequestError } from "./ui";
import "./Monitoring.css";

export default function GpuMovers({ select }: { select: (market: string) => void }) {
  const [data, setData] = useState<Movers | null>(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);
  const load = useCallback(async () => {
    try { setData(await monitoring.movers()); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 60000); return () => clearInterval(timer); }, [load]);
  return <section className="panel gpu-movers" aria-label="GPU price movers">
    <div className="panel-heading"><h2><ArrowUpDown size={14} />GPU price movers</h2><span className="eyebrow">24H / RENTAL REFERENCES</span></div>
    <p className="monitor-note">Largest recorded moves, with the same provider basket. Each comparison ends at its latest source observation.</p>
    {error && <RequestError message={error} retry={() => void load()} />}
    {!data && !error && <p className="monitor-note" role="status">Loading recorded changes.</p>}
    {data && !error && <>
      <div className="movers-scroll"><table><thead><tr><th>GPU</th><th>USD / GPU-hr</th><th>24h move</th><th>Providers</th><th>Evidence</th></tr></thead><tbody>
        {(all ? data.markets : data.markets.slice(0, 5)).map(row => <tr key={row.market}>
          <td><button className="text-button" onClick={() => select(row.market)}>{row.name}</button></td>
          <td className="mono">{money(row.price, 4)}{row.status === "stale" && <small>Archived</small>}</td>
          <td>{row.change_pct != null ? <Change value={row.change_pct} /> : <span className="muted">{row.status === "stale" ? "Withheld / stale" : row.status === "basket_changed" ? "Basket changed" : "Need 24h history"}</span>}</td>
          <td className="mono">{row.coverage}/{row.required_providers}</td>
          <td><details><summary>Source details</summary><div className="mover-evidence">
            <span>Latest: {row.source_time ? new Date(row.source_time).toLocaleString() : "Awaiting source"}</span>
            {row.baseline_time && <span>Baseline: {new Date(row.baseline_time).toLocaleString()}</span>}
            {row.receipt_hash && <a href={`/api/v1/receipts/${row.receipt_hash}`} target="_blank" rel="noreferrer">Latest receipt ↗</a>}
            {row.baseline_receipt_hash && <a href={`/api/v1/receipts/${row.baseline_receipt_hash}`} target="_blank" rel="noreferrer">Baseline receipt ↗</a>}
            {(row.provider_moves ?? []).map((provider, i) => <div key={i}><a href={provider.source_url} target="_blank" rel="noreferrer">{provider.provider} ↗</a><span>${money(provider.previous, 4)} → ${money(provider.current, 4)}</span><Change value={provider.change_pct} /></div>)}
            {!row.provider_moves?.length && <span>No comparable provider price changes recorded.</span>}
          </div></details></td>
        </tr>)}
      </tbody></table></div>
      {data.markets.length > 5 && <button className="text-button movers-toggle" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${data.markets.length} GPUs`}</button>}
    </>}
  </section>;
}
