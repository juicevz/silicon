import { lazy, Suspense, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ArrowUpRight,
  Bell,
  Check,
  Info,
  Search,
  X,
} from "lucide-react";
import { money, timeAgo, type Market } from "../api";
import { Change, Dot, External, Modal, Sparkline } from "./ui";
import { SourceEvidence } from "./TerminalInsights";
import { AnimatedNumber } from "./AnimatedNumber";
import { RentalChart } from "./RentalChart";
const Gpu = lazy(() => import("./Gpu"));

export function AssetCards({ markets, selected, select, range, info }: {
  markets: Market[]; selected: string; select: (id: string) => void;
  range: string; info: (m: Market) => void;
}) {
  const [family, setFamily] = useState("All GPUs");
  const families = ["All GPUs", "Blackwell", "Hopper", "Ada", "Ampere", "Turing"];
  const rows = markets.filter(m => family === "All GPUs" || m.architecture.includes(family));
  return <section className="gpu-market-catalog" aria-label="GPU market catalogue">
    <div className="catalog-filters">
      <div aria-label="GPU architecture">{families.map(value => <button type="button" key={value} aria-pressed={family === value} onClick={() => setFamily(value)}>{value}</button>)}</div>
      <span>{rows.length} models</span>
    </div>
    <div className="catalog-column-head" aria-hidden="true"><span>GPU model</span><span>Reference / hr</span><span>{range} change</span><span>Providers</span><span>History</span><span /></div>
    <div className="asset-grid catalog-rows" data-lenis-prevent>
      {rows.map((market, i) => <article key={market.id} className={`asset-card catalog-row ${market.color} ${selected === market.id ? "active" : ""}`} style={{ animationDelay: `${Math.min(i, 7) * 22}ms` }}>
        <button type="button" className="asset-click" aria-label={`Select ${market.name}`} aria-pressed={selected === market.id} onClick={() => select(market.id)}>
          <span className="catalog-identity">
            <span className="asset-gpu"><Suspense fallback={<span className="gpu-model gpu-fallback" />}><Gpu model={market.id} /></Suspense></span>
            <span><strong>{market.name}</strong><small>{market.memory} <span>· {market.architecture}</span></small></span>
          </span>
          <span className="catalog-rate"><AnimatedNumber value={market.price == null ? "—" : `$${money(market.price, 3)}`} /><small>{market.stale ? (market.price == null ? "Awaiting coverage" : "Last reference") : market.id === "h100-sxm" ? "Benchmark" : "Reference"}</small></span>
          <span className="catalog-change"><Change value={market.changes?.[range]} /></span>
          <span className="catalog-coverage"><Dot state={market.stale ? "gold" : "green"} />{market.coverage}<small>sources</small></span>
          <span className="asset-spark"><Sparkline points={market.history ?? []} color={market.color} /></span>
          <ArrowUpRight className="catalog-arrow" size={14} />
        </button>
        <button type="button" className="asset-info icon-button" aria-label={`${market.name} source information`} onClick={() => info(market)}><Info size={13} /></button>
      </article>)}
      {!rows.length && <div className="table-empty">No GPUs match this search. Try another model or architecture.</div>}
    </div>
  </section>;
}

