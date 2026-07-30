"use client";

import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import {
  GIWA_FAUCET_URL,
  explorerAddress,
  formatMkrwWithUnit,
  toKoreanAmount,
} from "shared";
import { MOCK_KRW_ADDRESS, mockKrwContract } from "@/lib/contracts";
import { useTx } from "@/lib/useTx";
import { useTokenBalance } from "@/lib/useAgreements";
import { SetupGuard } from "@/components/SetupGuard";
import { AddressChip, Notice, Spinner, TestnetBanner } from "@/components/ui";

export default function FaucetPage() {
  return (
    <div className="shell page">
      <div className="stack stack-24" style={{ maxWidth: 560 }}>
        <div className="stack stack-8">
          <h1 className="page-title">테스트 토큰 받기</h1>
          <p className="lead">데모에 필요한 두 가지를 여기서 받습니다. 둘 다 실제 가치가 없는 테스트용입니다.</p>
        </div>

        <TestnetBanner />

        <SetupGuard>
          <FaucetPanel />
        </SetupGuard>
      </div>
    </div>
  );
}

function FaucetPanel() {
  const { address } = useAccount();
  const { run, isPending } = useTx();

  const { data: ethBalance } = useBalance({ address });
  const { data: krwBalance } = useTokenBalance(MOCK_KRW_ADDRESS);
  const { data: faucetAmount } = useReadContract({ ...mockKrwContract, functionName: "FAUCET_AMOUNT" });
  const { data: availableAt } = useReadContract({
    ...mockKrwContract,
    functionName: "faucetAvailableAt",
    args: [address!],
    query: { enabled: Boolean(address) },
  });

  const now = BigInt(Math.floor(Date.now() / 1000));
  const cooldownLeft = availableAt && availableAt > now ? Number(availableAt - now) : 0;

  return (
    <div className="stack stack-16">
      <section className="card stack stack-16">
        <div className="row-between">
          <div className="stack stack-4">
            <span className="label">1. 가스비용 테스트 ETH</span>
            <span className="muted">트랜잭션 수수료로 쓰입니다</span>
          </div>
          <span className="num" style={{ fontWeight: 700 }}>
            {ethBalance ? `${Number(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4)} ETH` : "-"}
          </span>
        </div>

        {ethBalance && ethBalance.value === 0n && (
          <Notice tone="warning">
            테스트 ETH 가 없으면 어떤 거래도 보낼 수 없습니다. 아래 버튼으로 먼저 받아 주세요.
          </Notice>
        )}

        <a href={GIWA_FAUCET_URL} target="_blank" rel="noreferrer" className="btn btn-secondary btn-block">
          GIWA faucet 열기 ↗
        </a>
      </section>

      <section className="card stack stack-16">
        <div className="row-between">
          <div className="stack stack-4">
            <span className="label">2. 계약 대금용 mKRW</span>
            <span className="muted">계약금 예치에 쓰입니다</span>
          </div>
          <div className="right stack stack-4">
            <span className="num" style={{ fontWeight: 700 }}>
              {krwBalance !== undefined ? formatMkrwWithUnit(krwBalance) : "-"}
            </span>
            {krwBalance !== undefined && <span className="muted">{toKoreanAmount(krwBalance)}</span>}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={isPending || cooldownLeft > 0}
          onClick={() => run("테스트 토큰 받기", { ...mockKrwContract, functionName: "faucet" })}
        >
          {isPending ? <Spinner /> : null}
          {cooldownLeft > 0
            ? `${Math.ceil(cooldownLeft / 60)}분 뒤에 다시 받을 수 있어요`
            : faucetAmount
              ? `${formatMkrwWithUnit(faucetAmount)} 받기`
              : "mKRW 받기"}
        </button>

        <p className="hint">
          한 번 받으면 1시간 뒤에 다시 받을 수 있습니다. 데모 계약(5,000만 mKRW)을 여러 건 만들 수 있는 양입니다.
        </p>
      </section>

      <section className="card-soft stack stack-8">
        <span className="label">배포된 컨트랙트</span>
        <div className="row-between">
          <span className="muted">mKRW 토큰</span>
          <AddressChip address={MOCK_KRW_ADDRESS} />
        </div>
        <div className="row-between">
          <span className="muted">에스크로</span>
          <AddressChip address={process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS} />
        </div>
        {MOCK_KRW_ADDRESS && (
          <a className="link" href={explorerAddress(MOCK_KRW_ADDRESS)} target="_blank" rel="noreferrer">
            익스플로러에서 보기 ↗
          </a>
        )}
      </section>
    </div>
  );
}
