"use client";

import { useState } from "react";
import type { Hex } from "viem";
import {
  AgreementStatus,
  MilestoneStatus,
  formatMkrwWithUnit,
  parseMkrw,
  timeUntil,
  type Milestone,
  type Role,
} from "shared";
import { escrowContract } from "@/lib/contracts";
import { hashText } from "@/lib/hash";
import { useTx } from "@/lib/useTx";
import { EvidenceInput } from "./EvidenceInput";
import { Amount, Modal, Notice, Spinner } from "./ui";

interface Props {
  agreementId: bigint;
  index: number;
  milestone: Milestone;
  role: Role;
  agreementStatus: number;
  isActive: boolean;
}

type Dialog = "submit" | "approve" | "revision" | "dispute" | "resolve" | null;

export function MilestoneActions({ agreementId, index, milestone, role, agreementStatus, isActive }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const { run, isPending } = useTx();

  const close = () => setDialog(null);
  const status = milestone.status;

  const retentionLeft = milestone.isRetention ? timeUntil(milestone.retentionReleaseAt) : null;
  const canReleaseRetention =
    milestone.isRetention &&
    status === MilestoneStatus.Approved &&
    !retentionLeft &&
    agreementStatus === AgreementStatus.Active;

  const buttons: React.ReactNode[] = [];

  if (agreementStatus === AgreementStatus.Active && isActive) {
    if (role === "provider" && (status === MilestoneStatus.Pending || status === MilestoneStatus.RevisionRequested)) {
      buttons.push(
        <button key="submit" type="button" className="btn btn-primary btn-sm" onClick={() => setDialog("submit")}>
          {status === MilestoneStatus.RevisionRequested ? "보완해서 다시 제출" : "완료 증빙 제출"}
        </button>,
      );
    }

    if (role === "client" && status === MilestoneStatus.Submitted) {
      buttons.push(
        <button key="approve" type="button" className="btn btn-primary btn-sm" onClick={() => setDialog("approve")}>
          승인하고 지급
        </button>,
        <button key="revision" type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog("revision")}>
          보완 요청
        </button>,
      );
    }

    if (
      (role === "client" || role === "provider") &&
      (status === MilestoneStatus.Submitted ||
        status === MilestoneStatus.RevisionRequested ||
        (milestone.isRetention && status === MilestoneStatus.Approved))
    ) {
      buttons.push(
        <button key="dispute" type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog("dispute")}>
          분쟁 제기
        </button>,
      );
    }

    if (canReleaseRetention && (role === "client" || role === "provider")) {
      buttons.push(
        <button
          key="release"
          type="button"
          className="btn btn-primary btn-sm"
          disabled={isPending}
          onClick={() =>
            run("하자보증금 지급", {
              ...escrowContract,
              functionName: "releaseRetention",
              args: [agreementId, BigInt(index)],
            })
          }
        >
          {isPending ? <Spinner /> : null}
          하자보증금 지급하기
        </button>,
      );
    }
  }

  if (role === "arbiter" && status === MilestoneStatus.Disputed) {
    buttons.push(
      <button key="resolve" type="button" className="btn btn-danger btn-sm" onClick={() => setDialog("resolve")}>
        중재 결정하기
      </button>,
    );
  }

  return (
    <>
      {milestone.isRetention && status === MilestoneStatus.Approved && retentionLeft && (
        <div className="notice" data-tone="info" style={{ padding: "10px 12px", marginTop: 8 }}>
          하자보증 기간이 <strong>{retentionLeft}</strong> 남았습니다. 기간이 끝나면 지급할 수 있습니다.
        </div>
      )}

      {buttons.length > 0 && (
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {buttons}
        </div>
      )}

      <SubmitDialog
        open={dialog === "submit"}
        onClose={close}
        agreementId={agreementId}
        index={index}
        milestone={milestone}
      />
      <ApproveDialog
        open={dialog === "approve"}
        onClose={close}
        agreementId={agreementId}
        index={index}
        milestone={milestone}
      />
      <ReasonDialog
        open={dialog === "revision"}
        onClose={close}
        title="보완 요청"
        description="어떤 부분을 보완해야 하는지 적어 주세요. 업체가 새 증빙으로 다시 제출할 수 있습니다."
        confirmLabel="보완 요청 보내기"
        placeholder="예: 타일 줄눈 상태가 보이는 사진이 필요합니다"
        onConfirm={(reason) =>
          run("보완 요청", {
            ...escrowContract,
            functionName: "requestRevision",
            args: [agreementId, BigInt(index), hashText(reason), reason],
          })
        }
      />
      <ReasonDialog
        open={dialog === "dispute"}
        onClose={close}
        title="분쟁 제기"
        tone="danger"
        description="분쟁을 제기하면 이 단계의 금액이 즉시 동결되고, 중재자가 배분을 결정할 때까지 지급이 멈춥니다."
        confirmLabel="분쟁 제기하기"
        placeholder="분쟁 사유를 적어 주세요"
        onConfirm={(reason) =>
          run("분쟁 제기", {
            ...escrowContract,
            functionName: "raiseDispute",
            args: [agreementId, BigInt(index), hashText(reason), reason],
          })
        }
      />
      <ResolveDialog
        open={dialog === "resolve"}
        onClose={close}
        agreementId={agreementId}
        index={index}
        milestone={milestone}
      />
    </>
  );
}

