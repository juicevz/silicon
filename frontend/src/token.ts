/** Official mainnet identity. Token ownership is optional; USDG settles trades. */
export const SILICON_TOKEN = {
  address: "0x389860f1f8eaba66d8b2925923a40b739a67e6b0",
  symbol: "SILICON",
  chainId: 4663,
  decimals: 18,
  explorer: "https://robinhoodchain.blockscout.com/address/0x389860f1f8eaba66d8b2925923a40b739a67e6b0",
} as const;
export const SILICON_TOKEN_ADDRESS = SILICON_TOKEN.address;
export const SILICON_TOKEN_EXPLORER = SILICON_TOKEN.explorer;
