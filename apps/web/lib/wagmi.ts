import { http } from "wagmi";
import { createConfig } from "@privy-io/wagmi";
import { giwaSepolia } from "shared";

/**
 * Privy 의 wagmi 어댑터로 config 를 만든다.
 *
 * 구글로 로그인하면 Privy 가 임베디드 지갑을 만들어 주고, 그 지갑이 여기
 * 커넥터로 들어온다. 기존에 쓰던 메타마스크·OKX 같은 설치형 지갑도 그대로
 * 잡히므로, 계약을 호출하는 코드는 어느 쪽인지 몰라도 된다.
 */
export const wagmiConfig = createConfig({
  chains: [giwaSepolia],
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
