import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import "./TerminalTour.css";

const steps = [
  { target: ".gpu-market-catalog", title: "Start with a GPU.", body: "Choose a model to see its rental reference and providers. H100 has the trading contract; other models give you comparison data." },
  { target: ".benchmark", title: "Read the rental market.", body: "Switch between recorded history and provider prices. On the history chart, moving your cursor updates the price and time immediately. The time controls change the window." },
  { target: ".ticket-body", title: "Build your position.", body: "Choose Rise or Fall, then adjust the premium and rental-price move. Cost, payout and profit update together. A calculator scenario becomes a trade only after you review a funded quote." },
  { target: ".providers", title: "Check what sets the price.", body: "Compare the underlying provider rates. Included listings form the reference. Source times show how recent the data is; an old reference cannot support a new live trade." },
  { target: ".strategies-shortcut", title: "Explore a strategy.", body: "Fund a premium vault round, record an H100 trend thesis, or model B200 against H100. Paper strategies use no funds. Reopen this guide with the question mark anytime." },
];
type Rect = { left: number; top: number; width: number; height: number };

export default function TerminalTour({ close }: { close: () => void }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [position, setPosition] = useState({ left: 20, top: 20 });
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeRef = useRef(close);
  closeRef.current = close;
  const dismiss = () => {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(() => closeRef.current(), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    const root = document.getElementById("root");
    const previous = document.activeElement as HTMLElement | null;
    const inert = root?.inert ?? false;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
      if (event.key === "Tab") {
        const buttons = panel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("keydown", keydown);
      if (root) root.inert = inert;
      document.body.style.overflow = overflow;
      if (previous && previous !== document.body && previous.isConnected) previous.focus({ preventScroll: true });
      else document.querySelector<HTMLButtonElement>('[aria-label="Show introduction"]')?.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(steps[step].target);
    if (!target) return;
    let frame = 0;
    const measure = () => {
      const bounds = target.getBoundingClientRect();
      const width = window.innerWidth, height = window.innerHeight;
      const cardWidth = Math.min(370, width - 32), cardHeight = panel.current?.offsetHeight ?? 290;
      let top = Math.max(12, bounds.top - 8), bottom = Math.min(height - 12, bounds.bottom + 8);
      const left = Math.max(12, bounds.left - 8), right = Math.min(width - 12, bounds.right + 8);
      let cardLeft: number, cardTop: number;
      if (width > 850 && width - right >= cardWidth + 36) {
        cardLeft = right + 20; cardTop = Math.max(16, Math.min(height - cardHeight - 16, top));
      } else if (width > 850 && left >= cardWidth + 36) {
        cardLeft = left - cardWidth - 20; cardTop = Math.max(16, Math.min(height - cardHeight - 16, top));
      } else {
        cardLeft = Math.max(16, Math.min(width - cardWidth - 16, left));
        cardTop = height - cardHeight - 16;
        if (bottom + cardHeight + 32 < height) cardTop = bottom + 20;
        else if (top > cardHeight + 36) cardTop = top - cardHeight - 20;
        else bottom = Math.min(bottom, cardTop - 20);
      }
      top = Math.min(top, bottom - 20);
      setRect({ left, top, width: Math.max(20, right - left), height: Math.max(20, bottom - top) });
      setPosition({ left: cardLeft, top: Math.max(12, cardTop) });
    };
    const bounds = target.getBoundingClientRect();
    const cardHeight = panel.current?.offsetHeight ?? 290;
    const available = Math.max(100, innerHeight - cardHeight - 110);
    // Programmatic scroll works while the rest of the page is inert. Keeping
    // the target above the card also covers short mobile and landscape screens.
    if (bounds.top < 70 || bounds.bottom > innerHeight - cardHeight - 40) {
      window.scrollTo({ top: Math.max(0, scrollY + bounds.top - 80 - Math.max(0, (available - bounds.height) / 2)), behavior: "instant" });
    }
    measure();
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); };
  }, [step]);

  return createPortal(<div className={`terminal-tour ${closing ? "is-closing" : ""}`}>
    <div className="tour-shield" aria-hidden="true" />
    {rect && <div className="tour-spotlight" data-tour-target={steps[step].target} style={rect} aria-hidden="true" />}
    <div ref={panel} className="tour-card" style={position} role="dialog" aria-modal="true" aria-label="Terminal introduction" aria-describedby="tour-description" tabIndex={-1}>
      <div className="tour-top"><span>Silicon <span className="tour-progress">{step + 1} / {steps.length}</span></span><button className="icon-button" aria-label="Dismiss introduction" onClick={dismiss}><X size={19} /></button></div>
      <div key={step} className="tour-copy" aria-live="polite"><h2>{steps[step].title}</h2><p id="tour-description">{steps[step].body}</p></div>
      <div className="tour-progress-track" aria-hidden="true">{steps.map((_, index) => <span key={index} className={index <= step ? "done" : ""} />)}</div>
      <div className="tour-actions"><button className="text-button" onClick={dismiss}>Skip guide</button><div><button className="button" aria-label="Previous step" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} /></button><button className="button primary" onClick={() => step === steps.length - 1 ? dismiss() : setStep(step + 1)}>{step === steps.length - 1 ? "Start exploring" : "Next"}<ArrowRight size={16} /></button></div></div>
    </div>
  </div>, document.body);
}
