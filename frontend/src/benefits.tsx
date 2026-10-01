import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Protocol } from "./api";
import type { components } from "./api-schema";
import { useWallet } from "./wallet";
import { useData } from "./data";

export type BenefitData = components["schemas"]["Benefits"];
export function benefitsForWallet(result: BenefitData | null, address: string | null) {
  return address && result?.access.address.toLowerCase() === address.toLowerCase() ? result : null;
}
export function roundFeeBps(eligible: boolean, protocol: Protocol | null): number | null {
  if (!protocol?.verified || !protocol.contracts.length) return null;
  return eligible && protocol.token_configured ? 0 : 100;
}
const Context = createContext<{ data: BenefitData | null; error: string; eligible: boolean; refresh: () => void; open: () => void; close: () => void; opened: boolean }>({ data: null, error: "", eligible: false, refresh: () => {}, open: () => {}, close: () => {}, opened: false });

export function BenefitsRoot({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const { config } = useData();
  const [result, setResult] = useState<BenefitData | null>(null), [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setResult(null); setError("");
    if (!address || !config) return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const value = await api<BenefitData>(`/benefits/${address}`, { signal: controller.signal });
        if (!controller.signal.aborted) { setResult(value); setError(""); }
      } catch {
        if (!controller.signal.aborted) { setResult(null); setError("Benefits are temporarily unavailable. Your trade review shows its actual fee."); }
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [address, config, revision]);
  const data = benefitsForWallet(result, address);
  const eligible = !!(data?.access.verified && data.access.benefits_verified && data.access.workflow_benefits);
  return <Context.Provider value={{ data, error, eligible, opened, refresh: () => setRevision(value => value + 1), open: () => setOpened(true), close: () => setOpened(false) }}>{children}</Context.Provider>;
}

export const useBenefits = () => useContext(Context);
