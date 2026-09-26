import { decodeFunctionResult, encodeFunctionData, parseAbi, toHex, type Address } from "viem";
import { api, ApiError, type Config, type Quote } from "./api";
import type { components } from "./api-schema";
import type { Provider } from "./wallet";

type Request = components["schemas"]["TransactionRequest"];
type Reviewed = components["schemas"]["ReviewedTransaction"];
const erc20 = parseAbi(["function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const seriesAbi = parseAbi(["function buy(bool,uint256,uint256,uint256) returns (uint256)", "function fund(uint256)", "function withdraw(uint256) returns (uint256)", "function claim(uint256) returns (uint256)"]);
const temporary = (error: unknown) => error instanceof ApiError ? error.status === 429 || error.status >= 500
  : error instanceof TypeError || (error instanceof DOMException && ["AbortError", "TimeoutError", "NetworkError"].includes(error.name));

export function parseUnits(value: string, decimals = 6): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter a positive amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
}

async function checked(provider: Provider, wallet: string, config: Config) {
  if (config.chain_id !== 4663) throw new Error("Silicon requires Robinhood Chain (4663).");
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(config.chain_id) }] });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [{
      chainId: toHex(config.chain_id), chainName: "Robinhood Chain",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.mainnet.chain.robinhood.com/"], blockExplorerUrls: [config.explorer_url],
    }] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(config.chain_id) }] });
  }
  const [chain, accounts] = await Promise.all([
    provider.request({ method: "eth_chainId" }), provider.request({ method: "eth_accounts" }),
  ]);
  if (Number(chain) !== config.chain_id || !Array.isArray(accounts) || String(accounts[0]).toLowerCase() !== wallet.toLowerCase())
    throw new Error("Wallet account or network changed. Reconnect before signing.");
}

async function send(provider: Provider, wallet: string, config: Config, request: Request, notify: (message: string) => void) {
  const series = request.series_address ?? config.market_address;
  if (!series || ![config.market_address, ...(config.vault_round_addresses ?? [])].some(address => address?.toLowerCase() === series.toLowerCase())) throw new Error("This Robinhood round is not configured.");
  await checked(provider, wallet, config);
  const amount = BigInt(request.amount_raw ?? "0");
  const to = request.action === "approve" ? config.usdg_address : series;
  const data = request.action === "approve"
    ? encodeFunctionData({ abi: erc20, functionName: "approve", args: [series as Address, amount] })
    : request.action === "buy"
      ? encodeFunctionData({ abi: seriesAbi, functionName: "buy", args: [request.is_call ?? true, amount, BigInt(request.max_total_raw ?? "0"), BigInt(request.deadline ?? 0)] })
      : encodeFunctionData({ abi: seriesAbi, functionName: request.action, args: [request.action === "claim" ? BigInt(request.position_id!) : amount] });
  notify("Checking the contract and simulating your transaction…");
  const reviewed = await api<Reviewed>("/transactions/review", { method: "POST", body: JSON.stringify(request) });
  if (!reviewed.simulated || reviewed.chain_id !== config.chain_id || reviewed.wallet.toLowerCase() !== wallet.toLowerCase()
    || reviewed.action !== request.action || reviewed.to.toLowerCase() !== to.toLowerCase()
    || reviewed.data.toLowerCase() !== data.toLowerCase() || reviewed.value !== "0x0")
    throw new Error("The reviewed transaction does not match your wallet, network or action.");
  await checked(provider, wallet, config);
  if (Date.now() / 1000 >= reviewed.expires_at) throw new Error("The transaction expired. Refresh and try again.");
  notify(request.action === "approve" ? "Approve the exact USDG amount in your wallet." : "Confirm the Robinhood Chain transaction in your wallet.");
  const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: wallet, to, data, value: "0x0" }] });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw new Error("Your wallet did not return a transaction hash. Check its activity before retrying.");
  notify("Transaction sent. Waiting for Robinhood confirmation…");
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    try {
      const status = await api<{ hash: string; confirmed: boolean; failed: boolean }>(`/transactions/${hash}`);
      if (status.hash.toLowerCase() !== hash.toLowerCase()) throw new Error("Unexpected transaction receipt.");
      if (status.failed) throw new Error("The transaction reverted. No successful action was recorded.");
      if (status.confirmed) return hash;
    } catch (error) {
      if (!temporary(error)) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 1400));
  }
  throw new Error(`Confirmation is still pending. Check transaction ${hash} before retrying.`);
}

async function approve(provider: Provider, wallet: string, config: Config, amount: bigint, notify: (message: string) => void, series = config.market_address) {
  if (!series || ![config.market_address, ...(config.vault_round_addresses ?? [])].some(address => address?.toLowerCase() === series.toLowerCase())) throw new Error("This round is not configured.");
  await checked(provider, wallet, config);
  const data = encodeFunctionData({ abi: erc20, functionName: "allowance", args: [wallet as Address, series as Address] });
  const raw = await provider.request({ method: "eth_call", params: [{ to: config.usdg_address, data }, "latest"] });
  const allowance = decodeFunctionResult({ abi: erc20, functionName: "allowance", data: raw as `0x${string}` });
  if (allowance < amount) await send(provider, wallet, config, { action: "approve", wallet, amount_raw: amount.toString(), max_total_raw: "0", is_call: true, series_address: series }, notify);
}

export async function buyPosition(provider: Provider, wallet: string, config: Config, quote: Quote, side: "call" | "put", notify: (message: string) => void) {
  if (quote.indicative || !quote.units_raw || !quote.cost_raw || !quote.deadline || quote.deadline <= Date.now() / 1000
    || !config.market_address || quote.contract_address?.toLowerCase() !== config.market_address.toLowerCase())
    throw new Error("Refresh the live quote before trading.");
  await approve(provider, wallet, config, BigInt(quote.cost_raw), notify);
  if (quote.deadline <= Date.now() / 1000 + 5) throw new Error("The quote expired during approval. Refresh it before opening the position.");
  return send(provider, wallet, config, { action: "buy", wallet, amount_raw: quote.units_raw,
    max_total_raw: quote.cost_raw, deadline: quote.deadline, is_call: side === "call" }, notify);
}

export async function seriesAction(provider: Provider, wallet: string, config: Config, action: "fund" | "withdraw" | "claim", amount: bigint, notify: (message: string) => void, series = config.market_address) {
  if (action === "claim" && (amount < 0n || amount > BigInt(Number.MAX_SAFE_INTEGER))) throw new Error("Invalid position number.");
  if (action === "fund") await approve(provider, wallet, config, amount, notify, series);
  return send(provider, wallet, config, { action, wallet, amount_raw: action === "claim" ? "0" : amount.toString(), max_total_raw: "0", is_call: true,
    position_id: action === "claim" ? Number(amount) : null, series_address: series }, notify);
}
