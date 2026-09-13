import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Config } from "./api";

export type Provider = {
  request: (request: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
  on?: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
};
export type WalletState = {
  address: string | null;
  busy: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  provider: () => Promise<Provider>;
};
const Context = createContext<WalletState | null>(null);
const Runtime = lazy(() => import("./wallet-runtime"));
export function useWallet() {
  const state = useContext(Context);
  if (!state) throw new Error("Wallet context missing");
  return state;
}

export function WalletRoot({
  config,
  children,
}: {
  config: Config;
  children: ReactNode;
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [request, setRequest] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const getter = useRef<(() => Promise<Provider>) | null>(null);
  const pending = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const disconnect = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setAddress(null);
    getter.current = null;
    setMounted(false);
    setBusy(false);
    pending.current?.reject(new Error("Wallet disconnected"));
    pending.current = null;
  }, []);
  const success = useCallback(
    (value: string, get: () => Promise<Provider>) => {
      cleanup.current?.();
      setAddress(value);
      getter.current = get;
      setBusy(false);
      pending.current?.resolve();
      pending.current = null;
      void get().then((p) => {
        const changed = (...args: unknown[]) => {
          const accounts = args[0];
          if (
            !Array.isArray(accounts) ||
            String(accounts[0]).toLowerCase() !== value.toLowerCase()
          )
            disconnect();
        };
        p.on?.("accountsChanged", changed);
        p.on?.("disconnect", disconnect);
        cleanup.current = () => {
          p.removeListener?.("accountsChanged", changed);
          p.removeListener?.("disconnect", disconnect);
        };
      });
    },
    [disconnect],
  );
  const fail = useCallback((message: string) => {
    setBusy(false);
    pending.current?.reject(new Error(message));
    pending.current = null;
  }, []);
  const connect = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        if (address) {
          resolve();
          return;
        }
        if (!config.privy_app_id) {
          reject(
            new Error(
              "Wallet connection is being configured. You can explore all markets.",
            ),
          );
          return;
        }
        if (!window.isSecureContext) {
          reject(
            new Error("Wallet connections require the secure HTTPS address."),
          );
          return;
        }
        if (pending.current) {
          reject(new Error("Choose a wallet in the open window."));
          return;
        }
        pending.current = { resolve, reject };
        setBusy(true);
        setMounted(true);
        setRequest((v) => v + 1);
      }),
    [address, config.privy_app_id],
  );
  const provider = useCallback(async () => {
    if (!getter.current) throw new Error("Connect your wallet first");
    return getter.current();
  }, []);
  return (
    <Context.Provider value={{ address, busy, connect, disconnect, provider }}>
      {children}
      {mounted && (
        <Suspense fallback={null}>
          <Runtime
            appId={config.privy_app_id}
            request={request}
            success={success}
            fail={fail}
          />
        </Suspense>
      )}
    </Context.Provider>
  );
}
