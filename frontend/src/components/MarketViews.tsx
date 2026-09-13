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
const Gpu = lazy(() => import("./Gpu"));

export function AssetCards({
  markets,
  selected,
  select,
  range,
  info,
}: {
  markets: Market[];
  selected: string;
  select: (id: string) => void;
  range: string;
  info: (m: Market) => void;
}) {
  return (
    <div className="asset-grid">
      {markets.map((market, i) => (
        <article
          key={market.id}
          className={`asset-card ${market.color} ${selected === market.id ? "active" : ""}`}
        >
          <div
            className="asset-click"
            tabIndex={0}
            role="button"
            aria-label={`Select ${market.name}`}
            onClick={() => select(market.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(market.id);
              }
            }}
          >
            <div className="asset-card-top">
              <span className="eyebrow">
                0{i + 1} / {market.architecture.toUpperCase()}
              </span>
              <span
                className={`asset-status ${market.id === "h100-sxm" ? "purple" : ""}`}
              >
                <Dot
                  state={
                    market.stale
                      ? "gold"
                      : market.id === "h100-sxm"
                        ? "purple"
                        : "neutral"
                  }
                />
                {market.stale
                  ? "CHECKING"
                  : market.id === "h100-sxm"
                    ? "BENCHMARK"
                    : "TRACKING"}
              </span>
            </div>
            <div className="asset-main">
              <div>
                <img className="nvidia" src="/assets/nvidia.svg" alt="NVIDIA" />
                <h2>{market.name}</h2>
                <span className="asset-memory mono">{market.memory}</span>
              </div>
              <div className="asset-gpu">
                <Suspense fallback={<div className="gpu-model gpu-fallback" />}>
                  <Gpu model={market.id} />
                </Suspense>
              </div>
            </div>
            <div className="asset-price">
              <strong className="mono">
                ${money(market.price, 3)}
                <small>/hr</small>
              </strong>
              <div className="asset-spark">
                <Sparkline points={market.history ?? []} color={market.color} />
              </div>
            </div>
            <div className="asset-footer">
              <Change value={market.changes?.[range]} />
              <span>{market.coverage} providers</span>
              <ArrowUpRight size={13} />
            </div>
          </div>
          <button
            className="asset-info icon-button"
            aria-label={`${market.name} source information`}
            onClick={() => info(market)}
          >
            <Info size={13} />
          </button>
        </article>
      ))}
    </div>
  );
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

export function Benchmark({
  market,
  range,
  setRange,
  info,
  alert,
}: {
  market: Market;
  range: string;
  setRange: (r: string) => void;
  info: () => void;
  alert: () => void;
}) {
  const points = (market.history ?? []).filter(
    (p) =>
      new Date(p.time).getTime() >
      Date.now() - Number(range.replace("h", "")) * 3600000,
  );
  const enough = points.length > 1;
  return (
    <section className="panel benchmark">
      <div className="panel-heading">
        <h2>
          {market.name} rental reference
          <button
            className="icon-button"
            aria-label="Benchmark methodology"
            onClick={info}
          >
            <Info size={12} />
          </button>
        </h2>
        <div className="benchmark-tools">
          <button className="text-button alert-action" onClick={alert}>
            <Bell size={12} />
            Set alert
          </button>
          <div className="segmented">
            {["1h", "6h", "24h"].map((v) => (
              <button
                key={v}
                className={range === v ? "active" : ""}
                onClick={() => setRange(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="benchmark-summary">
        <strong className="mono">
          ${money(market.price, 3)}
          <small>/ GPU-hour</small>
        </strong>
        <Change value={market.changes?.[range]} />
        <span className="benchmark-index mono">
          INDEX <strong>{money(market.index)}</strong>
        </span>
      </div>
      <div className="benchmark-chart">
        <div className="chart-rules">
          <span />
          <span />
          <span />
        </div>
        <Sparkline points={points} large color={market.color} />
        {!enough && (
          <div className="chart-message">
            <span className="collection-mark" />
            <div>
              <strong>History starts here.</strong>
              <span>
                New observations appear as providers publish their rates.
              </span>
            </div>
          </div>
        )}
        <div className="chart-axis mono">
          <span>
            {points[0]
              ? new Date(points[0].time).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                })
              : "COLLECTING"}
          </span>
          <span>{enough ? "UTC" : "SOURCE OBSERVATIONS ONLY"}</span>
          <span>
            {points.length
              ? new Date(points[points.length - 1].time).toLocaleTimeString(
                  "en-GB",
                  { hour: "2-digit", minute: "2-digit", timeZone: "UTC" },
                )
              : "NOW"}
          </span>
        </div>
      </div>
      <div className="benchmark-footer">
        <span>
          <Dot state={market.stale ? "gold" : "green"} />
          {market.stale ? "Source needs refresh" : "Sources confirmed"} ·{" "}
          {timeAgo(market.source_updated_at)}
        </span>
        <button className="text-button" onClick={info}>
          View methodology
          <ArrowUpRight size={12} />
        </button>
      </div>
    </section>
  );
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
      </div>
    </Modal>
  );
}
