import { lazy, Suspense, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Crosshair,
  MoveUpRight,
  ShieldCheck,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "./components/Header";
import { Brand, Change, Dot, External } from "./components/ui";
import { useData } from "./data";
import { useWallet } from "./wallet";
import { money } from "./api";
const Gpu = lazy(() => import("./components/Gpu"));

export default function Landing({
  notify,
}: {
  notify: (value: string) => void;
}) {
  const { snapshot } = useData();
  const wallet = useWallet();
  const navigate = useNavigate();
  const [heroModel, setHeroModel] = useState("h100-sxm");
  const enter = async () => {
    try {
      await wallet.connect();
      navigate("/terminal");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const model = snapshot?.markets.find((m) => m.id === heroModel);
  return (
    <div className="landing">
      <Header landing notify={notify} />
      <main>
        <section className="hero">
          <div className="hero-grid" />
          <div className="hero-topline eyebrow">
            <span>
              <Dot state="purple" /> COMPUTE, AS A MARKET
            </span>
            <span>01 / SILICON TERMINAL</span>
          </div>
          <div className="hero-copy">
            <div className="hero-kicker">
              <span className="tiny-chip" />
              GPU RENTAL MARKETS
            </div>
            <h1>
              Trade the cost
              <br />
              of <span>compute.</span>
            </h1>
            <p>
              GPU rental prices move.
              <br />
              Take a view on where they go next.
            </p>
            <p className="hero-explainer">
              Follow H100, A100 and B200 rental rates. Trade price changes with
              capped calls and puts, settled in USDG.
            </p>
            <div className="hero-actions">
              <button
                className="button primary large-button"
                disabled={wallet.busy}
                onClick={() => void enter()}
              >
                Access terminal
                <ArrowUpRight size={16} />
              </button>
              <Link to="/terminal" className="text-button">
                Explore markets
                <ArrowRight size={14} />
              </Link>
            </div>
            <span className="hero-footnote">
              <ShieldCheck size={12} />
              See the maximum loss before every trade.
            </span>
          </div>
          <div className="hero-hardware">
            <div className="hero-model">
              <Suspense
                fallback={
                  <img
                    className="gpu-placeholder"
                    src="/assets/gpu-editorial.webp"
                    alt="GPU compute module"
                  />
                }
              >
                <Gpu large model={heroModel} />
              </Suspense>
            </div>
            <div className="hardware-tag tag-one">
              <span className="eyebrow">ACCELERATOR</span>
              <strong>NVIDIA {model?.name ?? "H100"}</strong>
              <span>{model?.memory ?? "80 GB HBM3"}</span>
            </div>
            <div className="hardware-tag tag-two">
              <span className="eyebrow">RENTAL REFERENCE</span>
              <strong>
                ${money(model?.price)}
                <small>/ GPU · hr</small>
              </strong>
              <span>
                <Dot state={model?.stale ? "gold" : "green"} />
                {model?.stale ? "Checking sources" : "Published provider rates"}
              </span>
            </div>
            <div className="hardware-corner">
              <Crosshair size={14} />
              <span>MOVE TO INSPECT</span>
              <span className="corner-line" />
            </div>
            <div className="hero-model-tabs">
              {["h100-sxm", "a100-80", "b200"].map((id, i) => (
                <button
                  key={id}
                  className={heroModel === id ? "active" : ""}
                  onClick={() => setHeroModel(id)}
                >
                  <span>0{i + 1}</span>
                  {["H100", "A100", "B200"][i]}
                </button>
              ))}
            </div>
          </div>
          <div className="hero-bottom eyebrow">
            <span>BUILT ON ROBINHOOD CHAIN</span>
            <a href="#markets">
              SCROLL TO EXPLORE
              <ArrowDown size={12} />
            </a>
            <span>COMPUTE HAS A PRICE. NOW IT HAS A MARKET.</span>
          </div>
        </section>
        <section className="landing-ticker" id="markets">
          <div className="ticker-heading">
            <span className="eyebrow">ON THE BOARD</span>
            <strong>Follow the hardware.</strong>
            <span className="muted">USD per GPU-hour</span>
          </div>
          {(snapshot?.markets ?? []).map((m) => (
            <Link
              to={`/terminal?asset=${m.id}`}
              key={m.id}
              className="ticker-market"
            >
              <div>
                <img className="nvidia" src="/assets/nvidia.svg" alt="NVIDIA" />
                <strong>{m.name}</strong>
                <span className={`mini-label ${m.color}`}>
                  {m.id === "h100-sxm" ? "BENCHMARK" : "TRACKING"}
                </span>
              </div>
              <div>
                <span className="ticker-price mono">${money(m.price)}</span>
                <Change value={m.changes?.["24h"]} />
                <ArrowUpRight size={16} />
              </div>
            </Link>
          ))}
        </section>
        <section className="landing-section how" id="how-it-works">
          <div className="section-heading">
            <span className="eyebrow">01 / THE IDEA</span>
            <h2>
              A market for the machines
              <br />
              behind the models.
            </h2>
            <p>
              Cloud providers charge by the hour. Silicon follows those rental
              prices and gives you a defined way to take a position.
            </p>
          </div>
          <div className="how-grid">
            {[
              {
                n: "01",
                title: "Choose your hardware.",
                text: "Compare rental rates across providers. The first benchmark follows five fixed H100 listings.",
              },
              {
                n: "02",
                title: "Pick a direction.",
                text: "A call pays when the reference rises. A put pays when it falls. Choose your size and see the full payout range.",
              },
              {
                n: "03",
                title: "Settle in USDG.",
                text: "Every filled position reserves its maximum payout. At expiry, the published reference determines what you can claim.",
              },
            ].map((item) => (
              <article key={item.n}>
                <span className="step-number mono">{item.n}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <ChevronRight size={15} />
              </article>
            ))}
          </div>
        </section>
        <section className="landing-section structure">
          <div className="editorial-art">
            <img
              loading="lazy"
              src="/assets/gpu-editorial.webp"
              alt="Original Silicon illustration of a GPU accelerator module"
            />
            <span className="eyebrow">SILICON / HARDWARE STUDY 001</span>
          </div>
          <div className="structure-copy">
            <span className="eyebrow">02 / KNOW YOUR POSITION</span>
            <h2>
              One trade.
              <br />A defined outcome.
            </h2>
            <p>
              The premium is your cost. The cap is the most your contract can
              pay. Both are visible before you sign.
            </p>
            <div className="structure-row">
              <ShieldCheck size={17} />
              <div>
                <strong>Collateral stays with the contract.</strong>
                <span>
                  Writers supply USDG and earn premiums. Their funds cover the
                  payout risk.
                </span>
              </div>
            </div>
            <div className="structure-row">
              <MoveUpRight size={17} />
              <div>
                <strong>Holding Silicon opens the market.</strong>
                <span>
                  Any positive token balance unlocks trading and advanced tools.
                  Hold more than 5,000 tokens for zero platform trading fees.
                </span>
              </div>
            </div>
            <Link to="/docs" className="text-button">
              Read the mechanics
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </section>
        <section className="landing-close">
          <span className="eyebrow">YOUR VIEW ON COMPUTE STARTS HERE</span>
          <div>
            <h2>
              Watch the rates.
              <br />
              Find your position.
            </h2>
            <button
              className="button primary large-button"
              onClick={() => void enter()}
              disabled={wallet.busy}
            >
              Access terminal
              <ArrowUpRight size={17} />
            </button>
          </div>
          <p>
            Market data is open to everyone. Trading opens with the token and
            funded contracts.
          </p>
        </section>
      </main>
      <footer className="landing-footer">
        <Brand />
        <span>GPU rental markets on Robinhood Chain.</span>
        <External href="https://gpueconomy.com/data">
          Data: GPU Economy · CC BY 4.0
        </External>
        <Link to="/docs">Docs</Link>
        <span className="mono">© 2026 SILICON</span>
      </footer>
    </div>
  );
}
