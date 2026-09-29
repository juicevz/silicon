import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, Pause, Play, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "./components/Header";
import { Brand, External } from "./components/ui";
import { money } from "./api";
import { useLandingMotion, type LandingMotion } from "./landingMotion";
import { useMaterialLight } from "./siliconMotion";
import { SmoothRange } from "./components/SmoothRange";
import { AnimatedNumber } from "./components/AnimatedNumber";
import { PayoffChart } from "./components/PayoffChart";
import { AppWindow } from "./components/AppWindow";
import { HardwareCallout } from "./components/HardwareCallout";
import { SiliconPoster } from "./components/SiliconPoster";
import { HARDWARE, hardwareThumbnail, type HardwareId } from "./components/hardwareCatalog";
import type { SceneHandle } from "./components/SiliconScene";
import "@fontsource-variable/space-grotesk";
const SiliconScene = lazy(() => import("./components/SiliconScene"));

function TerminalButton() {
  return <Link className="button primary material-button" to="/terminal">
    <span className="mini-wafer" aria-hidden="true" /><span>Open terminal</span><ArrowUpRight size={18} />
  </Link>;
}

function ObjectDetail({ kind }: { kind: string }) {
  return <span className={`silicon-detail silicon-detail-${kind}`} aria-hidden="true" />;
}

