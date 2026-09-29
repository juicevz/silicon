import { api, type Quote } from "./api";

export type TransactionEntry = {
  version: 1;
  hash: string;
  wallet: string;
  chainId: number;
  series: string;
  action: "approve" | "buy" | "fund" | "withdraw" | "claim";
  amountRaw: string;
  positionId?: number | null;
  createdAt: string;
  updatedAt: string;
  status: "pending" | "confirmed" | "failed" | "replaced";
  replacementHash?: string;
  quote?: Quote;
  side?: "call" | "put";
};

const prefix = "silicon:transaction:v1:";
export const journalEvent = "silicon:transactions";
const memory = new Map<string, TransactionEntry>();
const checks = new Map<string, Promise<TransactionEntry>>();
const key = (entry: TransactionEntry) => `${prefix}${entry.chainId}:${entry.wallet.toLowerCase()}:${entry.hash.toLowerCase()}`;

// Check before opening a wallet: a transaction must have somewhere to keep its receipt.
export function requireJournalStorage() {
  const probe = `${prefix}probe`;
  try { localStorage.setItem(probe, "1"); localStorage.removeItem(probe); }
  catch { throw new Error("Browser storage is unavailable. Enable site storage before sending a transaction."); }
}

export function saveTransaction(entry: TransactionEntry) {
  let persisted = true;
  try { localStorage.setItem(key(entry), JSON.stringify(entry)); memory.delete(key(entry)); }
  catch { persisted = false; memory.set(key(entry), entry); }
  window.dispatchEvent(new Event(journalEvent));
  return persisted;
}

export function transactionsFor(wallet: string, chainId: number): TransactionEntry[] {
  const entries = new Map<string, TransactionEntry>();
  const scope = `${prefix}${chainId}:${wallet.toLowerCase()}:`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(scope)) continue;
      try {
        const row = JSON.parse(localStorage.getItem(name) ?? "null") as TransactionEntry;
        if (row?.version === 1 && row.wallet.toLowerCase() === wallet.toLowerCase() && row.chainId === chainId
          && /^0x[0-9a-f]{64}$/i.test(row.hash) && /^0x[0-9a-f]{40}$/i.test(row.series)
          && ["pending", "confirmed", "failed", "replaced"].includes(row.status)
          && ["approve", "buy", "fund", "withdraw", "claim"].includes(row.action)
          && /^\d+$/.test(row.amountRaw) && Number.isFinite(Date.parse(row.createdAt))) entries.set(name, row);
      } catch { /* A damaged record cannot become an executable transaction. */ }
    }
  } catch { /* Keep the in-memory receipt visible if storage becomes unavailable. */ }
  for (const [name, row] of memory) {
    if (name.startsWith(scope) && (!entries.has(name) || row.updatedAt > entries.get(name)!.updatedAt)) entries.set(name, row);
  }
  return [...entries.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function checkTransaction(entry: TransactionEntry): Promise<TransactionEntry> {
  const id = key(entry);
  const active = checks.get(id);
  if (active) return active;
  const task = api<{ hash: string; confirmed: boolean; failed: boolean }>(`/transactions/${entry.hash}`).then(status => {
    if (status.hash.toLowerCase() !== entry.hash.toLowerCase()) throw new Error("Unexpected transaction receipt.");
    if (!status.confirmed && !status.failed) return entry;
    const next: TransactionEntry = { ...entry, status: status.failed ? "failed" : "confirmed", updatedAt: new Date().toISOString() };
    saveTransaction(next);
    return next;
  }).finally(() => checks.delete(id));
  checks.set(id, task);
  return task;
}

export async function resolveReplacement(entry: TransactionEntry, hash: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Enter the replacement transaction hash from your wallet.");
  const result = await api<{ hash: string; replacement_hash: string; wallet: string; confirmed: boolean }>(`/transactions/${entry.hash}/replacement/${hash}`);
  if (!result.confirmed || result.hash.toLowerCase() !== entry.hash.toLowerCase()
    || result.replacement_hash.toLowerCase() !== hash.toLowerCase() || result.wallet.toLowerCase() !== entry.wallet.toLowerCase())
    throw new Error("The replacement does not match this wallet transaction.");
  saveTransaction({ ...entry, status: "replaced", replacementHash: hash, updatedAt: new Date().toISOString() });
}

const activeWallets = new Set<string>();
export async function walletFlow<T>(wallet: string, chainId: number, action: () => Promise<T>): Promise<T> {
  const scope = `${chainId}:${wallet.toLowerCase()}`;
  if (activeWallets.has(scope)) throw new Error("A wallet action is already in progress.");
  activeWallets.add(scope);
  const run = async () => {
    requireJournalStorage();
    for (const pending of transactionsFor(wallet, chainId).filter(row => row.status === "pending")) {
      let current = pending;
      try { current = await checkTransaction(pending); } catch { /* Unknown means unresolved, not failed. */ }
      if (current.status === "pending") throw new Error("A transaction is still unresolved. Check its receipt in Activity before sending another.");
    }
    return action();
  };
  try {
    if (navigator.locks) return await navigator.locks.request(`silicon:wallet:${scope}`, { ifAvailable: true }, lock => {
      if (!lock) throw new Error("A wallet action is already open in another Silicon tab.");
      return run();
    });
    return await run();
  } finally { activeWallets.delete(scope); }
}
