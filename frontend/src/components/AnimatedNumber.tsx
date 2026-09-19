import { memo } from "react";

// Direct text updates keep a dragged value readable on every frame. Tabular
// figures provide stability without rolling, fading or queuing old digits.
export const AnimatedNumber = memo(function AnimatedNumber({ value, className = "" }: { value: string; className?: string }) {
  return <span className={`animated-number ${className}`} data-value={value}>
    <span className="number-visual">{value}</span>
  </span>;
});
