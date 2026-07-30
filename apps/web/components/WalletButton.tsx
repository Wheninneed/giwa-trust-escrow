"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { GIWA_SEPOLIA_ID, shortAddress, toKoreanError } from "shared";
import { useToast } from "./Toast";
import { Spinner } from "./ui";

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const toast = useToast();

  const injectedConnector = connectors.find((c) => c.type === "injected") ?? connectors[0];

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
