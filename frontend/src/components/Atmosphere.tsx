import { useEffect, useRef } from "react";

/** Color is painted once per layer; only the layers' transforms move. */
export default function Atmosphere({ tone }: { tone: "light" | "dark" }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    const surface = el?.parentElement;
    if (!el || !surface) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      frame = 0;
      el.style.setProperty("--ambient-x", `${x.toFixed(2)}px`);
      el.style.setProperty("--ambient-y", `${y.toFixed(2)}px`);
    };
    const reset = () => {
      x = y = 0;
      cancelAnimationFrame(frame);
      paint();
    };
    const move = (event: PointerEvent) => {
      if (motion.matches || !finePointer.matches || event.pointerType === "touch") return;
      x = (event.clientX / innerWidth - 0.5) * 24;
      y = (event.clientY / innerHeight - 0.5) * 18;
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const visibility = () => {
      el.dataset.paused = String(document.hidden);
      if (document.hidden) reset();
    };
    surface.addEventListener("pointermove", move, { passive: true });
    surface.addEventListener("pointerleave", reset);
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", reset);
    finePointer.addEventListener("change", reset);
    visibility();
    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerleave", reset);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", reset);
      finePointer.removeEventListener("change", reset);
    };
  }, []);

  return (
    <div ref={root} className={`atmosphere atmosphere-${tone}`} aria-hidden="true">
      <div className="atmosphere-parallax">
        <div className="atmosphere-field atmosphere-copper" />
        <div className="atmosphere-field atmosphere-blue" />
        <div className="atmosphere-field atmosphere-jade" />
      </div>
    </div>
  );
}
