import { hardwarePoster, type HardwareId } from "./hardwareCatalog";
import type { ImgHTMLAttributes } from "react";

type SceneKind = "objects" | "gpu";
const featured: HardwareId[] = ["h100","h200","b200","a100","l40s"];
function PosterImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} ref={image => {
    if (image?.complete && image.naturalWidth) image.dataset.loaded = "true";
  }} onLoad={event => { event.currentTarget.dataset.loaded = "true"; }} />;
}
export function SiliconPoster({ kind, selected = "h100" }: { kind: SceneKind; selected?: HardwareId }) {
  return <div className="silicon-scene-poster" aria-hidden="true">
    {kind === "objects" ? <>
      <PosterImage className="silicon-objects-light" src="/assets/silicon/dream-objects-poster.webp" alt="" width="950" height="500" fetchPriority="high" />
      <PosterImage className="silicon-objects-dark" src="/assets/silicon/industrial-objects-poster.webp" alt="" width="778" height="695" />
    </> : featured.map(id => <PosterImage key={id} className={id === selected ? "active" : ""} src={hardwarePoster(id)} alt="" width="1600" height="1100" loading="lazy" />)}
  </div>;
}
