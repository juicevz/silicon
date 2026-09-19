import { useId, useLayoutEffect, useRef, useState } from "react";
import { money } from "../api";
import "./PayoffChart.css";

const moves = [-15, -10, -5, 0, 5, 10, 15];
const minorMoves = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5];
const signed = (value: number, digits = 1) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;

export function PayoffChart({ move, cost, maxPayout, side = "call", onMove }: {
  move: number;
  cost: number;
  maxPayout: number;
  side?: "call" | "put";
  onMove?: (value: number) => void;
}) {
  const id = useId();
  const chart = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(320);
  // Keep labels and strokes at their actual pixel size, including in the ticket.
  useLayoutEffect(() => {
    const element = chart.current!;
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const direction = side === "call" ? 1 : -1;
  const payout = (m: number) => Math.min(1, Math.max(0, m * direction / 10)) * maxPayout;
  const ceiling = Math.max(maxPayout, cost, 1);
  const tickValue = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const left = Math.max(35, tickValue(ceiling).length * 6 + 10);
  const right = width - 15, top = 32, bottom = 190;
  const x = (m: number) => left + (m + 15) / 30 * (right - left);
  const y = (p: number) => bottom - p / ceiling * (bottom - top);
  const points = [-15, -10, 0, 10, 15].map((m) => `${x(m)},${y(payout(m))}`).join(" ");
  const breakeven = maxPayout > 0 ? cost / maxPayout * 10 * direction : 0;
  const canBreakEven = cost >= 0 && cost <= maxPayout && maxPayout > 0;
  const currentPayout = payout(move);
  const net = currentPayout - cost;
  const maximumNet = maxPayout - cost;
  const markerX = x(move), markerY = y(currentPayout);
  const labelWidth = Math.max(88, money(currentPayout).length * 6.4 + 40);
  // The readout stays in the empty side of the plot while its crosshair moves.
  const labelX = side === "call" ? left + 8 : right - labelWidth - 8;
  const labelY = top + 12;

  return <div className="payoff-detail">
    <div className="payoff-legend"><span><i />Contract payout</span><span><i />Cost incl. fee</span><small>USDG</small></div>
    <svg ref={chart} className="payoff-chart" viewBox={`0 0 ${width} 222`} role="img"
      aria-label={`Capped ${side} payout. ${move}% reference move pays ${money(currentPayout)} USDG. Cost ${money(cost)} USDG. Maximum payout ${money(maxPayout)} USDG.`}
      onPointerMove={onMove ? (event) => {
        if (event.pointerType === "touch" && !event.buttons) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const pointerX = (event.clientX - bounds.left) / bounds.width * width;
        const pointerY = event.clientY - bounds.top;
        if (pointerY < top || pointerY > bottom) return;
        const value = (pointerX - left) / (right - left) * 30 - 15;
        onMove(Math.round(Math.max(-15, Math.min(15, value)) * 2) / 2);
      } : undefined}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity=".18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity=".015" />
        </linearGradient>
      </defs>
      <g className="payoff-grid-minor">
        {[.125, .375, .625, .875].map((part) => <path key={part} d={`M${left} ${y(ceiling * part)}H${right}`} />)}
        {minorMoves.map((m) => <path key={m} d={`M${x(m)} ${top}V${bottom}`} />)}
      </g>
      <g className="payoff-grid-major">
        {[0, .25, .5, .75, 1].map((part) => <g key={part}>
          <path d={`M${left - 4} ${y(ceiling * part)}H${right}`} />
          <text x={left - 9} y={y(ceiling * part) + 3.5} textAnchor="end">{tickValue(ceiling * part)}</text>
        </g>)}
        {moves.map((m) => <g key={m}>
          <path d={`M${x(m)} ${top}V${bottom + 5}`} />
          <text x={x(m)} y={bottom + 21} textAnchor="middle">{signed(m, 0)}</text>
        </g>)}
      </g>
      <path className="payoff-zero" d={`M${left} ${bottom}H${right}M${x(0)} ${top}V${bottom}`} />
      <path d={`M${left} ${bottom}L${points.replaceAll(" ", "L")}L${right} ${bottom}Z`} fill={`url(#${id})`} />
      <path className="payoff-cap-guide" d={`M${left} ${y(maxPayout)}H${right}`} />
      <path className="payoff-cost" d={`M${left} ${y(cost)}H${right}`} />
      <text className="payoff-cost-label" x={side === "call" ? left + 6 : right - 6} y={Math.max(top + 14, y(cost) - 7)} textAnchor={side === "call" ? "start" : "end"}>Cost {money(cost)}</text>
      <polyline className="payoff-curve" points={points} />
      <circle className="payoff-knot" cx={x(0)} cy={y(0)} r="2.5" />
      <circle className="payoff-knot" cx={x(10 * direction)} cy={y(maxPayout)} r="2.5" />
      <text className="payoff-cap-label" x={side === "call" ? right : left} y="17" textAnchor={side === "call" ? "end" : "start"}>Cap {money(maxPayout)} · {signed(10 * direction, 0)}</text>
      {canBreakEven && <g className="payoff-breakeven" aria-label={`Breakeven ${signed(breakeven, 2)}`}>
        <path d={`M${x(breakeven)} ${y(cost)}V${bottom}`} />
        <circle cx={x(breakeven)} cy={y(cost)} r="3" />
      </g>}
      <g className="payoff-marker">
        <path d={`M${markerX} ${top}V${bottom}M${left} ${markerY}H${right}`} />
        <circle cx={markerX} cy={markerY} r="8" className="payoff-halo" />
        <circle cx={markerX} cy={markerY} r="3.5" />
      </g>
      <g className="payoff-value-label" transform={`translate(${labelX},${labelY})`}>
        <rect width={labelWidth} height="35" rx="4" />
        <text className="payoff-selected-move" x="8" y="13">{signed(move)} move</text>
        <text x="8" y="27">{money(currentPayout)} <tspan className="payoff-selected-unit">USDG</tspan></text>
      </g>
    </svg>
    <div className="payoff-foot"><span>Reference price change</span><span>{side === "call" ? "Capped call" : "Capped put"}</span></div>
    <dl className="payoff-facts">
      <div><dt><i className="payoff-fact-dot" />Breakeven</dt><dd className="payoff-fact-breakeven">{canBreakEven ? signed(breakeven, 2) : "Not reached"}</dd></div>
      <div><dt>Payout cap</dt><dd>{money(maxPayout)} <small>USDG</small></dd></div>
      <div><dt>Maximum loss</dt><dd>{cost > 0 ? "−" : ""}{money(cost)} <small>USDG</small></dd></div>
      <div><dt>Maximum net {maximumNet >= 0 ? "gain" : "result"}</dt><dd className="payoff-fact-gain" data-positive={maximumNet >= 0}>{maximumNet > 0 ? "+" : ""}{money(maximumNet)} <small>USDG</small></dd></div>
    </dl>
    <div className="payoff-net-detail"><span>Net at {signed(move)}</span><strong data-positive={net >= 0}>{net > 0 ? "+" : ""}{money(net)} <small>USDG</small></strong></div>
  </div>;
}
