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
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./style.css";

const Landing = lazy(() => import("./Landing"));
const Terminal = lazy(() => import("./Terminal"));
const Docs = lazy(() => import("./Docs"));
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
      <div className="boot">
        <img src="/silicon.svg" alt="Silicon" />
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
function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const notify = useCallback((value: string) => setToast(value), []);
  useEffect(() => {
    void api<Config>("/config")
      .then(setConfig)
      .catch(() =>
        setError("The terminal is reconnecting. Please refresh in a moment."),
      );
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  if (!config)
    return (
      <div className="boot">
        <img src="/silicon.svg" alt="Silicon" />
        <span>{error || "Connecting to compute."}</span>
        {error && (
          <button className="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        )}
      </div>
    );
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Scroll />
        <DataRoot config={config}>
          <WalletRoot config={config}>
            <Suspense
              fallback={
                <div className="boot">
                  <img src="/silicon.svg" alt="Silicon" />
                  <span>Opening Silicon.</span>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<Landing notify={notify} />} />
                <Route
                  path="/terminal/*"
                  element={<Terminal notify={notify} />}
                />
                <Route path="/docs" element={<Docs />} />
                <Route
                  path="*"
                  element={
                    <div className="boot">
                      <h1>Page not found.</h1>
                      <a className="button" href="/terminal">
                        Open terminal
                      </a>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
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
