import { useEffect, useRef } from "react";
import type { LandingMotion } from "../landingMotion";

/** Soft colour fields share the page clock, including pause and reduced motion. */
export function DreamAtmosphere({ motion }: { motion: LandingMotion }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const fields = [...root.current?.querySelectorAll<HTMLElement>(".dream-ambient-field") ?? []];
    let elapsed = 0, reset = false, visible = false;
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    observer.observe(element);
    const unsubscribe = motion.subscribe(frame => {
      if (frame.reduced) {
        if (!reset) fields.forEach(field => field.style.removeProperty("transform"));
        reset = true;
        return;
      }
      reset = false;
      if (frame.paused || !visible) return;
      elapsed += frame.delta;
      fields.forEach((field, index) => {
        const phase = index * 2.1;
        const x = Math.sin(elapsed * .13 + phase) * 7;
        const y = Math.cos(elapsed * .11 + phase) * 5;
        const angle = Math.sin(elapsed * .07 + phase) * 3;
        field.style.transform = `translate3d(${x.toFixed(3)}%,${y.toFixed(3)}%,0) rotate(${angle.toFixed(3)}deg) scale(1.06)`;
      });
    });
    return () => { unsubscribe(); observer.disconnect(); };
  }, [motion]);
  return <div ref={root} className="dream-ambient" aria-hidden="true">
    <span className="dream-ambient-field dream-ambient-lilac" />
    <span className="dream-ambient-field dream-ambient-blue" />
    <span className="dream-ambient-field dream-ambient-peach" />
  </div>;
}
