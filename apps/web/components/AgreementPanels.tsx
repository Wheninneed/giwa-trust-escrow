"use client";

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import {
  AgreementStatus,
  ChangeOrderStatus,
  changeOrderLabel,
  formatDate,
  formatMkrwWithUnit,
  parseChangeOrderMetadata,
  parseMkrw,
  shortAddress,
  toKoreanAmount,
  type Agreement,
  type ChangeOrder,
  type Role,
} from "shared";
import { ESCROW_ADDRESS, escrowContract, mockKrwContract } from "@/lib/contracts";
import { hashText } from "@/lib/hash";
import { useTx } from "@/lib/useTx";
import { Badge, Modal, Notice, Spinner } from "./ui";

const sameAddress = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export function ChangeOrderPanel({
  agreementId,
  agreement,
  changeOrders,
  role,
}: {
  agreementId: bigint;
  agreement: Agreement;
  changeOrders: ChangeOrder[];
  role: Role;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { run, isPending } = useTx();
  const [open, setOpen] = useState(false);

  const isParty = role === "client" || role === "provider";
  const canPropose = isParty && agreement.status === AgreementStatus.Active;

  async function fundChangeOrder(changeOrder: ChangeOrder) {
    if (!publicClient || !address) return;

    // 한도가 모자랄 때만 approve 를 한 번 더 받는다
    const allowance = (await publicClient.readContract({
      ...mockKrwContract,
      functionName: "allowance",
      args: [address, ESCROW_ADDRESS as Address],
    })) as bigint;

    if (allowance < changeOrder.additionalAmount) {
      await run("추가금 사용 승인", {
        ...mockKrwContract,
        functionName: "approve",
        args: [ESCROW_ADDRESS as Address, changeOrder.additionalAmount],
      });
    }

    await run("추가금 예치", {
      ...escrowContract,
      functionName: "fundChangeOrder",
      args: [agreementId, changeOrder.id],
    });
  }

  return (
    <section className="card stack stack-16">
      <div className="row-between">
        <h3 className="section-title">변경계약</h3>
        {canPropose && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
            추가 작업 제안
          </button>
        )}
      </div>

      {changeOrders.length === 0 ? (
        <p className="muted">아직 추가 작업이 없습니다. 공사 중 생긴 추가금은 여기에 기록하세요.</p>
      ) : (
        <div className="stack stack-12">
          {changeOrders.map((changeOrder) => {
            const metadata = parseChangeOrderMetadata(changeOrder.metadataURI);
            const isProposer = sameAddress(changeOrder.proposer, address);
            const canAccept = isParty && !isProposer && changeOrder.status === ChangeOrderStatus.Proposed;
            const canFund = role === "client" && changeOrder.status === ChangeOrderStatus.Accepted;

            return (
              <div key={changeOrder.id.toString()} className="card-soft stack stack-8">
                <div className="row-between">
                  <strong>{metadata.t}</strong>
                  <Badge label={changeOrderLabel[changeOrder.status]} />
                </div>

                {metadata.d && <p className="muted">{metadata.d}</p>}

                <dl className="kv">
                  <dt>추가금</dt>
                  <dd>{formatMkrwWithUnit(changeOrder.additionalAmount)}</dd>
                  <dt>추가 기간</dt>
                  <dd>{Number(changeOrder.additionalDays)}일</dd>
                  <dt>제안자</dt>
                  <dd className="mono">
                    {shortAddress(changeOrder.proposer)}
                    {isProposer ? " (나)" : ""}
                  </dd>
                  <dt>제안일</dt>
                  <dd>{formatDate(changeOrder.proposedAt)}</dd>
                </dl>

                {(canAccept || canFund) && (
                  <div className="row wrap" style={{ gap: 8 }}>
                    {canAccept && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={isPending}
                        onClick={() =>
                          run("변경계약 승인", {
                            ...escrowContract,
                            functionName: "acceptChangeOrder",
                            args: [agreementId, changeOrder.id],
                          })
                        }
                      >
                        {isPending ? <Spinner /> : null}
                        승인
                      </button>
                    )}
                    {canFund && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={isPending}
                        onClick={() => fundChangeOrder(changeOrder)}
                      >
                        {isPending ? <Spinner /> : null}
                        추가금 {formatMkrwWithUnit(changeOrder.additionalAmount)} 예치
                      </button>
                    )}
                  </div>
                )}

                {changeOrder.status === ChangeOrderStatus.Accepted && role !== "client" && (
                  <span className="muted">고객이 추가금을 예치하면 새 단계가 열립니다.</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ProposeChangeOrderDialog open={open} onClose={() => setOpen(false)} agreementId={agreementId} />
    </section>
  );
}

function ProposeChangeOrderDialog({
  open,
  onClose,
  agreementId,
}: {
  open: boolean;
  onClose: () => void;
  agreementId: bigint;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("1");
  const { run, isPending } = useTx();

  const additional = parseMkrw(amount || "0");

  return (
    <Modal open={open} onClose={onClose} title="추가 작업 제안">
      <div className="stack stack-16">
        <Notice tone="neutral">
          상대방이 승인해야 효력이 생깁니다. 추가금이 있으면 고객이 예치한 뒤에 새 작업 단계가 열립니다.
        </Notice>

        <div className="field">
          <label className="label" htmlFor="co-title">
            추가 작업명
          </label>
          <input
            id="co-title"
            className="input"
            value={title}
            placeholder="예: 거실 콘센트 4구 추가 및 배선 변경"
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="co-desc">
            설명 (선택)
          </label>
          <textarea
            id="co-desc"
            className="textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
        </div>

        <div className="row" style={{ gap: 8 }}>
          <div className="field grow">
            <label className="label" htmlFor="co-amount">
              추가금 (mKRW)
            </label>
            <input
              id="co-amount"
              className="input num"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="field grow">
            <label className="label" htmlFor="co-days">
              추가 기간 (일)
            </label>
            <input
              id="co-days"
              className="input num"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
        </div>

        {additional > 0n && <span className="hint">{toKoreanAmount(additional)}</span>}
        {additional === 0n && (
          <Notice tone="neutral">추가금이 0이면 기간·범위 변경 기록으로만 남고 새 단계는 생기지 않습니다.</Notice>
        )}

        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={!title.trim() || isPending}
          onClick={async () => {
            const metadata = JSON.stringify({ t: title.trim(), d: description.trim() || undefined });
            await run("변경계약 제안", {
              ...escrowContract,
              functionName: "proposeChangeOrder",
              args: [agreementId, additional, BigInt(days || "0"), hashText(metadata), metadata],
            });
            setTitle("");
            setDescription("");
            setAmount("");
            onClose();
          }}
        >
          {isPending ? <Spinner /> : null}
          제안 보내기
        </button>
      </div>
    </Modal>
  );
}

export function CancellationPanel({
  agreementId,
  agreement,
  role,
  escrowBalance,
  cancelProposer,
}: {
  agreementId: bigint;
  agreement: Agreement;
  role: Role;
  escrowBalance: bigint;
  cancelProposer: string;
}) {
  const { address } = useAccount();
  const { run, isPending } = useTx();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const isParty = role === "client" || role === "provider";
  if (!isParty) return null;

  const canPropose = agreement.status === AgreementStatus.Active;
  const isPendingCancel = agreement.status === AgreementStatus.CancelPending;
  const iProposed = sameAddress(cancelProposer, address);

  if (!canPropose && !isPendingCancel) return null;

  return (
    <section className="card stack stack-12">
      <h3 className="section-title">계약 취소</h3>

      {isPendingCancel ? (
        <>
          <Notice tone="warning">
            {iProposed
              ? "취소를 제안했습니다. 상대방이 수락하면 남은 금액이 고객에게 환불됩니다."
              : "상대방이 계약 취소를 제안했습니다. 수락하면 남은 금액이 고객에게 환불됩니다."}
          </Notice>
          <dl className="kv">
            <dt>환불될 금액</dt>
            <dd>{formatMkrwWithUnit(escrowBalance)}</dd>
            <dt>이미 지급된 금액</dt>
            <dd>{formatMkrwWithUnit(agreement.totalReleased)}</dd>
          </dl>
          {!iProposed && (
            <button
              type="button"
              className="btn btn-danger btn-block"
              disabled={isPending}
              onClick={() =>
                run("계약 취소 수락", { ...escrowContract, functionName: "acceptCancellation", args: [agreementId] })
              }
            >
              {isPending ? <Spinner /> : null}
              취소 수락하고 잔액 환불
            </button>
          )}
        </>
      ) : (
        <>
          <p className="muted">
            양측이 모두 동의하면 계약을 끝내고 남은 미지급 금액을 고객에게 환불합니다. 이미 지급된 금액은 회수되지
            않습니다.
          </p>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>
            계약 취소 제안
          </button>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="계약 취소 제안">
        <div className="stack stack-16">
          <Notice tone="warning">
            상대방이 수락해야 취소됩니다. 수락되면 잠긴 {formatMkrwWithUnit(escrowBalance)} 가 고객에게 환불됩니다.
          </Notice>
          <div className="field">
            <label className="label" htmlFor="cancel-reason">
              사유
            </label>
            <textarea
              id="cancel-reason"
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="예: 현장 사정으로 공사를 중단합니다"
            />
          </div>
          <button
            type="button"
            className="btn btn-danger btn-lg btn-block"
            disabled={!reason.trim() || isPending}
            onClick={async () => {
              await run("취소 제안", {
                ...escrowContract,
                functionName: "proposeCancellation",
                args: [agreementId, hashText(reason), reason],
              });
              setReason("");
              setOpen(false);
            }}
          >
            {isPending ? <Spinner /> : null}
            취소 제안 보내기
          </button>
        </div>
      </Modal>
    </section>
  );
}
