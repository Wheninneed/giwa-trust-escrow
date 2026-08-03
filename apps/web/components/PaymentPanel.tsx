"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  explorerTx,
  formatMkrwWithUnit,
  milestoneTitle,
  toKoreanAmount,
  type AgreementMetadata,
  type Agreement,
  type Role,
} from "shared";
import { readSeenReleased, usePayments, writeSeenReleased } from "@/lib/usePayments";
import { Amount } from "./ui";

/**
 * 자금이 실제로 오간 기록.
 * 업체에게는 "지금까지 얼마 받았는지" 와 "아직 확인하지 않은 입금" 을 먼저 보여준다.
 * 누적 금액만 보고 직접 빼서 계산하게 만들면 안 된다.
 */
export function PaymentPanel({
  agreementId,
  agreement,
  metadata,
  role,
}: {
  agreementId: bigint;
  agreement: Agreement;
  metadata: AgreementMetadata;
  role: Role;
}) {
  const { address } = useAccount();
  const { data: payments, isLoading } = usePayments(agreementId);

  const [seen, setSeen] = useState<bigint | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSeen(readSeenReleased(agreementId, address));
    setReady(true);
  }, [agreementId, address]);

  const released = agreement.totalReleased;

  // 처음 방문이면 놀라게 하지 않는다. 현재 금액을 기준선으로 삼는다.
  useEffect(() => {
    if (!ready || seen !== null) return;
    writeSeenReleased(agreementId, address, released);
    setSeen(released);
  }, [ready, seen, agreementId, address, released]);

  const unseen = seen !== null && released > seen ? released - seen : 0n;
  const isProvider = role === "provider";

  const acknowledge = () => {
    writeSeenReleased(agreementId, address, released);
    setSeen(released);
  };

  return (
    <section className="card stack stack-16">
      <h3 className="section-title">자금 흐름</h3>

      {isProvider && unseen > 0n && (
        <div className="card-brand stack stack-12">
          <div className="stack stack-4">
            <span className="label">새로 들어온 금액</span>
            <Amount value={unseen} size="lg" />
          </div>
          <p style={{ fontSize: 14, color: "var(--brand-ink)" }}>
            마지막으로 확인한 뒤 지급된 금액입니다. 지갑에서도 확인해 보세요.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={acknowledge}>
            확인했습니다
          </button>
        </div>
      )}

      <dl className="kv">
        {isProvider ? (
          <>
            <dt>지금까지 받은 금액</dt>
            <dd>
              <Amount value={released} size="sm" />
            </dd>
            <dt>앞으로 받을 수 있는 금액</dt>
            <dd>{formatMkrwWithUnit(agreement.totalFunded - released - agreement.totalRefunded)}</dd>
          </>
        ) : (
          <>
            <dt>업체에게 지급</dt>
            <dd>
              <Amount value={released} size="sm" />
            </dd>
            <dt>고객에게 환불</dt>
            <dd>{formatMkrwWithUnit(agreement.totalRefunded)}</dd>
            <dt>아직 잠긴 금액</dt>
            <dd>{formatMkrwWithUnit(agreement.totalFunded - released - agreement.totalRefunded)}</dd>
          </>
        )}
      </dl>

      <hr className="divider" />

      {isLoading && <span className="muted">불러오는 중…</span>}

      {payments?.length === 0 && <span className="muted">아직 지급된 금액이 없습니다.</span>}

      {payments?.map((payment) => (
        <div key={`${payment.txHash}-${payment.milestoneIndex}`} className="stack stack-4">
          <div className="row-between wrap" style={{ gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{milestoneTitle(metadata, payment.milestoneIndex)}</span>
            <span className="badge" data-tone={payment.byArbitration ? "warning" : "success"}>
              {payment.byArbitration ? "중재 정산" : "승인 지급"}
            </span>
          </div>

          <div className="row-between">
            <span className="muted">업체 지급</span>
            <span className="num" style={{ fontWeight: 600 }}>
              {formatMkrwWithUnit(payment.toProvider)}
              <span className="muted" style={{ fontWeight: 400 }}> · {toKoreanAmount(payment.toProvider)}</span>
            </span>
          </div>

          {payment.toClient > 0n && (
            <div className="row-between">
              <span className="muted">고객 환불</span>
              <span className="num">{formatMkrwWithUnit(payment.toClient)}</span>
            </div>
          )}

          <a className="link" href={explorerTx(payment.txHash)} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
            거래 확인 ↗
          </a>
          <hr className="divider" />
        </div>
      ))}
    </section>
  );
}
