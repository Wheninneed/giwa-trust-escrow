import { defineChain } from "viem";

export const GIWA_SEPOLIA_ID = 91342;

export const GIWA_EXPLORER_URL =
  process.env.NEXT_PUBLIC_GIWA_EXPLORER_URL ?? "https://sepolia-explorer.giwa.io";

/**
 * GIWA Sepolia 테스트넷.
 * 공개 RPC 는 rate limit 이 있으므로 NEXT_PUBLIC_GIWA_RPC_URL 로 교체할 수 있게 둔다.
 */
export const giwaSepolia = defineChain({
  id: GIWA_SEPOLIA_ID,
  name: "GIWA Sepolia",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "GIWA Sepolia Explorer",
      url: GIWA_EXPLORER_URL,
      apiUrl: `${GIWA_EXPLORER_URL}/api`,
    },
  },
  testnet: true,
});

export const explorerTx = (hash: string) => `${GIWA_EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${GIWA_EXPLORER_URL}/address/${address}`;

export const GIWA_FAUCET_URL = "https://faucet.giwa.io/";
