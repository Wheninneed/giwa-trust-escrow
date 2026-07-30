"use client";

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { GIWA_FAUCET_URL, GIWA_SEPOLIA_ID } from "shared";
import { ESCROW_ADDRESS, MOCK_KRW_ADDRESS, isDeployed } from "@/lib/contracts";
import { Notice } from "./ui";
import { WalletButton } from "./WalletButton";

/**
 * 계약을 읽고 쓰기 전에 필요한 조건을 한 화면에 하나씩만 보여준다.
 * 1) 컨트랙트 주소 설정 2) 지갑 연결 3) 올바른 네트워크
 */
export function SetupGuard({ children, requireWallet = true }: { children: ReactNode; requireWallet?: boolean }) {
  const { isConnected, chainId } = useAccount();

  if (!isDeployed) {
    return (
      <Notice tone="warning" title="컨트랙트 주소가 설정되지 않았습니다">
        <p style={{ marginBottom: 8 }}>
          <code className="mono">apps/web/.env.local</code> 에 배포된 주소를 넣어 주세요. 배포는{" "}
          <code className="mono">pnpm deploy:giwa</code> 로 실행합니다.
        </p>
        <pre className="mono" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
          NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS={ESCROW_ADDRESS ?? "(비어 있음)"}
          {"\n"}
          NEXT_PUBLIC_MOCK_KRW_ADDRESS={MOCK_KRW_ADDRESS ?? "(비어 있음)"}
        </pre>
      </Notice>
    );
  }

  if (requireWallet && !isConnected) {
    return (
      <div className="card-soft center stack stack-16" style={{ padding: "48px 24px" }}>
        <strong style={{ fontSize: 17 }}>지갑을 연결해 주세요</strong>
        <p className="muted" style={{ maxWidth: 420, margin: "0 auto" }}>
          계약을 만들고 확인하려면 GIWA Sepolia 를 지원하는 지갑이 필요합니다. 가스비로 쓸 테스트 ETH 는{" "}
          <a className="link" href={GIWA_FAUCET_URL} target="_blank" rel="noreferrer">
            GIWA faucet
          </a>{" "}
          에서 받을 수 있습니다.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <WalletButton />
        </div>
        <p className="hint" style={{ maxWidth: 420, margin: "0 auto" }}>
          메타마스크·OKX월렛·Rabby 등 EVM 지갑이면 무엇이든 됩니다. 휴대폰이라면 지갑 앱을 열고{" "}
          <strong>앱 안의 브라우저</strong>로 이 주소를 여세요.
        </p>
      </div>
    );
  }

  if (requireWallet && isConnected && chainId !== GIWA_SEPOLIA_ID) {
    return (
      <div className="card-soft center stack stack-16" style={{ padding: "48px 24px" }}>
        <strong style={{ fontSize: 17 }}>네트워크를 GIWA Sepolia 로 바꿔 주세요</strong>
        <p className="muted">현재 지갑이 다른 네트워크에 연결되어 있습니다.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <WalletButton />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