function SubmitDialog({
  open,
  onClose,
  agreementId,
  index,
  milestone,
}: {
  open: boolean;
  onClose: () => void;
  agreementId: bigint;
  index: number;
  milestone: Milestone;
}) {
  const [evidence, setEvidence] = useState<{ hash?: Hex; fileName?: string }>({});
  const [note, setNote] = useState("");
  const { run, isPending } = useTx();

  return (
    <Modal open={open} onClose={onClose} title="작업 완료 증빙 제출">
      <div className="stack stack-16">
        <div className="row-between">
          <span className="label">이 단계 금액</span>
          <Amount value={milestone.amount} size="sm" />
        </div>

        <EvidenceInput value={evidence} onChange={setEvidence} />

        <div className="field">
          <label className="label" htmlFor="submit-note">
            설명 (선택)
          </label>
          <textarea
            id="submit-note"
            className="textarea"
            placeholder="어떤 작업을 완료했는지 간단히 적어 주세요"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg btn-block"
          disabled={!evidence.hash || isPending}
          onClick={async () => {
            await run("증빙 제출", {
              ...escrowContract,
              functionName: "submitMilestone",
              args: [agreementId, BigInt(index), evidence.hash as Hex, note || (evidence.fileName ?? "")],
            });
            onClose();
          }}
        >
          {isPending ? <Spinner /> : null}
          제출하기
        </button>
      </div>
    </Modal>
  );
}

