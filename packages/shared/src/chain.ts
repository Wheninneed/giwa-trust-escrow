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

/**
 * GIWA 공개 RPC 는 eth_getLogs 를 한 번에 10만 블록까지만 받는다.
 * 이벤트를 읽을 때 "earliest" 부터 훑으면 거부되므로 배포 블록에서 시작한다.
 */
export const MAX_LOG_BLOCK_RANGE = 100_000n;

export const explorerTx = (hash: string) => `${GIWA_EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string) => `${GIWA_EXPLORER_URL}/address/${address}`;

export const GIWA_FAUCET_URL = "https://faucet.giwa.io/";
