"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, type Connector } from "wagmi";
import { GIWA_SEPOLIA_ID, shortAddress, toKoreanError } from "shared";
import { isSocialLoginEnabled } from "@/lib/privy";
import { useSocialLogin } from "@/lib/useSocialLogin";
import { useToast } from "./Toast";
import { Modal, Spinner } from "./ui";

export function WalletButton() {
  return isSocialLoginEnabled ? <PrivyButton /> : <WalletOnlyButton />;
}

/**
 * Privy 가 켜진 경우.
 *
 * 구글·이메일·설치형 지갑을 Privy 모달 하나가 모두 처리하므로 우리가 지갑
 * 목록을 따로 그리지 않는다. 지갑이 없는 사용자에게는 로그인과 동시에
 * 임베디드 지갑이 만들어지고, 그 지갑이 wagmi 로 넘어와 계약 호출에 쓰인다.
 */
function PrivyButton() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const social = useSocialLogin();
  const toast = useToast();

  if (social.isPending) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" disabled>
        <Spinner dark />
      </button>
    );
  }

  if (!social.isAuthenticated) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={async () => {
          try {
            await social.login();
          } catch (error) {
            toast.push(toKoreanError(error), "danger");
          }
        }}
      >
        시작하기
      </button>
    );
  }

  if (isConnected && chainId !== GIWA_SEPOLIA_ID) {
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
    <button
      type="button"
      className="btn btn-secondary btn-sm mono"
      title={social.label ?? "로그아웃"}
      onClick={() => social.logout()}
    >
      {shortAddress(address) || social.label || "로그아웃"}
    </button>
  );
}

/**
 * Privy 를 설정하지 않은 경우의 지갑 전용 경로.
 *
 * 최신 지갑들은 EIP-6963 으로 자신을 알리며, OKX·Rabby 처럼 window.ethereum 을
 * 차지하지 않는 경우도 많다. 그래서 커넥터마다 provider 가 실제로 있는지 확인한다.
 */
function WalletOnlyButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const toast = useToast();

  const [available, setAvailable] = useState<Connector[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const checked = await Promise.all(
        connectors.map(async (connector) => {
          try {
            return (await connector.getProvider()) ? connector : null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;

      const seen = new Set<string>();
      setAvailable(
        checked.filter((connector): connector is Connector => {
          if (!connector) return false;
          const key = connector.name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [connectors, pickerOpen]);

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

  if (available !== null && available.length === 0) {
    return (
      <a className="btn btn-secondary btn-sm" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
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
          if (!available?.length) return;
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
