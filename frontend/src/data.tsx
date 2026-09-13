import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, type Config, type Protocol, type Snapshot } from "./api";

type State = {
  snapshot: Snapshot | null;
  protocol: Protocol | null;
  config: Config;
  connected: boolean;
};
const Context = createContext<State | null>(null);
export function DataRoot({
  config,
  children,
}: {
  config: Config;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let alive = true;
    const fetchSnapshot = () => {
      void api<Snapshot>("/markets")
        .then((value) => {
          if (alive) setSnapshot(value);
        })
        .catch(() => {
          if (alive) setConnected(false);
        });
    };
    fetchSnapshot();
    const fetchProtocol = () => {
      void api<Protocol>("/protocol")
        .then((value) => {
          if (alive) setProtocol(value);
        })
        .catch(() => {});
    };
    fetchProtocol();
    const stream = new EventSource("/api/v1/stream");
    stream.onmessage = (event) => {
      try {
        const value = JSON.parse(event.data) as Snapshot;
        if (alive) {
          setSnapshot(value);
          setConnected(true);
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
      alive = false;
      stream.close();
      clearInterval(interval);
    };
  }, []);
  return (
    <Context.Provider value={{ snapshot, protocol, config, connected }}>
      {children}
    </Context.Provider>
  );
}
export function useData() {
  const value = useContext(Context);
  if (!value) throw new Error("Data context missing");
  return value;
}
