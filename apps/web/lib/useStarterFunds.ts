"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useBalance, useSignMessage } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { giwaSepolia } from "shared";

/**
 * 로그인 직후 가스비가 없으면 서버에 시작 지원금을 요청한다.
 *
 * 지갑을 처음 만든 사용자는 GIWA 테스트 ETH 가 0이라 아무 것도 못 한다.
 * 사용자가 faucet 을 찾아다니지 않도록 화면이 알아서 처리한다.
 */
const ENOUGH_WEI = 100_000_000_000_000n; // 0.0001 ETH

type Status = "idle" | "checking" | "funding" | "done" | "failed";

export function useStarterFunds() {
  const { address, isConnected, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const { data: balance, refetch } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });

  const [status, setStatus] = useState<Status>("idle");
  // 한 주소에 대해 한 번만 시도한다. 실패해도 계속 다시 부르지 않는다.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address || chainId !== giwaSepolia.id) return;
    if (balance === undefined) return;
    if (balance.value >= ENOUGH_WEI) return;
    if (attempted.current === address) return;

    attempted.current = address;

    (async () => {
      try {
        const config = await (await fetch("/api/onboarding/fund")).json();
        if (!config?.enabled) return;

        setStatus("funding");

        const issuedAt = new Date().toISOString();
        const message = [
          "GIWA Trust Escrow",
          "",
          "시작 지원금 받기",
          `주소: ${address}`,
          `체인: ${giwaSepolia.id}`,
          `시각: ${issuedAt}`,
          "",
          "이 서명으로 가스비가 들지 않으며, 자금이 이동하지 않습니다.",
        ].join("\n");

        const signature = await signMessageAsync({ message });

        const res = await fetch("/api/onboarding/fund", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address, issuedAt, signature }),
        });

        if (!res.ok) {
          setStatus("failed");
          return;
        }

        setStatus("done");
        await refetch();
        await queryClient.invalidateQueries();
      } catch {
        setStatus("failed");
      }
    })();
  }, [address, isConnected, chainId, balance, signMessageAsync, refetch, queryClient]);

  return { status, balance: balance?.value };
}
