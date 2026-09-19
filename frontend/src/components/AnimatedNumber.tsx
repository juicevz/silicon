import { memo, useLayoutEffect, useRef } from "react";

const Digit = memo(function Digit({ character }: { character: string }) {
  const element = useRef<HTMLSpanElement>(null);
  const previous = useRef(character);
  useLayoutEffect(() => {
    const node = element.current;
    if (!node || previous.current === character) return;
    const direction = character > previous.current ? 1 : -1;
    previous.current = character;
    node.getAnimations().forEach((animation) => animation.cancel());
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A short, interruptible digit roll. The actual value changes immediately;
    // dragging never queues old numbers or delays a financial calculation.
    const animation = node.animate([
      { transform: `translateY(${direction * 38}%)`, opacity: 0.55 },
      { transform: "translateY(0)", opacity: 1 },
    ], { duration: 150, easing: "cubic-bezier(.2,.75,.25,1)" });
    return () => animation.cancel();
  }, [character]);
  return <span className={`number-cell ${/\d/.test(character) ? "number-digit" : ""}`}><span ref={element}>{character}</span></span>;
});

export function AnimatedNumber({ value, className = "" }: { value: string; className?: string }) {
  return <span className={`animated-number ${className}`} data-value={value}>
    <span className="sr-only">{value}</span>
    <span aria-hidden="true" className="number-visual">
      {Array.from(value).map((character, i) => <Digit key={value.length - i} character={character} />)}
    </span>
  </span>;
}
