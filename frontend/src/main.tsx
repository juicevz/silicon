import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { api, type Config } from "./api";
import { DataRoot } from "./data";
import { WalletRoot } from "./wallet";
import Landing from "./Landing";
import Docs from "./Docs";
import { Header } from "./components/Header";
import Atmosphere from "./components/Atmosphere";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./style.css";
import "./redesign.css";
import "./atmosphere.css";
import "./interactions.css";
import "./landing.css";
import "./catalog.css";

const Terminal = lazy(() => import("./Terminal"));
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Silicon view error", error.name, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <div
        className={`boot ${window.location.pathname === "/" || window.location.pathname === "/docs" ? "boot-light" : ""}`}
      >
        <img src="/silicon.svg?v=2" alt="Silicon" />
        <h1>This view needs a refresh.</h1>
        <p>Your wallet and funds are unaffected.</p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Reload Silicon
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Scroll() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      setTimeout(
        () => document.getElementById(hash.slice(1))?.scrollIntoView(),
        100,
      );
    } else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
function TerminalPending({ error }: { error: string }) {
  return (
      <main aria-busy={!error} className="terminal-placeholder">
        <h1>GPU markets</h1>
        {error ? <p role="alert">{error} <button className="text-button" onClick={() => location.reload()}>Retry</button></p> : <div className="terminal-placeholder-panels" aria-label="Loading market data"><span /><span /><span /></div>}
      </main>
  );
}
function TerminalRoute({ ready, error, notify }: { ready: boolean; error: string; notify: (value: string) => void }) {
  return <div className="terminal">
    <Atmosphere tone="dark" />
    <Header notify={notify} />
    <Suspense fallback={<TerminalPending error={error} />}>
      {ready ? <Terminal notify={notify} /> : <TerminalPending error={error} />}
    </Suspense>
  </div>;
}
function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const notify = useCallback((value: string) => setToast(value), []);
  useEffect(() => {
    const preload = setTimeout(() => {
      void import("./Terminal");
    }, 1200);
    void api<Config>("/config")
      .then(setConfig)
      .catch(() =>
        setError("The terminal is reconnecting. Please refresh in a moment."),
      );
    return () => clearTimeout(preload);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Scroll />
        <DataRoot config={config}>
          <WalletRoot config={config}>
              <Routes>
                <Route path="/" element={<Landing notify={notify} />} />
                <Route
                  path="/terminal/*"
                  element={<TerminalRoute ready={!!config} error={error} notify={notify} />}
                />
                <Route path="/docs" element={<Docs />} />
                <Route
                  path="*"
                  element={
                    <div
                      className={`boot ${window.location.pathname === "/" || window.location.pathname === "/docs" ? "boot-light" : ""}`}
                    >
                      <h1>Page not found.</h1>
                      <a className="button" href="/terminal">
                        Open terminal
                      </a>
                    </div>
                  }
                />
              </Routes>
          </WalletRoot>
        </DataRoot>
        {toast && (
          <div className="toast" role="status">
            <span>{toast}</span>
            <button
              className="icon-button"
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </BrowserRouter>
    </ErrorBoundary>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
