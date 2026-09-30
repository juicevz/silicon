import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUpRight, Pause, Play, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "./components/Header";
import { Brand, External } from "./components/ui";
import { money } from "./api";
import { useLandingMotion, type LandingMotion } from "./landingMotion";
import { useLandingStory } from "./landingStory";
import { useMaterialLight } from "./siliconMotion";
import { SmoothRange } from "./components/SmoothRange";
import { AnimatedNumber } from "./components/AnimatedNumber";
import { PayoffChart } from "./components/PayoffChart";
import { AppWindow } from "./components/AppWindow";
import { HardwareCallout } from "./components/HardwareCallout";
import { SiliconPoster } from "./components/SiliconPoster";
import { FounderSection } from "./components/FounderSection";
import { XLogo } from "./components/SocialIcons";
import { DreamAtmosphere } from "./components/DreamAtmosphere";
import { HARDWARE, hardwareThumbnail, type HardwareId } from "./components/hardwareCatalog";
import type { SceneHandle } from "./components/SiliconScene";
const SiliconScene = lazy(() => import("./components/SiliconScene"));

function TerminalButton() {
  return <Link className="button primary material-button" to="/terminal">
    <span className="mini-wafer" aria-hidden="true" /><span>open terminal</span><ArrowUpRight size={18} />
  </Link>;
}

function ObjectDetail({ kind }: { kind: string }) {
  return <span className={`silicon-detail silicon-detail-${kind}`} aria-hidden="true" />;
}

export default function Landing({ notify }: { notify: (value: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [paused, setPaused] = useState(reduced);
  const motion = useLandingMotion(paused);
  useMaterialLight(root, motion);
  useLandingStory(root, motion, paused);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReduced(preference.matches); setPaused(preference.matches); };
    preference.addEventListener("change",update);
    return () => preference.removeEventListener("change",update);
  }, []);
  return <div ref={root} className="landing dreamlike" data-motion-paused={paused}>
    <DreamAtmosphere motion={motion} />
    <section className="dream-hero" id="top" aria-labelledby="dream-title">
      <div className="dream-environment dream-environment-light" aria-hidden="true" />
      <div className="dream-environment dream-environment-dark" aria-hidden="true" />
      <DreamAtmosphere motion={motion} />
      <Header landing notify={notify} />
      <div className="dream-wrap dream-intro">
        <h1 id="dream-title" data-reveal data-reveal-delay="60">trade the cost <span>of compute.</span></h1>
        <p data-reveal data-reveal-delay="160">compute has a price. follow the GPU rental market and take a view on where H100 goes next.</p>
        <div className="dream-actions" data-reveal data-reveal-delay="260"><TerminalButton /><a className="dream-text-link" href="#how-it-works">how it works <ArrowDown size={17} /></a></div>
      </div>
      <div className="dream-objects" data-reveal data-reveal-delay="180">
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
            <h2 id="mechanics-title">you have a view.<br />here’s how<br />it plays out.</h2>
            <p className="dream-body">start with the rental price. choose a direction. see what that move would mean for your position.</p>
            <Link className="dream-text-link" to="/docs">read the mechanics <ArrowUpRight size={17} /></Link>
          </div>
          <div className="dream-steps">
            <div className="dream-process-track" aria-hidden="true"><span /></div>
            {[
              ["wafer","first, the price.","five fixed provider listings. one H100 reference, set by their median. every source is there for you to inspect."],
              ["ring","then, your view.","think the price goes up? explore a call. down? a put. check the cost, cap and possible payout before you decide."],
              ["chip","let the market play out.","the reference at expiry sets the payout in USDG. funded contracts reserve the maximum payout from the start."],
            ].map(([kind,title,body]) => <article className="dream-step" key={kind} data-reveal><span className="dream-step-mark"><ObjectDetail kind={kind} /></span><div><h3>{title}</h3><p>{body}</p></div></article>)}
          </div>
        </div>
      </section>
      <section className="dream-section dream-position" id="calculator" aria-labelledby="position-title">
        <div className="dream-wrap dream-position-grid">
          <div data-reveal><h2 id="position-title">what if<br />the price moves?</h2><p className="dream-body">try it. move the price and watch the payout. this call pays more as the reference rises, up to its cap.</p></div>
          <LandingCalculator />
        </div>
      </section>
      <section className="dream-section" aria-labelledby="questions-title">
        <div className="dream-wrap dream-questions">
          <div data-reveal><h2 id="questions-title">a few things<br />to know.</h2></div>
          <div className="dream-answers" data-reveal>{[
            ["am i renting a GPU?","you’re taking a view on the rental price. a position settles against that reference in USDG. GPU ownership and access to compute are separate."],
            ["how is the H100 reference calculated?","silicon takes the median of five fixed, on-demand provider listings, with equal weight for each provider. a new reference is published only when all five quotes meet the freshness and configuration rules."],
            ["can i take a position on every GPU?","H100 is the first defined contract reference. other GPU markets are available for rental-rate comparison."],
            ["where do i start?","the market data and calculators are open. have a look around. live trading requires deployed, funded contracts; the Contracts page shows what’s available."],
          ].map(([question,answer]) => <details key={question}><summary>{question}<Plus size={18} strokeWidth={1.5} aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
        </div>
      </section>
      <section className="dream-closing"><div className="dream-wrap" data-reveal><ObjectDetail kind="crystal" /><h2>get a feel<br />for the market.</h2><div className="dream-actions"><TerminalButton /></div><p>start with the data. no wallet needed.<br />trading opens with funded contracts.</p></div></section>
      <FounderSection motion={motion} paused={paused} reduced={reduced} toggleMotion={() => setPaused(value => !value)} />
    </main>
    <footer className="dream-footer founder-footer"><div className="dream-wrap"><Brand /><div><a className="footer-social" href="https://x.com/SiliconGPU" target="_blank" rel="noreferrer" aria-label="Silicon on X"><XLogo size={15} /></a><Link to="/docs">Documentation</Link><External href="https://gpueconomy.com/data">Data: GPU Economy · CC BY 4.0</External></div><span>© 2026 Silicon</span></div></footer>
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
      <div className="dream-section-heading" data-reveal><h2 id="hardware-title">the machines<br />behind the market.</h2><p>different GPUs. different rates. pick a model and see what providers are charging.</p></div>
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
