"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { useState } from "react";
import {
  AgreementStatus,
  MilestoneStatus,
  agreementLabel,
  explorerAddress,
  explorerTx,
  formatDate,
  formatDateTime,
  formatMkrwWithUnit,
  milestoneLabel,
  milestoneTitle,
  nextAction,
  roleLabel,
  shortAddress,
} from "shared";
import { ESCROW_ADDRESS, escrowContract, mockKrwContract, MOCK_KRW_ADDRESS } from "@/lib/contracts";
import { useAgreementDetail } from "@/lib/useAgreements";
import { NOTE_KIND_LABEL, useActivity } from "@/lib/useActivity";
import { useTx } from "@/lib/useTx";
import { isZeroHash } from "@/lib/hash";
import { SetupGuard } from "@/components/SetupGuard";
import { AddressChip, Amount, Badge, Notice, Spinner } from "@/components/ui";
import { MilestoneActions } from "@/components/MilestoneActions";
import { CancellationPanel, ChangeOrderPanel } from "@/components/AgreementPanels";

export default function AgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : undefined;

  return (
    <div className="shell page">
      <div className="stack stack-24">
        <Link href="/agreements" className="btn-quiet" style={{ alignSelf: "flex-start" }}>
          ← 내 계약
        </Link>

        {/* 계약 상세는 지갑 없이도 읽을 수 있어야 한다. 링크를 받은 사람이
            바로 현황을 확인하고, 행동이 필요할 때만 지갑을 연결하게 한다. */}
        <SetupGuard requireWallet={false}>
          {id === undefined ? (
            <Notice tone="danger">잘못된 계약 번호입니다.</Notice>
          ) : (
            <Detail id={id} />
          )}
        </SetupGuard>
      </div>
    </div>
  );
}