export function ProviderTable({
  market,
  full = false,
}: {
  market: Market;
  full?: boolean;
}) {
  const [filter, setFilter] = useState(""),
    [sort, setSort] = useState(true),
    [scope, setScope] = useState("all");
  const rows = useMemo(
    () =>
      [...(market.providers ?? [])]
        .filter(
          (p) =>
            (scope === "all" || p.included) &&
            `${p.provider} ${p.region ?? ""}`
              .toLowerCase()
              .includes(filter.toLowerCase()),
        )
        .sort((a, b) => (sort ? a.price - b.price : b.price - a.price)),
    [market.providers, filter, sort, scope],
  );
  return (
    <section className="panel providers">
      <div className="panel-heading">
        <h2>
          Provider comparison <span className="count mono">{rows.length}</span>
        </h2>
        <div className="segmented">
          <button
            className={scope === "all" ? "active" : ""}
            onClick={() => setScope("all")}
          >
            All rates
          </button>
          <button
            className={scope === "index" ? "active" : ""}
            onClick={() => setScope("index")}
          >
            Index only
          </button>
        </div>
      </div>
      <div className="table-tools">
        <div className="search-field">
          <Search size={13} />
          <input
            aria-label="Search providers"
            placeholder="Search providers"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => setFilter("")}
            >
              <X size={11} />
            </button>
          )}
        </div>
        <span className="eyebrow">ON-DEMAND · USD / GPU-HR</span>
      </div>
      <div className={`provider-scroll ${full ? "expanded" : ""}`}>
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Configuration</th>
              <th>
                <button onClick={() => setSort(!sort)}>
                  Hourly rate
                  <ArrowDownUp size={11} />
                </button>
              </th>
              <th>Reference</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={`${p.id}-${p.region}-${i}`}>
                <td>
                  <span
                    className={`provider-initial ${p.included ? "included" : ""}`}
                  >
                    {p.provider.slice(0, 1)}
                  </span>
                  <span>{p.provider}</span>
                </td>
                <td className="muted">
                  {p.region ?? p.instance ?? "Published listing"}
                </td>
                <td className="mono">${money(p.price, 3)}</td>
                <td>
                  {p.included ? (
                    <span className="included-label">
                      <Check size={11} />
                      Included
                    </span>
                  ) : (
                    <span className="muted">Comparison</span>
                  )}
                </td>
                <td>
                  <a
                    href={p.source_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${p.provider} pricing`}
                  >
                    <ArrowUpRight size={13} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="table-empty">No matching provider quotes.</div>
        )}
      </div>
      <div className="panel-footnote">
        <External href="https://gpueconomy.com/data">
          GPU Economy · CC BY 4.0
        </External>
        <span>Published rates, not executed rentals.</span>
      </div>
    </section>
  );
}

export function Benchmark({ market, range, setRange, info, alert }: {
  market: Market; range: string; setRange: (r: string) => void;
  info: () => void; alert: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const points = (market.history ?? []).filter(p => new Date(p.time).getTime() > Date.now() - Number(range.replace("h", "")) * 3600000);
  const selectedPoint = hover == null ? null : points[Math.min(hover, points.length - 1)];
  return <section className="panel benchmark">
    <div className="panel-heading">
      <h2>{market.name} rental reference<button className="icon-button" aria-label="Benchmark methodology" onClick={info}><Info size={12} /></button></h2>
      <div className="benchmark-tools">
        <button className="text-button alert-action" onClick={alert}><Bell size={12} />Set alert</button>
        <div className="segmented">{["1h", "6h", "24h"].map(v => <button key={v} className={range === v ? "active" : ""} onClick={() => { setHover(null); setRange(v); }}>{v}</button>)}</div>
      </div>
    </div>
    <div className="benchmark-summary">
      <strong className="mono"><AnimatedNumber value={selectedPoint?.price != null || market.price != null ? `$${money(selectedPoint?.price ?? market.price, 3)}` : "—"} /><small>/ GPU-hour</small></strong>
      <Change value={market.changes?.[range]} />
      <span className="benchmark-index mono">INDEX <strong>{money(market.index)}</strong></span>
    </div>
    <RentalChart key={market.id} market={market} points={points} hover={hover} setHover={setHover} />
    <div className="benchmark-footer">
      <span><Dot state={market.stale ? "gold" : "green"} />{market.stale ? market.price == null ? "More provider coverage needed" : "Source needs refresh" : "Sources confirmed"} · {timeAgo(market.source_updated_at)}</span>
      <button className="text-button" onClick={info}>View methodology<ArrowUpRight size={12} /></button>
    </div>
  </section>;
}

export function AssetDetail({
  market,
  close,
}: {
  market: Market;
  close: () => void;
}) {
  return (
    <Modal title={`${market.name} · reference details`} close={close} wide>
      <div className="asset-detail">
        <div className="detail-stats">
          <div>
            <span>Rental reference</span>
            <strong className="mono">${money(market.price, 4)} / hr</strong>
          </div>
          <div>
            <span>Index</span>
            <strong className="mono">{money(market.index)}</strong>
          </div>
          <div>
            <span>Coverage</span>
            <strong className="mono">{market.coverage} providers</strong>
          </div>
        </div>
        <p>
          {market.id === "h100-sxm"
            ? "Equal-provider median of five fixed H100 SXM listings: Lambda, Hyperstack, Verda, Crusoe and Nebius. USD on-demand full-instance rates, normalized per GPU-hour. All five must be confirmed within three hours."
            : "Median of each provider’s cheapest eligible USD on-demand instance listing. This comparison reference is not a tradable benchmark."}
        </p>
        <div className="detail-meta">
          <span>Source update</span>
          <strong className="mono">
            {market.source_updated_at
              ? new Date(market.source_updated_at).toUTCString()
              : "Awaiting source"}
          </strong>
          <span>Collected by Silicon</span>
          <strong className="mono">
            {market.collected_at
              ? new Date(market.collected_at).toUTCString()
              : "Collecting"}
          </strong>
          <span>History began</span>
          <strong className="mono">
            {market.history_since
              ? new Date(market.history_since).toUTCString()
              : "Collecting"}
          </strong>
          <span>Source and license</span>
          <External href="https://gpueconomy.com/data">
            GPU Economy · CC BY 4.0
          </External>
        </div>
        <ProviderTable market={market} full />
        <SourceEvidence key={market.id} market={market} />
      </div>
    </Modal>
  );
}