function ApproveDialog({
  open,
  onClose,
  agreementId,
  index,
  milestone,
}: {
  open: boolean;
  onClose: () => void;
  agreementId: bigint;
  index: number;
  milestone: Milestone;
}) {
  const [note, setNote] = useState("");
  const { run, isPending } = useTx();

  return (
    <Modal open={open} onClose={onClose} title={milestone.isRetention ? "하자보증금 승인" : "승인하고 지급"}>
      <div className="stack stack-16">
        <div className="card-soft center stack stack-4">
          <span className="label">업체에게 지급될 금액</span>
          <Amount value={milestone.amount} size="lg" />
        </div>

        {milestone.isRetention ? (
          <Notice tone="info">
            하자보증금은 승인해도 바로 나가지 않습니다. 잠금 기간이 끝난 뒤에 지급할 수 있습니다.
          </Notice>
        ) : (
          <Notice tone="warning">
            승인하면 해당 단계의 대금이 업체 지갑으로 지급되며 <strong>일반 승인 절차로는 되돌릴 수 없습니다.</strong>
          </Notice>
        )}

        <div className="field">
          <label className="label" htmlFor="approve-note">
            메모 (선택)
          </label>
          <input
            id="approve-note"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="예: 확인했습니다"
          />
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-lg grow" onClick={onClose} disabled={isPending}>
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary btn-lg grow"
            disabled={isPending}
            onClick={async () => {
              await run("단계 승인", {
                ...escrowContract,
                functionName: "approveMilestone",
                args: [agreementId, BigInt(index), hashText(note || "승인"), note],
              });
              onClose();
            }}
          >
            {isPending ? <Spinner /> : null}
            승인
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ReasonDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  placeholder,
  tone = "neutral",
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  placeholder: string;
  tone?: "neutral" | "danger";
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="stack stack-16">
        <Notice tone={tone === "danger" ? "danger" : "neutral"}>{description}</Notice>

        <div className="field">
          <label className="label" htmlFor="reason-text">
            내용
          </label>
          <textarea
            id="reason-text"
            className="textarea"
            value={reason}
            placeholder={placeholder}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
          />
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-lg grow" onClick={onClose} disabled={busy}>
            취소
          </button>
          <button
            type="button"
            className={tone === "danger" ? "btn btn-danger btn-lg grow" : "btn btn-primary btn-lg grow"}
            disabled={!reason.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                setReason("");
                onClose();
              } catch {
                // useTx 가 이미 사용자에게 알렸다
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResolveDialog({
  open,
  onClose,
  agreementId,
  index,
  milestone,
}: {
  open: boolean;
  onClose: () => void;
  agreementId: bigint;
  index: number;
  milestone: Milestone;
}) {
  const [providerAmount, setProviderAmount] = useState("");
  const [note, setNote] = useState("");
  const { run, isPending } = useTx();

  const toProvider = parseMkrw(providerAmount || "0");
  const toClient = milestone.amount - toProvider;
  const valid = toProvider >= 0n && toProvider <= milestone.amount;

  const setRatio = (percent: number) => {
    const value = (milestone.amount * BigInt(percent)) / 100n;
    setProviderAmount((value / 1_000_000n).toString());
  };

  return (
    <Modal open={open} onClose={onClose} title="중재 결정">
      <div className="stack stack-16">
        <div className="card-soft center stack stack-4">
          <span className="label">분쟁 대상 금액</span>
          <Amount value={milestone.amount} size="lg" />
        </div>

        <div className="row wrap" style={{ gap: 6 }}>
          {[0, 30, 50, 70, 100].map((percent) => (
            <button key={percent} type="button" className="btn btn-secondary btn-sm" onClick={() => setRatio(percent)}>
              업체 {percent}%
            </button>
          ))}
        </div>

        <div className="field">
          <label className="label" htmlFor="provider-amount">
            업체 지급액 (mKRW)
          </label>
          <input
            id="provider-amount"
            className="input num"
            inputMode="numeric"
            value={providerAmount}
            onChange={(e) => setProviderAmount(e.target.value.replace(/[^0-9]/g, ""))}
            data-invalid={!valid}
          />
        </div>

        <dl className="kv">
          <dt>업체 지급</dt>
          <dd>{formatMkrwWithUnit(valid ? toProvider : 0n)}</dd>
          <dt>고객 환불</dt>
          <dd>{formatMkrwWithUnit(valid ? toClient : 0n)}</dd>
          <dt>합계</dt>
          <dd className={valid ? "" : "error-text"}>
            {valid ? formatMkrwWithUnit(milestone.amount) : "분쟁 금액을 넘을 수 없습니다"}
          </dd>
        </dl>

        <div className="field">
          <label className="label" htmlFor="resolve-note">
            결정 설명
          </label>
          <textarea
            id="resolve-note"
            className="textarea"
            value={note}
            placeholder="양측 주장과 결정 근거를 적어 주세요"
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
          />
        </div>

        <Notice tone="warning">
          두 금액의 합이 분쟁 금액과 정확히 같아야 실행됩니다. 결정은 되돌릴 수 없습니다.
        </Notice>

        <button
          type="button"
          className="btn btn-danger btn-lg btn-block"
          disabled={!valid || !note.trim() || isPending}
          onClick={async () => {
            await run("중재 결정", {
              ...escrowContract,
              functionName: "resolveDispute",
              args: [agreementId, BigInt(index), toProvider, toClient, hashText(note), note],
            });
            onClose();
          }}
        >
          {isPending ? <Spinner /> : null}
          결정 실행
        </button>
      </div>
    </Modal>
  );
}
