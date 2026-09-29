import { useEffect, type RefObject } from "react";
import type { LandingMotion } from "./landingMotion";

export const SILICON_MOTION_RANGE = 1.1;
export const SILICON_MOTION_SPEED = 1.05;
export type Spring = { value: number; velocity: number };

/** Exact damped spring: the same movement at 60, 120 and 144 Hz. */
export function advanceSpring(spring: Spring, target: number, dt: number, frequency = 14) {
  const displacement = spring.value - target;
  const impulse = spring.velocity + frequency * displacement;
  const decay = Math.exp(-frequency * dt);
  spring.value = target + (displacement + impulse * dt) * decay;
  spring.velocity = (spring.velocity - frequency * impulse * dt) * decay;
}

export function useMaterialLight(root: RefObject<HTMLDivElement | null>, motion: LandingMotion) {
  useEffect(() => {
    const buttons = [...root.current?.querySelectorAll<HTMLElement>(".material-button") ?? []];
    const entries = buttons.map(button => {
      const spring: Spring = { value: 50, velocity: 0 };
      let target = 50;
      const move = (event: PointerEvent) => {
        if (event.pointerType === "touch") return;
        const bounds = button.getBoundingClientRect();
        target = (event.clientX - bounds.left) / bounds.width * 100;
      };
      const leave = () => { target = 50; };
      button.addEventListener("pointermove", move);
      button.addEventListener("pointerleave", leave);
      return { button, spring, target: () => target, cleanup: () => {
        button.removeEventListener("pointermove", move);
        button.removeEventListener("pointerleave", leave);
        button.style.removeProperty("--reflection-x");
      } };
    });
    const unsubscribe = motion.subscribe(frame => {
      for (const entry of entries) {
        const target = frame.reduced ? 50 : entry.target();
        if (Math.abs(entry.spring.value - target) + Math.abs(entry.spring.velocity) < .025) continue;
        if (frame.reduced) { entry.spring.value = 50; entry.spring.velocity = 0; }
        else advanceSpring(entry.spring, target, frame.delta, 18);
        entry.button.style.setProperty("--reflection-x", `${entry.spring.value.toFixed(3)}%`);
      }
    });
    return () => { unsubscribe(); entries.forEach(entry => entry.cleanup()); };
  }, [root, motion]);
}
