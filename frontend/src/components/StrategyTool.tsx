import { useState } from "react";
import { money } from "../api";
import { useData } from "../data";
import { Modal } from "./ui";
import { SmoothRange } from "./SmoothRange";
import { AnimatedNumber } from "./AnimatedNumber";
import { useBenefits } from "../benefits";

export default function StrategyTool({
  mode,
  close,
  notify,
}: {
  mode: string;
  close: () => void;
  notify: (s: string) => void;
}) {
  const { snapshot } = useData();
  const { eligible } = useBenefits();
  const markets = snapshot?.markets ?? [];
  const [move, setMove] = useState(4),
    [units, setUnits] = useState(1),
    [step, setStep] = useState(2),
    [selected, setSelected] = useState("h100-sxm");
  const market = markets.find((m) => m.id === selected);
  const ratio = (markets[0]?.price ?? 0) / (markets[1]?.price ?? 1);
  const payout = Math.min(10, Math.abs(move)) * units,
    cost = 4.04 * units;
  const save = () => {
    if (!market?.price) return;
    try {
      const saved = JSON.parse(localStorage.getItem("silicon:alerts") ?? "[]");
      if (!Array.isArray(saved) || saved.length + 4 > (eligible ? 100 : 20))
        throw new Error("Remove an existing alert before saving this ladder.");
      const alerts = [-2, -1, 1, 2].map((level) => ({
        id: crypto.randomUUID(),
        market: selected,
        price: Number((market.price! * (1 + (level * step) / 100)).toFixed(4)),
        direction: level < 0 ? "below" : "above",
        triggered: false,
      }));
      localStorage.setItem(
        "silicon:alerts",
        JSON.stringify([...saved, ...alerts]),
      );
      window.dispatchEvent(new Event("silicon:alerts"));
      notify(
        "Four price levels saved. Alerts run while this terminal is open.",
      );
      close();
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <Modal title={mode} close={close}>
      <div className="modal-body">
        {mode === "Compute spread" ? (
          <>
            <p>
              How much does one H100 rental hour cost relative to an A100 hour?
            </p>
            <strong className="big-number mono">{money(ratio, 3)}×</strong>
            <div className="ticket-values">
              {markets.slice(0, 2).map((m) => (
                <div key={m.id}>
                  <span>{m.name} reference</span>
                  <strong>${money(m.price, 3)} / hr</strong>
                </div>
              ))}
              <div>
                <span>H100 premium over A100</span>
                <strong className="purple">
                  {money((ratio - 1) * 100, 2)}%
                </strong>
              </div>
            </div>
            <p>
              The references use different provider baskets and hardware
              specifications. This is a comparison, not an executable two-asset
              trade.
            </p>
          </>
        ) : mode === "Two-way scenario" ? (
          <>
            <p>
              Model one capped call plus one capped put per unit. This
              illustration uses a 2 USDG premium per leg and the standard
              platform fee.
            </p>
            <div className="field-label">
              <label htmlFor="strategy-units">Units per leg</label>
            </div>
            <SmoothRange
              id="strategy-units"
              label="Units per leg"
              min={1}
              max={10}
              step={1}
              value={units}
              display={`${units} units`}
              onChange={setUnits}
            />
            <div className="field-label">
              <label htmlFor="strategy-move">Move from the strike</label>
            </div>
            <SmoothRange
              id="strategy-move"
              label="Move from the strike"
              min={-15}
              max={15}
              step={.5}
              value={move}
              display={`${move > 0 ? "+" : ""}${move.toFixed(1)}%`}
              onChange={setMove}
            />
            <div className="ticket-values">
              <div>
                <span>Combined premium + fees</span>
                <strong><AnimatedNumber value={money(cost)} /> USDG</strong>
              </div>
              <div>
                <span>Combined payout</span>
                <strong><AnimatedNumber value={money(payout)} /> USDG</strong>
              </div>
              <div>
                <span>Net result</span>
                <strong className={payout >= cost ? "green" : "red"}>
                  <AnimatedNumber value={money(payout - cost)} /> USDG
                </strong>
              </div>
              <div>
                <span>Breakeven move, either direction</span>
                <strong>4.04%</strong>
              </div>
            </div>
            <p>
              This does not submit orders. Each actual leg needs its own funded
              quote and wallet confirmation.
            </p>
          </>
        ) : (
          <>
            <p>
              Create four levels around the current rental reference: two above
              and two below.
            </p>
            <select
              className="strategy-select"
              aria-label="Ladder GPU"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · ${money(m.price, 3)}/hr
                </option>
              ))}
            </select>
            <div className="field-label">
              <label htmlFor="ladder-step">Distance between levels</label>
            </div>
            <SmoothRange
              id="ladder-step"
              label="Distance between levels"
              min={.5}
              max={10}
              step={.5}
              value={step}
              display={`${step.toFixed(1)}%`}
              onChange={setStep}
            />
            <div className="ticket-values">
              {[-2, -1, 1, 2].map((level) => (
                <div key={level}>
                  <span>
                    {level > 0 ? "+" : ""}
                    {level * step}% from current reference
                  </span>
                  <strong>
                    $
                    {money(
                      (market?.price ?? 0) * (1 + (level * step) / 100),
                      4,
                    )}
                    /hr
                  </strong>
                </div>
              ))}
            </div>
            <button className="button primary full-width" onClick={save}>
              Save four price alerts
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
