"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { GIWA_SEPOLIA_ID, shortAddress, toKoreanError } from "shared";
import { useToast } from "./Toast";
import { Spinner } from "./ui";

/**
 * 지갑 확장 프로그램이 있는지 확인한다.
 * 서버에서는 알 수 없으므로 마운트 후에 판단하고, 그전까지는 null 을 돌려준다.
 */
function useHasWallet() {
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () => setHasWallet(Boolean((window as { ethereum?: unknown }).ethereum));
    check();
    // 확장 프로그램이 늦게 주입되는 경우가 있어 한 번 더 확인한다
    window.addEventListener("ethereum#initialized", check);
    const timer = setTimeout(check, 1200);
    return () => {
      window.removeEventListener("ethereum#initialized", check);
      clearTimeout(timer);
    };
  }, []);

  return hasWallet;
}

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const toast = useToast();
  const hasWallet = useHasWallet();

  const injectedConnector = connectors.find((c) => c.type === "injected") ?? connectors[0];

  // 지갑이 없으면 실패할 게 뻔한 연결 버튼 대신 설치 경로를 안내한다
  if (!isConnected && hasWallet === false) {
    return (
      <a
        className="btn btn-secondary btn-sm"
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        title="이 브라우저에서 지갑을 찾지 못했습니다"
      >
        지갑 설치하기 ↗
      </a>
    );
  }

  if (!isConnected) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={isPending || !injectedConnector}
        onClick={() => {
          if (!injectedConnector) {
            toast.push("브라우저에서 지갑을 찾지 못했습니다. 메타마스크를 설치해 주세요.", "danger");
            return;
          }
          connect(
            { connector: injectedConnector },
            { onError: (error) => toast.push(toKoreanError(error), "danger") },
          );
        }}
      >
        {isPending ? <Spinner /> : null}
        지갑 연결
      </button>
    );
  }

  if (chainId !== GIWA_SEPOLIA_ID) {
    return (
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={isSwitching}
        onClick={() =>
          switchChain(
            { chainId: GIWA_SEPOLIA_ID },
            { onError: (error) => toast.push(toKoreanError(error), "danger") },
          )
        }
      >
        {isSwitching ? <Spinner /> : null}
        GIWA로 전환
      </button>
    );
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm mono" onClick={() => disconnect()} title="연결 해제">
      {shortAddress(address)}
    </button>
  );
}
