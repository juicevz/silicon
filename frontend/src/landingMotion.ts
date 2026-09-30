import { useEffect, useMemo, useRef } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export type LandingFrame = {
  time: number;
  delta: number;
  scroll: number;
  x: number;
  y: number;
  pointerActive: boolean;
  reduced: boolean;
  paused: boolean;
};
type FrameListener = (frame: LandingFrame) => void;

/** Scroll advances before the hardware in the same frame. No React work per tick. */
export function useLandingMotion(paused = false) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const listeners = useMemo(() => new Set<FrameListener>(), []);
  const motion = useMemo(
    () => ({
      subscribe(listener: FrameListener) {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      },
    }),
    [listeners],
  );
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let smooth: Lenis | undefined;
    let raf = 0, previous = 0, x = 0, y = 0, pointerActive = false;
    let configuredPause = pausedRef.current;
    const configure = () => {
      smooth?.destroy();
      configuredPause = pausedRef.current;
      smooth = preference.matches || configuredPause ? undefined : new Lenis({
        autoRaf: false,
        lerp: 0.075,
        wheelMultiplier: 0.9,
        anchors: { duration: 1.65, easing: (t: number) => 1 - Math.pow(1 - t, 4) },
        prevent: (node) => !!node.closest(".modal-backdrop, .site-menu, input[type=range]"),
      });
      x = y = 0;
      pointerActive = false;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch" || preference.matches) return;
      x = event.clientX;
      y = event.clientY;
      pointerActive = !((event.target as Element)?.closest("button, a, input, .modal-backdrop"));
    };
    const reset = () => { x = y = 0; pointerActive = false; };
    const leave = (event: PointerEvent) => { if (!event.relatedTarget) reset(); };
    const tick = (time: number) => {
      if (configuredPause !== pausedRef.current) configure();
      smooth?.raf(time);
      const delta = previous ? Math.min((time - previous) / 1000, 1 / 20) : 1 / 60;
      previous = time;
      const frame = { time, delta, scroll: window.scrollY, x, y, pointerActive, reduced: preference.matches, paused: pausedRef.current };
      listeners.forEach((listener) => listener(frame));
      raf = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(raf);
      previous = 0;
      reset();
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    configure();
    raf = requestAnimationFrame(tick);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", leave, { passive: true });
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    preference.addEventListener("change", configure);
    return () => {
      cancelAnimationFrame(raf);
      smooth?.destroy();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", leave);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
      preference.removeEventListener("change", configure);
      listeners.clear();
    };
  }, [listeners]);
  return motion;
}
export type LandingMotion = ReturnType<typeof useLandingMotion>;