function Detail({ id }: { id: bigint }) {
  const { detail, isLoading, error } = useAgreementDetail(id);
  const activity = useActivity(id);

  if (isLoading) {
    return <div className="card-soft center muted" style={{ padding: 48 }}>계약을 불러오는 중입니다…</div>;
  }

  if (error || !detail) {
    return (
      <Notice tone="danger" title="계약을 불러오지 못했습니다">
        번호 {id.toString()} 번 계약이 없거나 GIWA RPC 연결에 문제가 있습니다.
      </Notice>
    );
  }

  const { agreement, milestones, changeOrders, escrowBalance, firstUnsettled, role, metadata } = detail;
  const activeMilestone = milestones[firstUnsettled];

  const action = nextAction({
    role,
    agreementStatus: agreement.status,
    milestoneStatus: activeMilestone?.status,
    isRetentionMatured:
      activeMilestone?.isRetention && Number(activeMilestone.retentionReleaseAt) * 1000 <= Date.now(),
  });

  return (
    <div className="stack stack-24">
      <header className="stack stack-16">
        <div className="row wrap" style={{ gap: 8 }}>
          <Badge label={agreementLabel[agreement.status]} />
          <span className="badge" data-tone="neutral">
            내 역할: {roleLabel[role]}
          </span>
          <span className="muted mono">#{id.toString()}</span>
        </div>

        <h1 className="page-title">{metadata.t}</h1>
        {metadata.d && <p className="lead">{metadata.d}</p>}
      </header>

      {role === "observer" && <ObserverNotice />}

      {role !== "observer" && action && (
        <Notice tone={agreement.status === AgreementStatus.Disputed ? "danger" : "info"} title="지금 할 일">
          {action}
        </Notice>
      )}

      <FundBanner id={id} detail={detail} />

      <section className="card stack stack-16">
        <div className="row-between wrap" style={{ alignItems: "flex-start" }}>
          <div className="stack stack-4">
            <span className="label">지금 잠겨 있는 금액</span>
            <Amount value={escrowBalance} size="lg" />
          </div>
          <div className="right stack stack-8">
            <div className="stack stack-4">
              <span className="label">총 계약금</span>
              <span className="num" style={{ fontWeight: 700 }}>
                {formatMkrwWithUnit(agreement.totalFunded > 0n ? agreement.totalFunded : agreement.originalAmount)}
              </span>
            </div>
            <div className="stack stack-4">
              <span className="label">지급 완료</span>
              <span className="num" style={{ fontWeight: 700, color: "var(--success)" }}>
                {formatMkrwWithUnit(agreement.totalReleased)}
              </span>
            </div>
            {agreement.totalRefunded > 0n && (
              <div className="stack stack-4">
                <span className="label">고객 환불</span>
                <span className="num" style={{ fontWeight: 700 }}>
                  {formatMkrwWithUnit(agreement.totalRefunded)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bar">
          <div
            className="bar-fill"
            data-tone="success"
            style={{
              width: `${
                agreement.totalFunded > 0n ? Number((agreement.totalReleased * 100n) / agreement.totalFunded) : 0
              }%`,
            }}
          />
        </div>

        <hr className="divider" />

        <dl className="kv">
          <dt>고객</dt>
          <dd>
            <AddressChip address={agreement.client} />
          </dd>
          <dt>업체</dt>
          <dd>
            <AddressChip address={agreement.provider} />
          </dd>
          <dt>중재자</dt>
          <dd>
            <AddressChip address={agreement.arbiter} />
          </dd>
          <dt>생성일</dt>
          <dd>{formatDate(agreement.createdAt)}</dd>
          <dt>예치일</dt>
          <dd>{agreement.fundedAt > 0n ? formatDate(agreement.fundedAt) : "예치 전"}</dd>
        </dl>

        <a
          className="link"
          href={explorerAddress(ESCROW_ADDRESS ?? "")}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 14 }}
        >
          GIWA 익스플로러에서 컨트랙트 보기 ↗
        </a>
      </section>

      <section className="stack stack-16">
        <h2 className="section-title">작업 단계</h2>
        <div className="timeline">
          {milestones.map((milestone, index) => {
            const isLast = index === milestones.length - 1;
            const isActive = index === firstUnsettled;
            const label = milestoneLabel[milestone.status];

            return (
              <div className="tl-item" key={index}>
                <div className="tl-rail">
                  <span className="tl-dot" data-tone={label.tone}>
                    {milestone.status === MilestoneStatus.Paid ? "✓" : index + 1}
                  </span>
                  {!isLast && <span className="tl-line" />}
                </div>

                <div className="tl-body">
                  <div
                    className="card stack stack-8"
                    style={isActive ? { borderColor: "var(--brand)", boxShadow: "var(--shadow)" } : undefined}
                  >
                    <div className="row-between wrap" style={{ gap: 8 }}>
                      <strong>{milestoneTitle(metadata, index)}</strong>
                      <Badge label={label} />
                    </div>

                    <div className="row-between">
                      <Amount value={milestone.amount} size="sm" />
                      <span className="muted">예정 {formatDate(milestone.dueAt)}</span>
                    </div>

                    {milestone.isRetention && (
                      <span className="badge" data-tone="info" style={{ alignSelf: "flex-start" }}>
                        하자보증금 · {formatDate(milestone.retentionReleaseAt)} 이후 지급
                      </span>
                    )}

                    {metadata.ev?.[index] && <span className="muted">증빙: {metadata.ev[index]}</span>}

                    {!isZeroHash(milestone.evidenceHash) && (
                      <details>
                        <summary className="muted" style={{ cursor: "pointer", fontSize: 13 }}>
                          증빙 파일 지문 보기
                        </summary>
                        <code className="mono" style={{ wordBreak: "break-all", color: "var(--ink-2)" }}>
                          {milestone.evidenceHash}
                        </code>
                        <p className="hint" style={{ marginTop: 4 }}>
                          상대방이 보낸 파일의 SHA-256 이 이 값과 같으면 제출된 그 파일이 맞습니다.
                        </p>
                      </details>
                    )}

                    {milestone.submittedAt > 0n && (
                      <span className="muted">제출 {formatDateTime(milestone.submittedAt)}</span>
                    )}

                    <MilestoneActions
                      agreementId={id}
                      index={index}
                      milestone={milestone}
                      role={role}
                      agreementStatus={agreement.status}
                      isActive={isActive}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ChangeOrderPanel agreementId={id} agreement={agreement} changeOrders={changeOrders} role={role} />

      <CancellationPanel
        agreementId={id}
        agreement={agreement}
        role={role}
        escrowBalance={escrowBalance}
        cancelProposer={detail.cancelProposer}
      />

      <section className="card stack stack-12">
        <h3 className="section-title">활동 내역</h3>
        {activity.isLoading && <span className="muted">불러오는 중…</span>}
        {activity.error && <span className="muted">기록을 불러오지 못했습니다. RPC 상태를 확인해 주세요.</span>}
        {activity.data?.length === 0 && <span className="muted">아직 남긴 설명이 없습니다.</span>}

        {activity.data?.map((entry) => (
          <div key={`${entry.txHash}-${entry.kind}`} className="stack stack-4">
            <div className="row wrap" style={{ gap: 8 }}>
              <span className="badge" data-tone="neutral">
                {NOTE_KIND_LABEL[entry.kind] ?? "기록"}
              </span>
              {entry.milestoneIndex !== null && (
                <span className="muted">{milestoneTitle(metadata, entry.milestoneIndex)}</span>
              )}
              <span className="muted mono">{shortAddress(entry.author)}</span>
              <a className="link" href={explorerTx(entry.txHash)} target="_blank" rel="noreferrer">
                거래 ↗
              </a>
            </div>
            <p style={{ color: "var(--ink-2)" }}>{entry.note}</p>
            <hr className="divider" />
          </div>
        ))}
      </section>
    </div>
  );
}

/** 당사자가 아닌 사람에게는 읽기 전용임을 분명히 알린다 */
function ObserverNotice() {
  const { isConnected } = useAccount();

  return (
    <Notice tone="neutral" title="읽기 전용으로 보고 있습니다">
      {isConnected
        ? "연결된 지갑은 이 계약의 고객·업체·중재자가 아닙니다. 금액과 진행 상황은 볼 수 있지만 승인이나 제출은 할 수 없습니다."
        : "지갑을 연결하지 않아도 계약 현황은 볼 수 있습니다. 승인·제출 같은 행동을 하려면 해당 역할의 지갑을 연결해 주세요."}
    </Notice>
  );
}

/** 예치 전이라면 고객에게 딱 하나의 행동만 강조한다 */
function FundBanner({ id, detail }: { id: bigint; detail: ReturnType<typeof useAgreementDetail>["detail"] }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { run, isPending } = useTx();
  const [busy, setBusy] = useState(false);

  if (!detail || detail.agreement.status !== AgreementStatus.Created) return null;
  if (detail.role !== "client") {
    return (
      <Notice tone="warning" title="아직 예치 전입니다">
        고객이 계약금을 예치하면 작업을 시작할 수 있습니다.
      </Notice>
    );
  }

  const amount = detail.agreement.originalAmount;

  async function fund() {
    if (!publicClient || !address) return;
    setBusy(true);
    try {
      const allowance = (await publicClient.readContract({
        ...mockKrwContract,
        functionName: "allowance",
        args: [address, ESCROW_ADDRESS as Address],
      })) as bigint;

      if (allowance < amount) {
        await run("토큰 사용 승인", {
          ...mockKrwContract,
          functionName: "approve",
          args: [ESCROW_ADDRESS as Address, amount],
        });
      }

      await run("계약금 예치", { ...escrowContract, functionName: "fundAgreement", args: [id] });
    } catch {
      // useTx 가 이미 사용자에게 알렸다
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-brand stack stack-12">
      <div className="stack stack-4">
        <span className="label">예치해야 할 금액</span>
        <Amount value={amount} size="lg" />
      </div>
      <p style={{ fontSize: 14.5, color: "var(--brand-ink)" }}>
        예치하면 총액이 컨트랙트에 잠기고, 승인한 단계의 금액만 순서대로 업체에게 나갑니다.
      </p>
      <button type="button" className="btn btn-primary btn-lg btn-block" disabled={busy || isPending} onClick={fund}>
        {busy || isPending ? <Spinner /> : null}
        계약금 예치하기
      </button>
      <span className="hint">
        mKRW 가 부족하면 <Link href="/faucet" className="link">테스트 토큰 화면</Link>에서 먼저 받아 주세요. (토큰:{" "}
        {shortAddress(MOCK_KRW_ADDRESS)})
      </span>
    </section>
  );
}
