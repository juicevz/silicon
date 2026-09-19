import { useId } from "react";
import { money } from "../api";

export function PayoffChart({ move, cost, maxPayout, side = "call", onMove }: {
  move: number;
  cost: number;
  maxPayout: number;
  side?: "call" | "put";
  onMove?: (value: number) => void;
}) {
  const id = useId();
  const direction = side === "call" ? 1 : -1;
  const payout = (m: number) => Math.min(1, Math.max(0, m * direction / 10)) * maxPayout;
  const x = (m: number) => 44 + (m + 15) / 30 * 400;
  const y = (p: number) => 177 - p / Math.max(maxPayout, cost, 1) * 132;
  const points = [-15, -10, 0, 10, 15].map((m) => `${x(m)},${y(payout(m))}`).join(" ");
  const breakeven = maxPayout > 0 ? cost / maxPayout * 10 * direction : 0;
  const canBreakEven = Math.abs(breakeven) <= 10 && maxPayout > 0;
  const net = payout(move) - cost;
  return <div className="payoff-detail">
    <div className="payoff-legend"><span><i />Contract payout</span><span><i />Cost incl. fee</span><small>USDG</small></div>
    <svg className="payoff-chart" viewBox="0 0 480 222" role="img" aria-label={`Capped ${side} payout. ${move}% reference move pays ${money(payout(move))} USDG. Cost ${money(cost)} USDG. Maximum payout ${money(maxPayout)} USDG.`}
      onPointerMove={onMove ? (event) => {
        if (event.pointerType === "touch" && !event.buttons) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const value = (((event.clientX - bounds.left) / bounds.width * 480 - 44) / 400 * 30) - 15;
        onMove(Math.round(Math.max(-15, Math.min(15, value)) * 2) / 2);
      } : undefined}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((part) => <g key={part} className="payoff-grid"><path d={`M44 ${y(maxPayout * part)}H444`} /><text x="33" y={y(maxPayout * part) + 4} textAnchor="end">{(maxPayout * part).toLocaleString("en-US", { maximumFractionDigits: 3 })}</text></g>)}
      {[-15, -10, -5, 0, 5, 10, 15].map((m) => <g key={m} className="payoff-grid"><path d={`M${x(m)} 177v5`} /><text x={x(m)} y="199" textAnchor="middle">{m > 0 ? "+" : ""}{m}%</text></g>)}
      <path className="payoff-strike" d={`M${x(0)} 35V177`} />
      <path d={`M44 177L${points.replaceAll(" ", "L")}L444 177Z`} fill={`url(#${id})`} />
      <polyline className="payoff-curve" points={points} />
      <path className="payoff-cost" d={`M44 ${y(cost)}H444`} />
      <path className="payoff-current-guide" d={`M44 ${y(payout(move))}H${x(move)}`} />
      {canBreakEven && <g className="payoff-breakeven"><path d={`M${x(breakeven)} ${y(cost)}V177`} /><circle cx={x(breakeven)} cy={y(cost)} r="3" /></g>}
      <g className="payoff-marker"><path d={`M${x(move)} 35V177`} /><circle cx={x(move)} cy={y(payout(move))} r="11" className="payoff-halo" /><circle cx={x(move)} cy={y(payout(move))} r="4.5" /></g>
      <g className="payoff-value-label" transform={`translate(${Math.max(94, Math.min(390, x(move)))},${Math.max(37, y(payout(move)) - 25)})`}>
        <rect x="-55" y="-12" width="110" height="24" rx="4" />
        <text textAnchor="middle" y="4">{money(payout(move))} USDG</text>
      </g>
      <text className="payoff-cap-label" x={side === "call" ? 444 : 44} y="25" textAnchor={side === "call" ? "end" : "start"}>Payout cap · {money(maxPayout, 0)} USDG</text>
    </svg>
    <div className="payoff-foot"><span>Reference price change</span><span>{canBreakEven ? `Breakeven ${breakeven > 0 ? "+" : ""}${breakeven.toFixed(2)}%` : "Cost exceeds payout cap"}</span></div>
    <div className="payoff-net-detail"><span>Net result at {move > 0 ? "+" : ""}{move.toFixed(1)}%</span><strong data-positive={net >= 0}>{net > 0 ? "+" : ""}{money(net)} <small>USDG</small></strong></div>
  </div>;
}
