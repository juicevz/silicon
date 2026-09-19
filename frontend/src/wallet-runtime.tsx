import {
  PrivyProvider,
  useConnectWallet,
  usePrivy,
} from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { defineChain } from "viem";
import type { Provider } from "./wallet";

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com/"] } },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});
type Props = {
  appId: string;
  request: number;
  success: (address: string, get: () => Promise<Provider>) => void;
  fail: (message: string) => void;
};
function Bridge({ request, success, fail }: Omit<Props, "appId">) {
  const { ready } = usePrivy();
  const handled = useRef(0);
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      if (wallet.type !== "ethereum") {
        fail("Choose an Ethereum-compatible wallet.");
        return;
      }
      success(
        wallet.address,
        () => wallet.getEthereumProvider() as Promise<Provider>,
      );
    },
    onError: () =>
      fail("Wallet connection closed. You can still explore the terminal."),
  });
  useEffect(() => {
    if (ready && request > handled.current) {
      handled.current = request;
      connectWallet({
        walletChainType: "ethereum-only",
        description: "Connect to Silicon. Your wallet stays in your control.",
      });
    }
  }, [ready, request, connectWallet]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!ready)
        fail("Wallet service is taking longer than expected. Please retry.");
    }, 20000);
    return () => clearTimeout(timeout);
  }, [ready, fail]);
  return null;
}
export default function Runtime({ appId, ...props }: Props) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        supportedChains: [robinhood],
        loginMethods: ["wallet"],
        appearance: {
          theme: "dark",
          accentColor: "#f18b54",
          logo: "/silicon.svg?v=2",
          showWalletLoginFirst: true,
          walletChainType: "ethereum-only",
          walletList: [
            "detected_ethereum_wallets",
            "metamask",
            "coinbase_wallet",
            "wallet_connect_qr",
          ],
        },
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      <Bridge {...props} />
    </PrivyProvider>
  );
}
