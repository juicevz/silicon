import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { stringToHex } from "viem";
import { useWallet } from "./wallet";
import { computeApi, ComputeError, type ComputeAccount, type ComputeCatalog, type ConversationMessage } from "./compute-api";
import type { components } from "./api-schema";

type ComputeState = {
  catalog: ComputeCatalog | null; account: ComputeAccount | null; loading: boolean; signing: boolean;
  signIn: () => Promise<void>; signOut: () => Promise<void>; refresh: () => Promise<void>;
  conversations: Record<string, ConversationMessage[]>;
  setConversation: (id: string, messages: ConversationMessage[]) => void;
  sessionVersion: number;
};
const Context = createContext<ComputeState | null>(null);

export function ComputeRoot({ children }: { children: ReactNode }) {
  const wallet = useWallet(), location = useLocation();
  const active = location.pathname.startsWith("/compute") || location.pathname.startsWith("/terminal");
  const [catalog, setCatalog] = useState<ComputeCatalog | null>(null);
  const [account, setAccount] = useState<ComputeAccount | null>(null);
  const [loading, setLoading] = useState(true), [signing, setSigning] = useState(false);
  const [conversations, setConversations] = useState<Record<string, ConversationMessage[]>>({});
  const [sessionVersion, setSessionVersion] = useState(0);
  const previousWallet = useRef<string | null>(wallet.address);
  const generation = useRef(0);
  const clear = useCallback(() => {
    generation.current += 1;
    setAccount(null); setConversations({}); setSessionVersion(generation.current);
  }, []);
  const refresh = useCallback(async () => {
    const version = generation.current;
    try {
      const next = await computeApi<ComputeAccount>("/account");
      if (version === generation.current) setAccount(next);
    } catch (error) {
      if (version === generation.current && error instanceof ComputeError && error.status === 401) clear();
    }
  }, [clear]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void computeApi<ComputeCatalog>("/models", { signal: controller.signal }).then(setCatalog).catch(() => { if (!controller.signal.aborted) setCatalog({ enabled: false, models: [] }); });
    void refresh().finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const interval = setInterval(() => {
      void computeApi<ComputeCatalog>("/models", { signal: controller.signal }).then(setCatalog).catch(() => {});
    }, 120_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [active, refresh]);
  const signOut = useCallback(async () => {
    // Revoke the server session before declaring sign-out complete.
    await computeApi<void>("/auth/logout", { method: "POST" });
    clear();
  }, [clear]);
  useEffect(() => {
    const prior = previousWallet.current;
    previousWallet.current = wallet.address;
    if ((prior && prior.toLowerCase() !== wallet.address?.toLowerCase()) || (wallet.address && account && wallet.address.toLowerCase() !== account.address.toLowerCase())) {
      clear();
      void computeApi<void>("/auth/logout", { method: "POST" }).catch(() => {});
    }
  }, [wallet.address, account, clear]);
  const signIn = async () => {
    if (signing) return;
    setSigning(true);
    try {
      await wallet.connect();
      const provider = await wallet.provider();
      const accounts = await provider.request({ method: "eth_accounts" }) as string[];
      const address = accounts[0];
      if (!address) throw new Error("Connect your wallet to sign in.");
      const challenge = await computeApi<components["schemas"]["Challenge"]>("/auth/challenge", { method: "POST", body: JSON.stringify({ address }) });
      const signature = await provider.request({ method: "personal_sign", params: [stringToHex(challenge.message), address] });
      const current = await provider.request({ method: "eth_accounts" }) as string[];
      if (current[0]?.toLowerCase() !== address.toLowerCase()) throw new Error("Your wallet changed. Sign in again.");
      const next = await computeApi<ComputeAccount>("/auth/verify", { method: "POST", body: JSON.stringify({ challenge_id: challenge.id, signature }) });
      clear(); setAccount(next);
    } finally { setSigning(false); }
  };
  const setConversation = useCallback((id: string, messages: ConversationMessage[]) => setConversations(current => ({ ...current, [id]: messages })), []);
  return <Context.Provider value={{ catalog, account, loading, signing, signIn, signOut, refresh, conversations, setConversation, sessionVersion }}>{children}</Context.Provider>;
}

export function useCompute() {
  const context = useContext(Context);
  if (!context) throw new Error("Compute context missing");
  return context;
}
