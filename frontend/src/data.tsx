import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type Config, type Protocol, type Snapshot } from "./api";

type State = {
  snapshot: Snapshot | null;
  protocol: Protocol | null;
  config: Config | null;
  connected: boolean;
  marketError: string;
  protocolError: string;
  retryData: () => void;
};
const Context = createContext<State | null>(null);
export function DataRoot({
  config,
  children,
}: {
  config: Config | null;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [connected, setConnected] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [protocolError, setProtocolError] = useState("");
  const [revision, setRevision] = useState(0);
  const retryData = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let streamVersion = 0;
    setMarketError("");
    setProtocolError("");
    const fetchSnapshot = () => {
      const version = streamVersion;
      void api<Snapshot>("/markets", { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted && version === streamVersion) {
            setSnapshot(value);
            setMarketError("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted && version === streamVersion) {
            setConnected(false);
            setMarketError("Market data could not be refreshed.");
          }
        });
    };
    fetchSnapshot();
    const fetchProtocol = () => {
      void api<Protocol>("/protocol", { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) {
            setProtocol(value);
            setProtocolError("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setProtocolError("Contract balances and activity could not be refreshed.");
            setProtocol(current => current && { ...current, verified: false, funding_enabled: false });
          }
        });
    };
    fetchProtocol();
    const stream = new EventSource("/api/v1/stream");
    stream.onmessage = (event) => {
      try {
        const value = JSON.parse(event.data) as Snapshot;
        if (!controller.signal.aborted) {
          streamVersion += 1;
          setSnapshot(value);
          setConnected(true);
          setMarketError("");
        }
      } catch {
        setConnected(false);
      }
    };
    stream.onerror = () => setConnected(false);
    const interval = setInterval(() => {
      fetchProtocol();
      if (stream.readyState !== EventSource.OPEN) fetchSnapshot();
    }, 30000);
    return () => {
      controller.abort();
      stream.close();
      clearInterval(interval);
    };
  }, [revision]);
  return (
    <Context.Provider value={{ snapshot, protocol, config, connected, marketError, protocolError, retryData }}>
      {children}
    </Context.Provider>
  );
}
export function useData() {
  const value = useContext(Context);
  if (!value) throw new Error("Data context missing");
  return value;
}

/** Only trading routes require configuration before they mount. */
export function useConfig() {
  const { config } = useData();
  if (!config) throw new Error("Terminal configuration is not ready");
  return config;
}
