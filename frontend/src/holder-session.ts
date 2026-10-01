import { useCallback, useEffect, useRef, useState } from "react";
import { stringToHex } from "viem";
import { ApiError } from "./api";
import type { components } from "./api-schema";
import { useWallet } from "./wallet";
import { holderApi, type HolderAccount, type SavedWorkspace, type AdvancedInbox } from "./holders-api";

export function useHolderSession(active: boolean) {
  const wallet = useWallet();
  const address = wallet.address?.toLowerCase() ?? "";
  const current = useRef(address); current.current = address;
  const prior = useRef(address), generation = useRef(0), logout = useRef(Promise.resolve<unknown>(null));
  const [account, setAccount] = useState<HolderAccount | null>(null);
  const [workspaces, setWorkspaces] = useState<SavedWorkspace[]>([]);
  const [inbox, setInbox] = useState<AdvancedInbox | null>(null);
  const [loading, setLoading] = useState(false), [signing, setSigning] = useState(false), [error, setError] = useState("");
  const clear = useCallback(() => { generation.current++; setAccount(null); setWorkspaces([]); setInbox(null); }, []);
  const refresh = useCallback(async () => {
    if (!address) return;
    const version = generation.current;
    setLoading(true);
    try {
      await logout.current;
      const [next, saved, alerts] = await Promise.all([
        holderApi<HolderAccount>(address, "/account"),
        holderApi<SavedWorkspace[]>(address, "/workspaces"),
        holderApi<AdvancedInbox>(address, "/alerts"),
      ]);
      if (current.current === address && version === generation.current) {
        setAccount(next); setWorkspaces(saved); setInbox(alerts); setError("");
      }
    } catch (e) {
      if (current.current === address && version === generation.current) {
        if (e instanceof ApiError && e.status === 401) clear();
        else setError((e as Error).message);
      }
    } finally { if (current.current === address) setLoading(false); }
  }, [address, clear]);
  useEffect(() => {
    if (prior.current === address) return;
    const old = prior.current; prior.current = address;
    clear(); setError("");
    if (old) logout.current = holderApi(old, "/auth/logout", { method: "POST" }).catch(() => {});
  }, [address, clear]);
  useEffect(() => {
    if (!active || !address) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const focus = () => void refresh(); window.addEventListener("focus", focus);
    return () => { clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [active, address, refresh]);
  const signIn = async () => {
    if (signing) return;
    setSigning(true); setError("");
    try {
      await wallet.connect(); await logout.current;
      const provider = await wallet.provider();
      const accounts = await provider.request({ method: "eth_accounts" }) as string[];
      const signer = accounts[0]?.toLowerCase();
      if (!signer) throw new Error("Connect your wallet to sign in.");
      const challenge = await holderApi<components["schemas"]["Challenge"]>(signer, "/auth/challenge", { method: "POST", body: JSON.stringify({ address: signer }) });
      const signature = await provider.request({ method: "personal_sign", params: [stringToHex(challenge.message), signer] });
      const after = await provider.request({ method: "eth_accounts" }) as string[];
      if (after[0]?.toLowerCase() !== signer || current.current !== signer) throw new Error("Your wallet changed. Sign in again.");
      const next = await holderApi<HolderAccount>(signer, "/auth/verify", { method: "POST", body: JSON.stringify({ challenge_id: challenge.id, signature }) });
      if (current.current !== signer) { await holderApi(signer, "/auth/logout", { method: "POST" }); return; }
      const [saved, alerts] = await Promise.all([holderApi<SavedWorkspace[]>(signer, "/workspaces"), holderApi<AdvancedInbox>(signer, "/alerts")]);
      if (current.current === signer) { generation.current++; setAccount(next); setWorkspaces(saved); setInbox(alerts); }
    } catch (e) { setError((e as Error).message); }
    finally { setSigning(false); }
  };
  const signOut = async () => {
    try { await holderApi(address, "/auth/logout", { method: "POST" }); clear(); }
    catch (e) { setError((e as Error).message); }
  };
  const owns = !!address && account?.address.toLowerCase() === address;
  return { address, account: owns ? account : null, workspaces: owns ? workspaces : [], inbox: owns ? inbox : null,
    loading, signing, error, refresh, signIn, signOut };
}
