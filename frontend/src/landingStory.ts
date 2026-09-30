import { useEffect, useLayoutEffect, type RefObject } from "react";
import type { LandingMotion } from "./landingMotion";

/** Small reading beats share the page's scroll clock without rerendering the scenes. */
export function useLandingStory(root: RefObject<HTMLDivElement | null>, motion: LandingMotion, paused: boolean) {
  useLayoutEffect(() => {
    const landing = root.current;
    if (!landing || !("IntersectionObserver" in window)) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    let readyFrame = 0;
    const reveal = (element: HTMLElement, delay = 0) => {
      element.style.setProperty("--reveal-delay", `${delay}ms`);
      element.classList.add("is-visible");
      observer?.unobserve(element);
    };
    const sync = () => {
      observer?.disconnect();
      cancelAnimationFrame(readyFrame);
      const immediate = preference.matches || paused;
      landing.classList.toggle("motion-ready", !immediate);
      const targets = landing.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)");
      if (immediate) { targets.forEach(element => reveal(element)); return; }
      // Paint the starting pose before observing, including on a warm-cache visit.
      readyFrame = requestAnimationFrame(() => {
        readyFrame = requestAnimationFrame(() => {
          observer = new IntersectionObserver(entries => {
            entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
              const element = entry.target as HTMLElement;
              reveal(element, Number(element.dataset.revealDelay ?? Math.min(index, 3) * 100));
            });
          }, { threshold: .04, rootMargin: "0px 0px 5% 0px" });
          targets.forEach(element => observer?.observe(element));
        });
      });
    };
    const focused = (event: FocusEvent) => {
      let target = (event.target as HTMLElement).closest<HTMLElement>("[data-reveal]");
      while (target) {
        reveal(target);
        target = target.parentElement?.closest<HTMLElement>("[data-reveal]") ?? null;
      }
    };
    sync();
    preference.addEventListener("change", sync);
    landing.addEventListener("focusin", focused);
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(readyFrame);
      preference.removeEventListener("change", sync);
      landing.removeEventListener("focusin", focused);
      landing.classList.remove("motion-ready");
    };
  }, [root, paused]);

  useEffect(() => {
    const group = root.current?.querySelector<HTMLElement>(".dream-steps");
    if (!group) return;
    const steps = [...group.querySelectorAll<HTMLElement>(".dream-step")];
    let top = 0, centers: number[] = [], height = innerHeight, visible = false;
    let lastProgress = "", lastActive = -2;
    const measure = () => {
      top = group.getBoundingClientRect().top + window.scrollY;
      height = innerHeight;
      centers = steps.map(step => {
        const mark = step.querySelector<HTMLElement>(".dream-step-mark")!;
        return step.offsetTop + mark.offsetTop + mark.offsetHeight / 2;
      });
      group.style.setProperty("--process-top", `${centers[0]}px`);
      group.style.setProperty("--process-height", `${centers.at(-1)! - centers[0]}px`);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(group);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { rootMargin: "100px" });
    observer.observe(group);
    window.addEventListener("resize", measure);
    measure();
    const unsubscribe = motion.subscribe(frame => {
      if (!visible || frame.paused && !frame.reduced) return;
      const readingPosition = frame.scroll + height * .62 - top;
      const progress = frame.reduced ? 0 : Math.max(0, Math.min(1, (readingPosition - centers[0]) / Math.max(1, centers.at(-1)! - centers[0])));
      const value = progress.toFixed(4);
      if (value !== lastProgress) { group.style.setProperty("--process-progress", value); lastProgress = value; }
      const active = frame.reduced ? -1 : centers.reduce((current, center, index) => readingPosition >= center - 40 ? index : current, -1);
      if (active !== lastActive) {
        steps.forEach((step, index) => { step.dataset.active = String(index === active); });
        lastActive = active;
      }
    });
    return () => {
      unsubscribe(); resize.disconnect(); observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [root, motion]);
}
