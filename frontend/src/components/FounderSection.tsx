import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import type { LandingMotion } from "../landingMotion";

const FounderWorld = lazy(() => import("./FounderWorld"));

export function FounderSection({ motion, paused, reduced, toggleMotion }: {
  motion: LandingMotion;
  paused: boolean;
  reduced: boolean;
  toggleMotion: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setNear(true); observer.disconnect(); }
    }, { rootMargin: "650px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <section className="ambf-section" id="ambf" ref={root} aria-labelledby="ambf-title" tabIndex={-1}>
    <div className="ambf-world" aria-hidden="true">
      <img className="ambf-world-poster" src="/assets/founder/checkerboard-world.png" alt="" width="1500" height="500" loading="lazy" />
      {near && <Suspense fallback={null}><FounderWorld motion={motion} /></Suspense>}
    </div>
    <div className="ambf-scrim" aria-hidden="true" />
    <div className="ambf-content dream-wrap">
      <div className="ambf-copy">
        <p className="ambf-intro" data-reveal>the founder</p>
        <h2 id="ambf-title" data-reveal data-reveal-delay="80">AMBF<span>.</span></h2>
        <div className="ambf-links" data-reveal data-reveal-delay="160">
          <a href="https://x.com/AMBF" target="_blank" rel="noreferrer" aria-label="AMBF on X">X</a>
          <a href="https://github.com/juicevz" target="_blank" rel="noreferrer" aria-label="juicevz on GitHub">github</a>
        </div>
        <p className="ambf-bio" data-reveal data-reveal-delay="240">researcher &amp; student<br /><a href="https://x.com/Stanford" target="_blank" rel="noreferrer">@Stanford <ArrowUpRight size={17} /></a></p>
      </div>
      <div className="ambf-portrait" data-reveal data-reveal-delay="180">
        <div className="ambf-portrait-float"><div className="ambf-portrait-glass"><img src="/assets/founder/ambf-avatar.jpg" alt="AMBF’s profile avatar" width="400" height="400" loading="lazy" /></div></div>
      </div>
    </div>
    <div className="ambf-bottom dream-wrap"><a className="ambf-back" href="#top">back to silicon <span aria-hidden="true">↑</span></a><button className="ambf-motion" type="button" onClick={toggleMotion} disabled={reduced} aria-pressed={paused} aria-label={reduced ? "Founder scene: reduced motion" : paused ? "Resume founder animation" : "Pause founder animation"} title={reduced ? "Motion follows your system preference" : paused ? "Resume animation" : "Pause animation"}>{paused ? <Play size={15} /> : <Pause size={15} />}</button></div>
  </section>;
}
