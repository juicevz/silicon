import { Moon, Sun } from "lucide-react";
import { useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.siliconTheme === "dark");
  const toggle = () => {
    const value = dark ? "light" : "dark";
    document.documentElement.dataset.siliconTheme = value;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#f6f3ed" : "#10171c");
    try { localStorage.setItem("silicon:theme", value); } catch { /* Private browsing can deny storage. */ }
    setDark(!dark);
  };
  return (
    <button className="theme-toggle" onClick={toggle} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} title={`Switch to ${dark ? "light" : "dark"} mode`}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
