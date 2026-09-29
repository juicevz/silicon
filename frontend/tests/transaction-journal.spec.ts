import { test, expect } from "@playwright/test";
import { checkTransaction, resolveReplacement, saveTransaction, transactionsFor, walletFlow, type TransactionEntry } from "../src/transactionJournal";
import { browserStorage } from "./browser-storage";

const wallet = `0x${"1".repeat(40)}`;
const originalFetch = globalThis.fetch;
let restore: () => void;
test.beforeEach(() => { restore = browserStorage(); });
test.afterEach(() => { globalThis.fetch = originalFetch; restore(); });
function entry(): TransactionEntry {
  return { version: 1, hash: `0x${"a".repeat(64)}`, wallet, chainId: 4663, series: `0x${"2".repeat(40)}`,
    action: "buy", amountRaw: "1000000", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "pending" };
}

test("saved transaction recovery is wallet and chain scoped and never resends", async () => {
  const row = entry();
  saveTransaction(row);
  expect(transactionsFor(wallet, 1)).toHaveLength(0);
  expect(transactionsFor(`0x${"3".repeat(40)}`, 4663)).toHaveLength(0);
  expect(transactionsFor(wallet.toUpperCase(), 4663)).toHaveLength(1);
  const requests: string[] = [];
  globalThis.fetch = (async (url, init) => {
    requests.push(`${init?.method ?? "GET"} ${url}`);
    return Response.json({ hash: row.hash, confirmed: true, failed: false });
  }) as typeof fetch;
  const restored = transactionsFor(wallet, 4663)[0];
  await Promise.all([checkTransaction(restored), checkTransaction(restored)]);
  expect(requests).toEqual([`GET /api/v1/transactions/${row.hash}`]);
  expect(transactionsFor(wallet, 4663)[0].status).toBe("confirmed");
});

test("unresolved transactions block a new action even when receipt checks fail", async () => {
  saveTransaction(entry());
  globalThis.fetch = (async () => Response.json({ detail: "Temporarily unavailable" }, { status: 503 })) as typeof fetch;
  let sends = 0;
  await expect(walletFlow(wallet, 4663, async () => { sends++; })).rejects.toThrow("still unresolved");
  expect(sends).toBe(0);
  expect(transactionsFor(wallet, 4663)[0].status).toBe("pending");
});

test("a second click cannot start another wallet flow while the first is open", async () => {
  let release!: () => void;
  const first = walletFlow(wallet, 4663, () => new Promise<void>(resolve => { release = resolve; }));
  await expect(walletFlow(wallet, 4663, async () => {})).rejects.toThrow("already in progress");
  release();
  await first;
});

test("another tab's wallet lock blocks signing", async () => {
  Object.defineProperty(navigator, "locks", { value: { request: async (_name: string, _options: unknown, callback: (lock: null) => unknown) => callback(null) } });
  let sends = 0;
  await expect(walletFlow(wallet, 4663, async () => { sends++; })).rejects.toThrow("another Silicon tab");
  expect(sends).toBe(0);
});

test("a mismatched receipt never resolves the saved transaction", async () => {
  const row = entry(); saveTransaction(row);
  globalThis.fetch = (async () => Response.json({ hash: `0x${"b".repeat(64)}`, confirmed: true, failed: false })) as typeof fetch;
  await expect(checkTransaction(row)).rejects.toThrow("Unexpected transaction receipt");
  expect(transactionsFor(wallet, 4663)[0].status).toBe("pending");
});

test("storage failure is caught before the wallet opens", async () => {
  localStorage.setItem = () => { throw new Error("Quota exceeded"); };
  let sends = 0;
  await expect(walletFlow(wallet, 4663, async () => { sends++; })).rejects.toThrow("Enable site storage");
  expect(sends).toBe(0);
});

test("only a verified matching replacement releases the pending transaction", async () => {
  const row = entry(); saveTransaction(row);
  const hash = `0x${"b".repeat(64)}`;
  globalThis.fetch = (async () => Response.json({ hash: row.hash, replacement_hash: hash, wallet: `0x${"3".repeat(40)}`, confirmed: true })) as typeof fetch;
  await expect(resolveReplacement(row, hash)).rejects.toThrow("does not match");
  expect(transactionsFor(wallet, 4663)[0].status).toBe("pending");
  globalThis.fetch = (async () => Response.json({ hash: row.hash, replacement_hash: hash, wallet, confirmed: true })) as typeof fetch;
  await resolveReplacement(row, hash);
  expect(transactionsFor(wallet, 4663)[0].status).toBe("replaced");
  expect(transactionsFor(wallet, 4663)[0].replacementHash).toBe(hash);
  await expect(walletFlow(wallet, 4663, async () => "ready")).resolves.toBe("ready");
});
