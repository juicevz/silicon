import type { CSSProperties } from "react";
import { AnimatedNumber } from "./AnimatedNumber";

export function SmoothRange({ id, label, value, min, max, step, display, onChange, className = "" }: {
  id?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
  className?: string;
}) {
  const progress = Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
  return <div className="smooth-range" style={{ "--range": progress } as CSSProperties}>
    <output className="range-value" htmlFor={id} aria-hidden="true"><AnimatedNumber value={display} /></output>
    <span className="range-track" aria-hidden="true"><span /></span>
    <input id={id} className={className} aria-label={label} aria-valuetext={display} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
  </div>;
}
