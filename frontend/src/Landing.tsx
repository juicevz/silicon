import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { Header } from "./components/Header";
import Atmosphere from "./components/Atmosphere";
import { Brand, External } from "./components/ui";
import { useData } from "./data";
import { money } from "./api";
import { useLandingMotion } from "./landingMotion";
import { SmoothRange } from "./components/SmoothRange";
import { AnimatedNumber } from "./components/AnimatedNumber";
import { PayoffChart } from "./components/PayoffChart";
import TerminalPreview from "./components/TerminalPreview";
import { AppWindow } from "./components/AppWindow";
import "@fontsource-variable/space-grotesk";
const HeroHardware = lazy(() => import("./components/HeroHardware"));

export default function Landing({
  notify,
}: {
  notify: (value: string) => void;
}) {
  const { snapshot } = useData();
  const [scenario, setScenario] = useState(4);
  const root = useRef<HTMLDivElement>(null);
  const motion = useLandingMotion();
  useLayoutEffect(() => {
    const landing = root.current;
    if (!landing || !("IntersectionObserver" in window)) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const reveal = (element: Element) => {
      element.classList.add("is-visible");
      observer?.unobserve(element);
    };
    const sync = () => {
      observer?.disconnect();
      landing.classList.toggle("motion-ready", !motion.matches);
      const targets = landing.querySelectorAll("[data-reveal]:not(.is-visible)");
      if (motion.matches) {
        targets.forEach(reveal);
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) reveal(entry.target);
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
      );
      targets.forEach((element) => observer?.observe(element));
    };
    const revealFocused = (event: FocusEvent) => {
      const target = (event.target as HTMLElement).closest("[data-reveal]");
      if (target) reveal(target);
    };
    sync();
    motion.addEventListener("change", sync);
    landing.addEventListener("focusin", revealFocused);
    return () => {
      observer?.disconnect();
      motion.removeEventListener("change", sync);
      landing.removeEventListener("focusin", revealFocused);
      landing.classList.remove("motion-ready");
    };
  }, [snapshot?.markets.length]);
  const payout = Math.min(10, Math.max(0, scenario)) * 10;
  return (
    <div ref={root} className="landing">
      <Atmosphere tone="light" />
      <Header landing notify={notify} />
      <main>
        <section className="compute-hero">
          <div className="compute-copy">
            <h1>
              Trade the cost
              <br />
              of compute.
            </h1>
            <p>
              Silicon brings GPU rental prices into one place. Compare providers
              and model a position on H100 rates rising or falling, with a capped
              payout in USDG.
            </p>
            <div className="compute-actions">
              <Link className="button primary" to="/terminal">
                Open terminal <ArrowUpRight size={19} />
              </Link>
              <a className="text-button" href="#how-it-works">
                How it works <ArrowDown size={17} />
              </a>
            </div>
          </div>
          <div className="compute-stage">
            <div className="hero-model">
              <Suspense
                fallback={
                  <div className="hardware-poster hardware-first-frame">
                    <img className="active" src="/assets/hardware/catalog-h100.webp" alt="NVIDIA H100 accelerator" width="1600" height="1100" fetchPriority="high" />
                  </div>
                }
              >
                <HeroHardware motion={motion} />
              </Suspense>
            </div>
          </div>
          <a className="hero-scroll-cue" href="#market-overview" aria-label="Explore Silicon below">
            <ArrowDown size={20} strokeWidth={1.5} />
          </a>
        </section>
        <section className="product-section" id="market-overview" aria-labelledby="product-title">
          <div className="product-heading" data-reveal>
            <h2 id="product-title">What does a<br />GPU hour cost?</h2>
            <p>Cloud providers charge by the hour. Silicon brings their published
              rates for 16 GPU models together, so you can compare providers,
              follow price changes and check the source of each quote.</p>
          </div>
          <TerminalPreview />
        </section>
        <section
          className="compute-explainer"
          id="how-it-works"
          aria-labelledby="how-it-works-title"
        >
          <div className="explainer-heading" data-reveal>
            <h2 id="how-it-works-title">
              A position on
              <br />
              the price of compute.
            </h2>
            <p>
              H100 contracts follow a reference built from five fixed provider
              listings. Each contract sets its expiry, price and maximum payout.
            </p>
          </div>
          <div className="compute-steps">
            {[
              [
                "01",
                "Follow the reference.",
                "The median of five eligible provider rates sets the H100 reference. You can inspect the listings behind it.",
              ],
              [
                "02",
                "Choose your position.",
                "A call pays when the reference rises; a put pays when it falls. Preview the premium, fee and payout before entering.",
              ],
              [
                "03",
                "Settle in USDG.",
                "Funded contracts reserve the maximum payout. The published reference at expiry determines what you can claim.",
              ],
            ].map(([n, title, body]) => (
              <article key={n} data-reveal>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <div className="explainer-foot" data-reveal>
            <span>
              Market data is open. Trading opens with funded contracts.
            </span>
            <Link to="/terminal/contracts">
              View contracts <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
        <section className="position-section">
          <div className="position-copy" data-reveal>
            <h2>
              See what a
              <br />
              price move means.
            </h2>
            <p>
              Move the H100 reference to explore a call. Its payout grows as the
              price rises, up to the contract&apos;s cap. The premium and fee set
              the position&apos;s maximum cost.
            </p>
            <Link className="text-button" to="/terminal">
              Build a position <ArrowUpRight size={18} />
            </Link>
          </div>
          <AppWindow className="calculator-window" title="H100 call example">
          <div className="landing-calculator">
            <PayoffChart move={scenario} cost={20.2} maxPayout={100} onMove={setScenario} />
            <label htmlFor="landing-scenario">
              Explore a price move
            </label>
            <SmoothRange
              id="landing-scenario"
              label="Reference price change"
              min={-15}
              max={15}
              step={.5}
              value={scenario}
              display={`${scenario > 0 ? "+" : ""}${scenario.toFixed(1)}%`}
              onChange={setScenario}
            />
            <div className="landing-results">
              <div>
                <span>Cost incl. fee</span>
                <strong>
                  20.20 <small>USDG</small>
                </strong>
              </div>
              <div>
                <span>Contract payout</span>
                <strong>
                  <AnimatedNumber value={money(payout)} /> <small>USDG</small>
                </strong>
              </div>
            </div>
            <p>
              Illustration: 10 units at 2 USDG each, a 1% fee and a 10 USDG cap
              per unit. Live contracts set their own terms.
            </p>
          </div>
          </AppWindow>
        </section>
        <section className="landing-questions" aria-labelledby="questions-title">
          <div className="questions-heading" data-reveal>
            <h2 id="questions-title">Before you<br />take a position.</h2>
            <Link className="text-button" to="/docs">Read the documentation <ArrowUpRight size={18} /></Link>
          </div>
          <div className="questions-list" data-reveal>
            {[
              ["What does a position track?", "The price of renting GPU capacity from cloud providers. A position settles against a rental-price reference; it does not give you ownership of a GPU or access to compute."],
              ["How is the H100 reference calculated?", "Silicon takes the median of five fixed, on-demand provider listings, with equal weight for each provider. A new reference is published only when all five quotes meet the freshness and configuration rules."],
              ["Can I take a position on every GPU?", "You can compare rental rates across 16 GPU models. H100 is the first defined contract reference. The other models are monitoring markets for now."],
              ["Is trading open?", "Market data and position calculators are open. Live trading requires deployed, funded contracts. The Contracts page shows which series are configured and available."],
            ].map(([question, answer]) => <details key={question}>
              <summary>{question}<Plus size={19} strokeWidth={1.5} aria-hidden="true" /></summary>
              <p>{answer}</p>
            </details>)}
          </div>
        </section>
        <section className="closing-section">
          <h2 data-reveal>
            Explore the
            <br />
            GPU markets.
          </h2>
          <Link className="button primary" to="/terminal" data-reveal>
            Open terminal <ArrowUpRight size={22} />
          </Link>
        </section>
      </main>
      <footer className="site-footer" data-reveal>
        <Brand />
        <div>
          <Link to="/docs">
            Documentation <ArrowUpRight size={15} />
          </Link>
          <External href="https://gpueconomy.com/data">
            Data: GPU Economy · CC BY 4.0
          </External>
        </div>
        <span>© 2026 Silicon</span>
      </footer>
    </div>
  );
}
