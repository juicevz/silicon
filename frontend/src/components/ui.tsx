import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, X } from "lucide-react";
import type { Point } from "../api";

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Silicon home">
      <img src="/silicon.svg" alt="" />
      <span>
        silicon<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
export function Dot({ state = "green" }: { state?: string }) {
  return <span className={`status-dot ${state}`} aria-hidden="true" />;
}
export function External({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`external ${className}`}
    >
      {children}
      <ArrowUpRight size={12} />
    </a>
  );
}
export function Change({ value }: { value?: number | null }) {
  return (
    <span
      className={`change mono ${value == null || value === 0 ? "neutral" : Math.abs(value) < 0.05 ? "gold" : value > 0 ? "green" : "red"}`}
    >
      {value == null
        ? "Collecting"
        : `${value > 0 ? "+" : ""}${value.toFixed(2)}%`}
    </span>
  );
}
export function Sparkline({
  points,
  color = "purple",
  large = false,
}: {
  points: Point[];
  color?: string;
  large?: boolean;
}) {
  const actual = points.length > 1;
  const values = points.map((p) => p.price);
  const min = Math.min(...values),
    max = Math.max(...values),
    diff = max - min;
  const path = actual
    ? points
        .map(
          (p, i) =>
            `${i === 0 ? "M" : "L"} ${(i / (points.length - 1)) * 500} ${diff > 0 ? 74 - ((p.price - min) / diff) * 60 : 44}`,
        )
        .join(" ")
    : "M 0 44 L 500 44";
  return (
    <svg
      className={`sparkline ${color} ${large ? "large" : ""} ${actual ? "" : "collecting"}`}
      viewBox="0 0 500 90"
      preserveAspectRatio="none"
      role="img"
      aria-label={
        actual ? "Recorded rental price history" : "Price history is collecting"
      }
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth={large ? "1.6" : "2"}
        vectorEffect="non-scaling-stroke"
      />
      {actual && (
        <circle
          cx="499"
          cy={
            diff > 0 ? 74 - ((values[values.length - 1] - min) / diff) * 60 : 44
          }
          r="3"
          fill="currentColor"
        />
      )}
    </svg>
  );
}
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const targets = panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input, select, [tabindex="0"]',
        );
        if (!targets?.length) return;
        const first = targets[0],
          last = targets[targets.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = before;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={close}
            aria-label="Close dialog"
          >
            <X size={17} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
