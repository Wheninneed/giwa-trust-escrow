"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { GIWA_SEPOLIA_ID, shortAddress, toKoreanError } from "shared";
import { useToast } from "./Toast";
import { Modal, Spinner } from "./ui";

/**
 * 브라우저에 실제로 설치된 지갑을 찾는다.
 *
 * 최신 지갑들은 EIP-6963 으로 자신을 알리며, OKX·Rabby 처럼 window.ethereum 을
 * 차지하지 않는 경우도 많다. 그래서 window.ethereum 만 보고 판단하면 안 되고,
 * wagmi 가 찾아낸 커넥터마다 provider 가 실제로 있는지 확인해야 한다.
 */
function useAvailableConnectors() {
  const { connectors } = useConnect();
  const [available, setAvailable] = useState<Connector[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const checked = await Promise.all(
        connectors.map(async (connector) => {
          try {
            const provider = await connector.getProvider();
            return provider ? connector : null;
          } catch {
            // provider 가 없으면 설치되지 않은 지갑이다
            return null;
          }
        }),
      );

      if (cancelled) return;

      // 같은 지갑이 EIP-6963 과 window.ethereum 양쪽으로 잡히면 하나만 남긴다
      const seen = new Set<string>();
      const unique = checked.filter((connector): connector is Connector => {
        if (!connector) return false;
        const key = connector.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setAvailable(unique);
    })();

    return () => {
      cancelled = true;
    };
  }, [connectors]);

  return available;
}

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const toast = useToast();

  const available = useAvailableConnectors();
  const [pickerOpen, setPickerOpen] = useState(false);

  const connectWith = useMemo(
    () => (connector: Connector) => {
      setPickerOpen(false);
      connect({ connector }, { onError: (error) => toast.push(toKoreanError(error), "danger") });
    },
    [connect, toast],
  );

  if (isConnected) {
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

  // 설치된 지갑이 하나도 없을 때만 설치 경로를 안내한다
  if (available !== null && available.length === 0) {
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

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={isPending || available === null}
        onClick={() => {
          if (!available || available.length === 0) return;
          // 하나뿐이면 고를 이유가 없다
          if (available.length === 1) connectWith(available[0]);
          else setPickerOpen(true);
        }}
      >
        {isPending || available === null ? <Spinner /> : null}
        지갑 연결
      </button>

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="지갑 선택">
        <div className="stack stack-8">
          {available?.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              className="btn btn-secondary btn-lg btn-block"
              style={{ justifyContent: "flex-start" }}
              onClick={() => connectWith(connector)}
            >
              {connector.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={connector.icon} alt="" width={20} height={20} style={{ borderRadius: 4 }} />
              )}
              {connector.name}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
