import { useEffect, useRef } from "react";
import { hardwareForMarket, hardwareThumbnail } from "./hardwareCatalog";

/** Small workspace thumbnails reuse the detailed hero render. No extra WebGL
 * contexts, shader compilation or placeholder model for each market card. */
export default function Gpu({ model = "h100-sxm", large = false }: { model?: string; large?: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const visual = useRef<HTMLDivElement>(null);
  const hardware = hardwareForMarket(model);
  const id = hardware.id;
  useEffect(() => {
    const el = host.current, layer = visual.current;
    if (!el || !layer) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0, last = 0, x = 0, y = 0, targetX = 0, targetY = 0;
    const tick = (time: number) => {
      const dt = last ? Math.min((time - last) / 1000, .05) : 1 / 60;
      const blend = 1 - Math.exp(-22 * dt);
      last = time; x += (targetX - x) * blend; y += (targetY - y) * blend;
      layer.style.transform = `perspective(650px) rotateX(${-y * 6}deg) rotateY(${x * 8}deg) translate3d(${x * 2}px,${y * 2}px,0)`;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > .001) raf = requestAnimationFrame(tick);
      else { raf = last = 0; }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const move = (event: PointerEvent) => {
      if (preference.matches || event.pointerType === "touch") return;
      const rect = el.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      targetY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      schedule();
    };
    const reset = () => {
      targetX = targetY = 0;
      if (preference.matches) { cancelAnimationFrame(raf); raf = last = x = y = 0; layer.style.transform = "none"; }
      else schedule();
    };
    el.addEventListener("pointermove", move, { passive: true });
    el.addEventListener("pointerleave", reset);
    preference.addEventListener("change", reset);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", reset); preference.removeEventListener("change", reset); };
  }, []);
  return <div ref={host} className={`gpu-model gpu-thumbnail ${large ? "gpu-large" : ""}`} role="img" aria-label={hardware.description}>
    <div ref={visual} className="gpu-thumbnail-visual"><img src={hardwareThumbnail(id)} alt="" width="1280" height="880" loading="lazy" decoding="async" onLoad={(event) => { event.currentTarget.dataset.loaded = "true"; }} /></div>
    <span className="gpu-thumbnail-hit" aria-hidden="true" />
  </div>;
}
