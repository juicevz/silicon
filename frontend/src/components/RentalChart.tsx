import { useId, useState } from "react";
import type { Market, Point } from "../api";
import { money } from "../api";

const timeLabel = (time: number) => new Date(time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** Both views use published observations: history by timestamp, and one current
 * eligible listing per provider. No synthetic candles or interpolated samples. */
export function RentalChart({ market, points, hover, setHover }: {
  market: Market; points: Point[]; hover: number | null; setHover: (value: number | null) => void;
}) {
  const id = useId().replace(/:/g, "");
  const [view, setView] = useState<"history" | "providers" | null>(null);
  const mode = view ?? (points.length > 1 ? "history" : "providers");
  const unique = new Map<string, NonNullable<Market["providers"]>[number]>();
  for (const row of [...(market.providers ?? [])].sort((a, b) => a.price - b.price)) {
    if (!unique.has(row.id) || (row.included && !unique.get(row.id)!.included)) unique.set(row.id, row);
  }
  const providers = [...unique.values()];
  const historyValues = points.map(p => p.price);
  const values = mode === "history" ? historyValues : providers.map(p => p.price);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;
  const pad = Math.max((high - low) * .22, high * .008, .005);
  const floor = Math.max(0, low - pad), ceiling = high + pad;
  const start = points.length ? new Date(points[0].time).getTime() : Date.now();
  const end = points.length > 1 ? new Date(points[points.length - 1].time).getTime() : start + 3600000;
  const x = (p: Point) => 12 + (new Date(p.time).getTime() - start) / (end - start) * 552;
  const y = (price: number) => 174 - (price - floor) / (ceiling - floor) * 152;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p)},${y(p.price)}`).join(" ");
  const active = hover == null ? null : points[Math.min(hover, points.length - 1)];
  const enough = mode === "history" && points.length > 1;
  const ranked = [...providers].sort((a, b) => Number(b.included) - Number(a.included) || a.price - b.price).slice(0, 6);
  const last = points.at(-1);
  const chartKey = `${market.id}-${mode}`;
  return <div className="rental-chart-detail">
    <div className="rental-chart-toolbar">
      <span>USD / GPU-hour <span className="chart-observation-count">· {mode === "history" ? `${points.length} observations` : `${providers.length} providers`}</span></span>
      <div className="chart-view-switch" aria-label="Chart view">
        {(["history", "providers"] as const).map(v => <button type="button" key={v} aria-pressed={mode === v} onClick={() => { setView(v); setHover(null); }}>{v === "history" ? "History" : "Providers"}</button>)}
      </div>
    </div>
    <div className="benchmark-chart detailed-chart" key={chartKey}
      tabIndex={enough ? 0 : undefined} role={enough ? "slider" : "img"}
      aria-label={enough ? "Explore rental price history" : mode === "providers" ? `${market.name} provider rental prices` : "Rental price history is collecting"}
      aria-valuemin={enough ? 0 : undefined} aria-valuemax={enough ? points.length - 1 : undefined}
      aria-valuenow={enough ? hover ?? points.length - 1 : undefined}
      aria-valuetext={active ? `${timeLabel(new Date(active.time).getTime())} UTC, $${money(active.price, 3)}` : undefined}
      onPointerMove={event => {
        if (!enough) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const target = start + Math.max(0, Math.min(1, ((event.clientX - rect.left) / rect.width * 640 - 12) / 552)) * (end - start);
        let closest = 0;
        points.forEach((p, i) => { if (Math.abs(new Date(p.time).getTime() - target) < Math.abs(new Date(points[closest].time).getTime() - target)) closest = i; });
        setHover(closest);
      }} onPointerLeave={() => setHover(null)}
      onKeyDown={event => {
        if (!enough || !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
        event.preventDefault();
        setHover(event.key === "Escape" ? null : event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, (hover ?? points.length - 1) + (event.key === "ArrowLeft" ? -1 : 1))));
      }}>
      {mode === "history" ? <>
        <svg className="rental-history-svg" viewBox="0 0 640 216" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".17" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
          {[0, .25, .5, .75, 1].map(t => <g key={t} className="chart-gridline"><line x1="12" x2="564" y1={22 + t * 152} y2={22 + t * 152} /><text x="579" y={26 + t * 152}>${money(ceiling - t * (ceiling - floor), 3)}</text></g>)}
          {[0, .25, .5, .75, 1].map(t => <g key={t} className="chart-gridline chart-time-grid"><line x1={12 + t * 552} x2={12 + t * 552} y1="22" y2="174" /><text x={12 + t * 552} y="202" textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}>{timeLabel(start + t * (end - start))}</text></g>)}
          {points.length > 1 && <path d={`${path} L${x(last!)},174 L${x(points[0])},174 Z`} fill={`url(#area-${id})`} />}
          {points.length > 0 && <>
            <line className="chart-current-line" x1="12" x2="564" y1={y(last!.price)} y2={y(last!.price)} />
            <path className="chart-price-line" d={path} />
            {points.length <= 36 && points.map(p => <circle key={p.time} className="chart-sample" cx={x(p)} cy={y(p.price)} r="2" />)}
            <circle cx={x(last!)} cy={y(last!.price)} r="4" fill="currentColor" />
          </>}
          {active && <g className="history-crosshair"><line x1={x(active)} x2={x(active)} y1="14" y2="180" /><line x1="12" x2="564" y1={y(active.price)} y2={y(active.price)} /><circle cx={x(active)} cy={y(active.price)} r="5" /></g>}
        </svg>
        <div className="history-y-labels" aria-hidden="true">{[0, .25, .5, .75, 1].map(t => <span key={t}>${money(ceiling - t * (ceiling - floor), 3)}</span>)}</div>
        <div className="history-x-labels" aria-hidden="true">{[0, .25, .5, .75, 1].map(t => <span key={t}>{points.length > 1 ? timeLabel(start + t * (end - start)) : t === .5 ? "UTC" : ""}</span>)}</div>
        {active && <div className="chart-tooltip rental-tooltip" style={{ left: `${Math.max(18, Math.min(78, x(active) / 640 * 100))}%` }}>{timeLabel(new Date(active.time).getTime())} UTC · ${money(active.price, 3)}</div>}
        {points.length < 2 && <div className="history-collecting">{points.length ? "First observation recorded. History grows with each source update." : "History begins with the first complete reference."}</div>}
      </> : <div className="provider-price-plot">
        {ranked.map(p => <div key={p.id} className="provider-price-bar">
          <span>{p.provider}</span><div><i style={{ width: `${Math.max(1, p.price / Math.max(...ranked.map(r => r.price)) * 100)}%` }} data-included={p.included} /></div><strong>${money(p.price, 3)}</strong>
        </div>)}
        {!ranked.length && <div className="history-collecting">Waiting for eligible provider quotes.</div>}
        {ranked.length > 0 && <div className="provider-plot-legend"><i />Included listing <span>{providers.length > 6 ? `6 of ${providers.length} providers shown` : market.id === "h100-sxm" ? "Reference listing where available" : "Lowest eligible rate per provider"}</span></div>}
      </div>}
    </div>
    <div className="chart-statistics">
      <div><span>{mode === "history" ? "Period low" : "Lowest listing"}</span><strong>{values.length ? `$${money(low, 3)}` : "—"}</strong></div>
      <div><span>{mode === "history" ? "Period high" : "Highest listing"}</span><strong>{values.length ? `$${money(high, 3)}` : "—"}</strong></div>
      <div><span>Reference coverage</span><strong>{market.coverage}<small> / {market.required_providers || (market.id === "h100-sxm" ? 5 : 3)} required</small></strong></div>
    </div>
  </div>;
}
