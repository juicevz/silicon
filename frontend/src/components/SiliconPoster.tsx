import { hardwarePoster, type HardwareId } from "./hardwareCatalog";

type SceneKind = "objects" | "gpu";
const featured: HardwareId[] = ["h100","h200","b200","a100","l40s"];
export function SiliconPoster({ kind, selected = "h100" }: { kind: SceneKind; selected?: HardwareId }) {
  return <div className="silicon-scene-poster" aria-hidden="true">
    {kind === "objects" ? <>
      <img className="silicon-objects-light" src="/assets/silicon/dream-objects-poster.webp" alt="" width="1440" height="820" fetchPriority="high" />
      <img className="silicon-objects-dark" src="/assets/silicon/industrial-objects-poster.webp" alt="" width="1440" height="820" />
    </> : featured.map(id => <img key={id} className={id === selected ? "active" : ""} src={hardwarePoster(id)} alt="" width="1600" height="1100" loading="lazy" />)}
  </div>;
}

