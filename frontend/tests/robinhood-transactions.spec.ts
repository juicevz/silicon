import { test, expect } from "@playwright/test";
import { encodeAbiParameters, encodeFunctionData, parseAbi } from "viem";
import type { Config, Quote } from "../src/api";
import { buyPosition, seriesAction } from "../src/transactions";
import type { Provider } from "../src/wallet";

const wallet = "0x1111111111111111111111111111111111111111";
const market = "0x2222222222222222222222222222222222222222";
const usd = "0x3333333333333333333333333333333333333333";
const hash = `0x${"a".repeat(64)}`;
const config = { chain_id: 4663, market_address: market, usdg_address: usd,
  explorer_url: "https://robinhoodchain.blockscout.com" } as Config;
const abi = parseAbi(["function approve(address,uint256) returns (bool)", "function buy(bool,uint256,uint256,uint256) returns (uint256)", "function fund(uint256)", "function withdraw(uint256) returns (uint256)", "function claim(uint256) returns (uint256)"]);
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

function setup(options: { chain?: number; tamper?: boolean; accountChange?: boolean; retry?: boolean; expireQuote?: Quote; addChain?: boolean; failed?: boolean } = {}) {
  const sent: Record<string, unknown>[] = [];
  const methods: string[] = [];
  const reviews: Record<string, unknown>[] = [];
  let confirmations = 0;
  let accounts = 0;
  const provider: Provider = {
    async request({ method, params }) {
      methods.push(method);
      if (method === "wallet_switchEthereumChain" && options.addChain && !methods.includes("wallet_addEthereumChain")) throw { code: 4902 };
      if (method === "eth_chainId") return `0x${(options.chain ?? 4663).toString(16)}`;
      if (method === "eth_accounts") return [options.accountChange && ++accounts > 1 ? market : wallet];
      if (method === "eth_call") return encodeAbiParameters([{ type: "uint256" }], [0n]);
      if (method === "eth_sendTransaction") { sent.push((params as Record<string, unknown>[])[0]); return hash; }
      return null;
    },
  };
  globalThis.fetch = (async (input, init) => {
    if (String(input).endsWith("/review")) {
      const request = JSON.parse(String(init?.body));
      reviews.push(request);
      const amount = BigInt(request.amount_raw);
      const data = request.action === "approve"
        ? encodeFunctionData({ abi, functionName: "approve", args: [market, amount] })
        : request.action === "buy"
          ? encodeFunctionData({ abi, functionName: "buy", args: [request.is_call, amount, BigInt(request.max_total_raw), BigInt(request.deadline)] })
          : encodeFunctionData({ abi, functionName: request.action, args: [request.action === "claim" ? BigInt(request.position_id) : amount] });
      return Response.json({ wallet, action: request.action, chain_id: 4663,
        to: options.tamper ? wallet : request.action === "approve" ? usd : market,
        data, value: "0x0", simulated: true, expires_at: Math.floor(Date.now() / 1000) + 60 });
    }
    confirmations++;
    if (options.retry && confirmations === 1) return Response.json({ detail: "RPC unavailable" }, { status: 503 });
    if (options.expireQuote) options.expireQuote.deadline = Math.floor(Date.now() / 1000) - 1;
    return Response.json({ hash, confirmed: !options.failed, failed: !!options.failed });
  }) as typeof fetch;
  return { provider, sent, methods, reviews, confirmations: () => confirmations };
}

test("funding adds Robinhood when needed and approves only the requested USDG", async () => {
  const run = setup({ addChain: true });
  expect(await seriesAction(run.provider, wallet, config, "fund", 1234567n, () => {})).toBe(hash);
  expect(run.methods).toContain("wallet_addEthereumChain");
  expect(run.reviews.map(r => r.action)).toEqual(["approve", "fund"]);
  expect(run.reviews[0].amount_raw).toBe("1234567");
  expect(run.sent.map(t => t.to)).toEqual([usd, market]);
  expect(run.sent.every(t => t.value === "0x0")).toBe(true);
});

test("a wallet on another chain cannot send a transaction", async () => {
  const run = setup({ chain: 1 });
  await expect(seriesAction(run.provider, wallet, config, "claim", 0n, () => {})).rejects.toThrow("network changed");
  expect(run.sent).toHaveLength(0);
});

test("changed review calldata destinations are rejected before wallet signing", async () => {
  const run = setup({ tamper: true });
  await expect(seriesAction(run.provider, wallet, config, "claim", 0n, () => {})).rejects.toThrow("does not match");
  expect(run.sent).toHaveLength(0);
});

test("switching wallet accounts after simulation prevents signing", async () => {
  const run = setup({ accountChange: true });
  await expect(seriesAction(run.provider, wallet, config, "claim", 0n, () => {})).rejects.toThrow("account or network changed");
  expect(run.sent).toHaveLength(0);
});

test("temporary confirmation errors recover without sending the transaction twice", async () => {
  const run = setup({ retry: true });
  expect(await seriesAction(run.provider, wallet, config, "withdraw", 1000000n, () => {})).toBe(hash);
  expect(run.confirmations()).toBe(2);
  expect(run.sent).toHaveLength(1);
});

test("a reverted receipt is reported and never sent again", async () => {
  const run = setup({ failed: true });
  await expect(seriesAction(run.provider, wallet, config, "claim", 0n, () => {})).rejects.toThrow("reverted");
  expect(run.sent).toHaveLength(1);
});

test("a quote that expires during approval cannot open a position", async () => {
  const quote = { indicative: false, units_raw: "1000000", cost_raw: "2000000",
    contract_address: market, deadline: Math.floor(Date.now() / 1000) + 60 } as Quote;
  const run = setup({ expireQuote: quote });
  await expect(buyPosition(run.provider, wallet, config, quote, "call", () => {})).rejects.toThrow("expired during approval");
  expect(run.sent).toHaveLength(1);
  expect(run.reviews[0].action).toBe("approve");
});
