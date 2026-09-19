import type { ReactNode } from "react";

export function AppWindow({ title, children, action, className = "", id }: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return <div className={`app-window ${className}`} id={id} data-reveal>
    <div className="window-bar">
      <div className="window-controls" aria-hidden="true"><span /><span /><span /></div>
      <span className="window-title">{title}</span>
      <div className="window-action">{action}</div>
    </div>
    <div className="window-content">{children}</div>
  </div>;
}
