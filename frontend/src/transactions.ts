import {
  createPublicClient,
  decodeFunctionResult,
  encodeFunctionData,
  http,
  parseAbi,
  toHex,
  type Address,
} from "viem";
import type { Config, Quote } from "./api";
import type { Provider } from "./wallet";

const erc20 = parseAbi([
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);
const seriesAbi = parseAbi([
  "function buy(bool,uint256,uint256,uint256) returns (uint256)",
  "function fund(uint256)",
  "function withdraw(uint256) returns (uint256)",
  "function claim(uint256) returns (uint256)",
]);
const client = createPublicClient({
  transport: http("https://rpc.mainnet.chain.robinhood.com/"),
});

async function checked(provider: Provider, address: string, config: Config) {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(config.chain_id) }],
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: toHex(config.chain_id),
          chainName: "Robinhood Chain",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.mainnet.chain.robinhood.com/"],
          blockExplorerUrls: [config.explorer_url],
        },
      ],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(config.chain_id) }],
    });
  }
  const chain = await provider.request({ method: "eth_chainId" });
  const accounts = await provider.request({ method: "eth_accounts" });
  if (
    Number(chain) !== config.chain_id ||
    !Array.isArray(accounts) ||
    String(accounts[0]).toLowerCase() !== address.toLowerCase()
  )
    throw new Error(
      "Wallet account or network changed. Reconnect before signing.",
    );
}

async function send(
  provider: Provider,
  address: string,
  config: Config,
  to: Address,
  data: `0x${string}`,
) {
  await checked(provider, address, config);
  await client.call({ account: address as Address, to, data });
  const hash = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: address, to, data, value: "0x0" }],
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw new Error("Wallet did not return a transaction hash.");
  const receipt = await client.waitForTransactionReceipt({
    hash: hash as `0x${string}`,
    confirmations: 2,
    timeout: 120000,
  });
  if (receipt.status !== "success")
    throw new Error("The transaction reverted. Your position was not changed.");
  return hash;
}

async function approve(
  provider: Provider,
  address: string,
  config: Config,
  amount: bigint,
  notify: (s: string) => void,
) {
  if (!config.market_address) throw new Error("No active contract");
  const data = encodeFunctionData({
    abi: erc20,
    functionName: "allowance",
    args: [address as Address, config.market_address as Address],
  });
  const result = await client.call({
    to: config.usdg_address as Address,
    data,
  });
  const allowance = decodeFunctionResult({
    abi: erc20,
    functionName: "allowance",
    data: result.data!,
  });
  if (allowance >= amount) return;
  notify("Approve the exact USDG amount in your wallet.");
  await send(
    provider,
    address,
    config,
    config.usdg_address as Address,
    encodeFunctionData({
      abi: erc20,
      functionName: "approve",
      args: [config.market_address as Address, amount],
    }),
  );
}

export async function buyPosition(
  provider: Provider,
  address: string,
  config: Config,
  quote: Quote,
  side: "call" | "put",
  notify: (s: string) => void,
) {
  if (
    quote.indicative ||
    !quote.units_raw ||
    !quote.cost_raw ||
    !quote.deadline ||
    quote.contract_address?.toLowerCase() !==
      config.market_address?.toLowerCase()
  )
    throw new Error("An executable series quote is required.");
  await checked(provider, address, config);
  await approve(provider, address, config, BigInt(quote.cost_raw), notify);
  if (Date.now() / 1000 >= quote.deadline - 5)
    throw new Error(
      "The quote expired during approval. Refresh it before opening the position.",
    );
  notify("Confirm the capped position in your wallet.");
  return send(
    provider,
    address,
    config,
    quote.contract_address as Address,
    encodeFunctionData({
      abi: seriesAbi,
      functionName: "buy",
      args: [
        side === "call",
        BigInt(quote.units_raw),
        BigInt(quote.cost_raw),
        BigInt(quote.deadline),
      ],
    }),
  );
}

export async function seriesAction(
  provider: Provider,
  address: string,
  config: Config,
  action: "fund" | "withdraw" | "claim",
  amount: bigint,
  notify: (s: string) => void,
) {
  if (!config.market_address) throw new Error("No active contract.");
  await checked(provider, address, config);
  if (action === "fund")
    await approve(provider, address, config, amount, notify);
  notify(
    `Confirm ${action === "claim" ? "your claim" : action === "fund" ? "the collateral deposit" : "the withdrawal"} in your wallet.`,
  );
  return send(
    provider,
    address,
    config,
    config.market_address as Address,
    encodeFunctionData({
      abi: seriesAbi,
      functionName: action,
      args: [amount],
    }),
  );
}
