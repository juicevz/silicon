import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.siliconTheme === "dark");
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.dataset.siliconTheme === "dark"));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-silicon-theme"] });
    return () => observer.disconnect();
  }, []);
  const toggle = () => {
    const value = document.documentElement.dataset.siliconTheme === "dark" ? "light" : "dark";
    document.documentElement.dataset.siliconTheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "dark" ? "#131c20" : "#f0eef5");
    setDark(value === "dark");
  };
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={dark} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title={`Switch to ${dark ? "light" : "dark"} mode`}>
      <Sun className="theme-sun" size={16} aria-hidden="true" /><Moon className="theme-moon" size={16} aria-hidden="true" />
    </button>
  );
}
