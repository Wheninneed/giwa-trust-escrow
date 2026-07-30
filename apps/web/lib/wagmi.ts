import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { giwaSepolia } from "shared";

/**
 * MVP 는 일반 EVM 지갑(메타마스크 등)만으로 동작해야 한다.
 * WalletConnect 는 프로젝트 ID 가 있을 때만 선택적으로 붙인다.
 */
export const wagmiConfig = createConfig({
  chains: [giwaSepolia],
  connectors: [injected()],
  transports: {
    [giwaSepolia.id]: http(process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io", {
      // 공개 RPC 에는 rate limit 이 있다. 무한 대기 대신 빠르게 실패시키고 재시도한다.
      timeout: 20_000,
      retryCount: 2,
      retryDelay: 800,
    }),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
