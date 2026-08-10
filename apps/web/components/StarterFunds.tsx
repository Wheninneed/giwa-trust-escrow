"use client";

import { useStarterFunds } from "@/lib/useStarterFunds";
import { Spinner } from "./ui";

/**
 * 시작 지원금 지급 상태를 알린다.
 * 평소에는 아무것도 보이지 않고, 준비 중이거나 실패했을 때만 나타난다.
 */
export function StarterFunds() {
  const { status } = useStarterFunds();

  if (status === "funding") {
    return (
      <div className="notice" data-tone="info">
        <span className="row" style={{ gap: 8 }}>
          <Spinner dark />
          계약에 필요한 가스비와 테스트 토큰을 넣어드리고 있습니다. 잠시만 기다려 주세요.
        </span>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="notice" data-tone="info">
        가스비와 테스트 토큰을 넣어드렸습니다. 바로 계약을 만들어 보실 수 있습니다.
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="notice" data-tone="warning">
        가스비를 자동으로 넣어드리지 못했습니다.{" "}
        <a className="link" href="https://faucet.giwa.io/" target="_blank" rel="noreferrer">
          GIWA faucet
        </a>{" "}
        에서 직접 받으신 뒤 새로고침해 주세요.
      </div>
    );
  }

  return null;
}
