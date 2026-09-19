import { useId } from "react";
import { useData } from "../data";
import type { HARDWARE } from "./hardwareCatalog";
import { HARDWARE_RELEASES } from "./hardwareReleases";

export function HardwareCallout({ hardware }: { hardware: typeof HARDWARE[number] }) {
  const { snapshot } = useData();
  const arrow = useId();
  const market = snapshot?.markets.find(({ id }) => id === hardware.market);
  const release = HARDWARE_RELEASES[hardware.id];
  // The feed marks eligible quotes, sometimes with identical listings for the
  // same provider. Give each provider one vote in this descriptive average.
  const providers = new Map<string, number>();
  for (const quote of market?.providers ?? []) {
    if (quote.included && Number.isFinite(quote.price) && quote.price > 0) {
      providers.set(quote.id, Math.min(providers.get(quote.id) ?? Infinity, quote.price));
    }
  }
  const average = providers.size ? [...providers.values()].reduce((sum, price) => sum + price, 0) / providers.size : null;
  const updated = market?.source_updated_at;
  const detail = `Mean of ${providers.size} eligible provider rates per GPU-hour${updated ? `; source updated ${new Date(updated).toUTCString()}` : ""}.`;
  const endpoint = hardware.form === "package" || hardware.form === "compact" ? 118 : 79;
  return <aside className="hardware-callout" data-model={hardware.id} aria-label={`${hardware.name} rental information`}>
    <svg className="hardware-callout-arrow" viewBox="0 0 140 140" aria-hidden="true">
      <defs><marker id={arrow} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M2 1.5 6 4 2 6.5" /></marker></defs>
      <path d={`M124 17H97L19 ${endpoint}`} markerEnd={`url(#${arrow})`} />
    </svg>
    <div className="hardware-callout-copy" key={hardware.id}>
      <strong className="hardware-callout-name">{hardware.name}</strong>
      <a className="hardware-callout-release" href={release.source} target="_blank" rel="noreferrer" aria-label={`${hardware.name} release information from NVIDIA`}>Released {release.year}</a>
      <div className="hardware-callout-rate" title={detail}>
        <span>{market?.stale ? "Last avg. rental" : "Avg. rental"}</span>
        <span className="hardware-callout-price">{average === null ? "Unavailable" : <>${average.toFixed(2)} <small>/ GPU·hr</small></>}</span>
      </div>
    </div>
  </aside>;
}