export default function Landing({ notify }: { notify: (value: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const motion = useLandingMotion();
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [paused, setPaused] = useState(reduced);
  useMaterialLight(root, motion);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReduced(preference.matches); setPaused(preference.matches); };
    preference.addEventListener("change",update);
    return () => preference.removeEventListener("change",update);
  }, []);
  useLayoutEffect(() => {
    const landing = root.current;
    if (!landing || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const reveal = (element: Element) => { element.classList.add("is-visible"); observer?.unobserve(element); };
    const sync = () => {
      observer?.disconnect(); landing.classList.toggle("motion-ready", !preference.matches);
      const targets = landing.querySelectorAll("[data-reveal]:not(.is-visible)");
      if (preference.matches) { targets.forEach(reveal); return; }
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
      }, { threshold:.12,rootMargin:"0px 0px -6% 0px" });
      targets.forEach(element => observer?.observe(element));
    };
    const focused = (event: FocusEvent) => {
      const target = (event.target as HTMLElement).closest("[data-reveal]");
      if (target) reveal(target);
    };
    sync(); preference.addEventListener("change",sync); landing.addEventListener("focusin",focused);
    return () => { observer?.disconnect(); preference.removeEventListener("change",sync); landing.removeEventListener("focusin",focused); };
  }, []);
  return <div ref={root} className="landing dreamlike" data-motion-paused={paused}>
    <section className="dream-hero" id="top" aria-labelledby="dream-title">
      <div className="dream-environment dream-environment-light" aria-hidden="true" />
      <div className="dream-environment dream-environment-dark" aria-hidden="true" />
      <Header landing notify={notify} />
      <div className="dream-wrap dream-intro">
        <h1 id="dream-title">Trade the cost <span>of compute.</span></h1>
        <p>Compare GPU rental rates. Explore positions on H100 prices rising or falling.</p>
        <div className="dream-actions"><TerminalButton /><a className="dream-text-link" href="#how-it-works">How it works <ArrowDown size={17} /></a></div>
      </div>
      <div className="dream-objects">
        <Suspense fallback={<SiliconPoster kind="objects" />}><SiliconScene kind="objects" motion={motion} paused={paused} /></Suspense>
      </div>
      <button className="dream-motion" type="button" onClick={() => setPaused(value => !value)} disabled={reduced} aria-pressed={paused} aria-label={reduced ? "Reduced motion" : paused ? "Resume motion" : "Pause motion"} title={reduced ? "Motion follows your system preference" : paused ? "Resume motion" : "Pause motion"}>
        {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
      </button>
    </section>
    <main>
      <FeaturedHardware motion={motion} paused={paused} />
      <section className="dream-section dream-mechanics" id="how-it-works" aria-labelledby="mechanics-title">
        <div className="dream-wrap dream-mechanics-grid">
          <div data-reveal>
            <h2 id="mechanics-title">A position on<br />the price<br />of compute.</h2>
            <p className="dream-body">H100 contracts follow a reference built from five fixed provider listings.</p>
            <Link className="dream-text-link" to="/docs">Read the mechanics <ArrowUpRight size={17} /></Link>
          </div>
          <div className="dream-steps">{[
            ["wafer","Follow the reference.","The median of five eligible provider rates sets the H100 reference. Inspect the listings behind it."],
            ["ring","Choose your position.","A call pays when the reference rises; a put pays when it falls. Preview the premium, fee and payout."],
            ["chip","Settle in USDG.","Funded contracts reserve the maximum payout. The reference at expiry determines what you can claim."],
          ].map(([kind,title,body]) => <article className="dream-step" key={kind} data-reveal><ObjectDetail kind={kind} /><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
        </div>
      </section>
      <section className="dream-section dream-position" id="calculator" aria-labelledby="position-title">
        <div className="dream-wrap dream-position-grid">
          <div data-reveal><h2 id="position-title">See what a<br />price move means.</h2><p className="dream-body">Move the reference price to explore a call. Its payout grows as the price rises, up to the contract’s cap.</p></div>
          <LandingCalculator />
        </div>
      </section>
      <section className="dream-section" aria-labelledby="questions-title">
        <div className="dream-wrap dream-questions">
          <div data-reveal><h2 id="questions-title">A few things<br />to know.</h2></div>
          <div className="dream-answers" data-reveal>{[
            ["What does a position track?","The price of renting GPU capacity from cloud providers. A position settles against a rental-price reference; it does not give you ownership of a GPU or access to compute."],
            ["How is the H100 reference calculated?","Silicon takes the median of five fixed, on-demand provider listings, with equal weight for each provider. A new reference is published only when all five quotes meet the freshness and configuration rules."],
            ["Can I take a position on every GPU?","H100 is the first defined contract reference. Other GPU markets are available for rental-rate comparison."],
            ["Is trading open?","Market data and calculators are open. Live trading requires deployed, funded contracts. The Contracts page shows which series are configured and available."],
          ].map(([question,answer]) => <details key={question}><summary>{question}<Plus size={18} strokeWidth={1.5} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>
      <section className="dream-closing"><div className="dream-wrap" data-reveal><ObjectDetail kind="crystal" /><h2>Explore the<br />GPU markets.</h2><div className="dream-actions"><TerminalButton /></div><p>Market data is open.<br />Trading opens with funded contracts.</p></div></section>
    </main>
    <footer className="dream-footer"><div className="dream-wrap"><Brand /><div><Link to="/docs">Documentation</Link><External href="https://gpueconomy.com/data">Data: GPU Economy · CC BY 4.0</External></div><span>© 2026 Silicon</span></div></footer>
  </div>;
}

const FEATURED = [
  { id:"h100",family:"Hopper" },{ id:"h200",family:"Hopper" },{ id:"b200",family:"Blackwell" },
  { id:"a100",family:"Ampere" },{ id:"l40s",family:"Ada Lovelace" },
] as const;
function FeaturedHardware({ motion, paused }: { motion: LandingMotion; paused: boolean }) {
  const [selected,setSelected] = useState<HardwareId>("h100");
  const scene = useRef<SceneHandle>(null);
  const hardware = HARDWARE.find(item => item.id === selected)!;
  const index = FEATURED.findIndex(item => item.id === selected);
  return <section className="dream-section dream-hardware" id="markets" aria-labelledby="hardware-title">
    <div className="dream-wrap">
      <div className="dream-section-heading" data-reveal><h2 id="hardware-title">The machines<br />behind the market.</h2><p>Compare rental rates across cloud providers.</p></div>
      <div className="dream-hardware-grid">
        <div className="dream-gpu-exhibit" data-reveal>
          <div className="dream-gpu-model"><Suspense fallback={<SiliconPoster kind="gpu" selected={selected} />}><SiliconScene ref={scene} kind="gpu" motion={motion} paused={paused} selected={selected} /></Suspense></div>
          <div className="dream-gpu-label"><HardwareCallout hardware={hardware} minimal /></div>
        </div>
        <div data-reveal>
          <div className="dream-gpu-list" role="group" aria-label="Choose a GPU model" style={{ "--gpu-selection":index } as CSSProperties}>
            <div className="dream-gpu-marker" aria-hidden="true" />
            {FEATURED.map(({id,family}) => {
              const spec = HARDWARE.find(item => item.id === id)!;
              return <button key={id} className="dream-gpu-row" type="button" aria-label={spec.name} aria-pressed={selected === id} onClick={() => setSelected(id)} onPointerEnter={() => scene.current?.prepare(id)} onFocus={() => scene.current?.prepare(id)}>
                <img src={hardwareThumbnail(id)} alt="" width="160" height="110" loading="lazy" /><span><strong>{spec.name}</strong><small>{family}</small></span><ArrowUpRight size={18} />
              </button>;
            })}
          </div>
          <div className="dream-gpu-foot"><span>More models in the terminal</span><Link to={`/terminal?asset=${hardware.market}`}>Compare rates <ArrowUpRight size={13} /></Link></div>
        </div>
      </div>
    </div>
  </section>;
}

// Slider updates stay local, keeping both 3D scenes stable while scrubbing.
function LandingCalculator() {
  const [scenario,setScenario] = useState(4);
  const payout = Math.min(10,Math.max(0,scenario))*10;
  return <AppWindow className="calculator-window dream-calculator" title="H100 call example">
    <div className="landing-calculator">
      <PayoffChart move={scenario} cost={20.2} maxPayout={100} onMove={setScenario} />
      <label htmlFor="landing-scenario">Reference price change</label>
      <SmoothRange id="landing-scenario" label="Reference price change" min={-15} max={15} step={.5} value={scenario} display={`${scenario > 0 ? "+" : ""}${scenario.toFixed(1)}%`} onChange={setScenario} />
      <div className="landing-results"><div><span>Cost incl. fee</span><strong>20.20 <small>USDG</small></strong></div><div><span>Contract payout</span><strong><AnimatedNumber value={money(payout)} /> <small>USDG</small></strong></div><div><span>Maximum payout</span><strong>100.00 <small>USDG</small></strong></div></div>
      <p>Example: 10 units, a 20 USDG premium and a 0.20 USDG fee. Live contracts set their own terms.</p>
    </div>
  </AppWindow>;
}
