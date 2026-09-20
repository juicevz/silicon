import { lazy, Suspense, useState } from "react";
import { ArrowUpRight, ChevronRight, Copy, FileCode2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useData, useConfig } from "../data";
import { money, short, explorer, type Series } from "../api";
import { External, Modal } from "./ui";
import { LiveContract } from "./Live";
const Gpu = lazy(() => import("./Gpu"));
const assets = [
  {
    id: "h100-sxm",
    name: "H100",
    memory: "80 GB HBM3",
    description: "Capped calls and puts on the H100 rental reference.",
  },
  {
    id: "a100-80",
    name: "A100",
    memory: "80 GB HBM2e",
    description: "A100 provider rates. No trading series has been announced.",
  },
  {
    id: "b200",
    name: "B200",
    memory: "180 GB HBM3e",
    description: "B200 provider rates. No trading series has been announced.",
  },
];
export default function Contracts({ notify }: { notify: (s: string) => void }) {
  const { protocol } = useData();
  const config = useConfig();
  const [selection, setSelected] = useState<{
    asset: (typeof assets)[number];
    series?: Series;
  } | null>(null);
  const selected = selection && {
    ...selection,
    series: protocol?.contracts.find((series) => selection.series
      ? series.address === selection.series.address
      : series.asset === selection.asset.id) ?? selection.series,
  };
  const [view, setView] = useState("Overview");
  const entries = assets.flatMap<{
    asset: (typeof assets)[number];
    series?: Series;
  }>((asset) => {
    const all = protocol?.contracts.filter((s) => s.asset === asset.id) ?? [];
    return all.length
      ? all.map((series) => ({ asset, series }))
      : [{ asset, series: undefined }];
  });
  const addressFor = (entry: (typeof entries)[number]) =>
    entry.series?.address ??
    (entry.asset.id === "h100-sxm" ? config.market_address : null);
  const labelFor = (entry: (typeof entries)[number]) =>
    entry.series?.phase ??
    (addressFor(entry)
      ? "Awaiting contract data"
      : entry.asset.id === "h100-sxm"
        ? "Awaiting deployment"
        : "Tracking only");
  const address = selected ? addressFor(selected) : null;
  const events =
    address && address === config.market_address
      ? (protocol?.activity ?? [])
      : [];
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Contract address copied.");
    } catch {
      notify("Select the address to copy it.");
    }
  };
  return (
    <main className="full-page contract-directory">
      <div className="page-intro">
        <span className="section-label">Robinhood Chain</span>
        <h1>Contracts</h1>
        <p>The assets, their contracts and the USDG behind them.</p>
      </div>
      <div className="directory-heading">
        <span>{assets.length} assets</span>
        <span>{protocol?.contracts.length ?? 0} deployed series</span>
        <Link to="/docs#positions">
          How contracts work <ArrowUpRight size={16} />
        </Link>
      </div>
      <div className="contract-list">
        {entries.map((entry) => (
          <div
            className="contract-entry"
            key={entry.series?.address ?? entry.asset.id}
          >
            <button
              className="contract-entry-main"
              onClick={() => {
                setView("Overview");
                setSelected(entry);
              }}
              aria-label={`Open ${entry.asset.name} contract details`}
            >
              <span className="contract-thumbnail">
                <Suspense fallback={null}>
                  <Gpu model={entry.asset.id} />
                </Suspense>
              </span>
              <span className="contract-asset-name">
                <strong>{entry.asset.name}</strong>
                <span>{entry.asset.memory}</span>
              </span>
              <span className="contract-type">
                {entry.asset.id === "h100-sxm"
                  ? "Capped calls & puts"
                  : "Rental reference"}
                <small>{labelFor(entry)}</small>
              </span>
              <span className="contract-backing">
                <small>USDG backing</small>
                <strong>
                  {entry.series ? money(entry.series.funded) : "Not funded"}
                </strong>
              </span>
              <ChevronRight size={22} />
            </button>
            <div className="contract-entry-footer">
              <span>
                {addressFor(entry) ? (
                  <External
                    href={explorer(config, "address", addressFor(entry)!)}
                  >
                    {short(addressFor(entry)!)}
                  </External>
                ) : (
                  "Contract address will appear after deployment."
                )}
              </span>
              <Link to={`/terminal?asset=${entry.asset.id}`}>
                View market <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
        ))}
      </div>
      <section className="token-contracts">
        <h2>Platform contracts</h2>
        <div>
          <span>Series contract</span>
          {config.market_address ? <External href={explorer(config, "address", config.market_address)}>{short(config.market_address)}</External> : <span className="muted">Awaiting deployment</span>}
        </div>
        <div>
          <span>Silicon token</span>
          {config.token_address ? (
            <External
              href={explorer(config, "address", config.token_address)}
            >
              {short(config.token_address)}
            </External>
          ) : (
            <span className="muted">Awaiting launch</span>
          )}
        </div>
        <div>
          <span>USDG · settlement asset</span>
          <External
            href={explorer(config, "address", config.usdg_address)}
          >
            {short(config.usdg_address)}
          </External>
        </div>
      </section>
      {selected && (
        <Modal
          title={`${selected.asset.name} contract`}
          close={() => setSelected(null)}
          wide
        >
          <div className="modal-body contract-detail">
            <div className="contract-detail-intro">
              <FileCode2 size={28} />
              <div>
                <h3>{selected.asset.name} rental market</h3>
                <p>{selected.asset.description}</p>
              </div>
              <span className="mini-label gold">{labelFor(selected)}</span>
            </div>
            <div
              className="detail-tabs"
              role="tablist"
              aria-label="Contract details"
            >
              {["Overview", "Backing", "Activity"].map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  className={view === v ? "active" : ""}
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            {view === "Overview" && (
              <div className="contract-overview" role="tabpanel">
                <div className="contract-address">
                  <span>Contract address</span>
                  {address ? (
                    <>
                      <code>{address}</code>
                      <button
                        className="icon-button"
                        aria-label="Copy contract address"
                        onClick={() => void copy(address)}
                      >
                        <Copy size={16} />
                      </button>
                      <External
                        href={explorer(config, "address", address!)}
                      >
                        Explorer
                      </External>
                    </>
                  ) : (
                    <strong>Not deployed</strong>
                  )}
                </div>
                <ol className="contract-progress">
                  {["Deployed", "Funded", "Trading", "Settled"].map(
                    (label, i) => {
                      const done =
                        !!selected.series &&
                        (i === 0 ||
                          (i === 1 && Number(selected.series.funded) > 0) ||
                          (i === 2 &&
                            [
                              "open",
                              "expired",
                              "proposed",
                              "settled",
                              "cancelled",
                            ].includes(selected.series.phase)) ||
                          (i === 3 &&
                            (selected.series.settled ||
                              selected.series.cancelled)));
                      return (
                        <li key={label} className={done ? "complete" : ""}>
                          <span>{i + 1}</span>
                          {label}
                        </li>
                      );
                    },
                  )}
                </ol>
                <p>
                  {selected.series
                    ? `Expiry: ${new Date(selected.series.expiry * 1000).toUTCString()}`
                    : selected.asset.id === "h100-sxm"
                      ? "The first series will appear here with its address, expiry and actual funding. No funds have been deposited into an H100 series."
                      : "Rental data is available to explore. This asset has no deployed trading contract."}
                </p>
              </div>
            )}
            {view === "Backing" && (
              <div role="tabpanel">
                {selected.series ? (
                  <LiveContract series={selected.series} notify={notify} />
                ) : (
                  <div className="contract-empty">
                    <strong>No USDG deposited.</strong>
                    <p>
                      Funding and reserved payouts will appear here when a
                      series is deployed.
                    </p>
                    <Link className="text-button" to="/docs#collateral">
                      Read the funding mechanics <ArrowUpRight size={16} />
                    </Link>
                  </div>
                )}
              </div>
            )}
            {view === "Activity" && (
              <div role="tabpanel">
                {events.length ? (
                  <div className="contract-events">
                    {events.map((e) => (
                      <div key={`${e.tx}:${e.log_index}`}>
                        <span>{e.kind}</span>
                        <span>{e.amount ? `${money(e.amount)} USDG` : ""}</span>
                        <External href={explorer(config, "tx", e.tx)}>
                          {short(e.tx)}
                        </External>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="contract-empty">
                    <strong>No contract activity yet.</strong>
                    <p>
                      Deposits, positions and settlements will be listed here
                      with their transactions.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </main>
  );
}
