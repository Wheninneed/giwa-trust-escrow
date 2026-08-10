"use client";

import { useState, type ReactNode } from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { giwaSepolia } from "shared";
import { wagmiConfig } from "@/lib/wagmi";
import { PRIVY_APP_ID, isSocialLoginEnabled } from "@/lib/privy";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 화면 값은 전부 온체인에서 읽어오므로, 돌아왔을 때 다시 읽는다
            refetchOnWindowFocus: true,
            staleTime: 4_000,
            retry: 1,
          },
        },
      }),
  );

  const tree = (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );

  // Privy 설정이 없으면 지갑 로그인만으로 동작한다
  if (!isSocialLoginEnabled) {
    return <WagmiProvider config={wagmiConfig}>{tree}</WagmiProvider>;
  }

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID as string}
      config={{
        // 구글을 앞에 두어 "지갑 없이도 된다" 는 것을 먼저 보이게 한다
        loginMethods: ["google", "email", "wallet"],
        defaultChain: giwaSepolia,
        supportedChains: [giwaSepolia],
        embeddedWallets: {
          ethereum: {
            // 지갑이 없는 사용자에게는 로그인과 동시에 하나 만들어 준다
            createOnLogin: "users-without-wallets",
          },
        },
        appearance: {
          theme: "light",
          accentColor: "#3182f6",
          logo: undefined,
          walletChainType: "ethereum-only",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <ToastProvider>{children}</ToastProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
