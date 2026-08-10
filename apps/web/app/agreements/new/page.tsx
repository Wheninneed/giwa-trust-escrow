"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { isAddress, parseEventLogs, type Address } from "viem";
import {
  DEMO_RETENTION_SECONDS,
  INTERIOR_TEMPLATE,
  TEMPLATES,
  formatMkrwWithUnit,
  parseMkrw,
  shortAddress,
  toKoreanAmount,
  toKoreanError,
  type MilestoneTemplate,
} from "shared";
import { ESCROW_ADDRESS, escrowContract, mockKrwContract, MOCK_KRW_ADDRESS } from "@/lib/contracts";
import { hashText } from "@/lib/hash";
import { useTx } from "@/lib/useTx";
import { useTokenBalance } from "@/lib/useAgreements";
import { SetupGuard } from "@/components/SetupGuard";
import { Amount, Notice, Spinner, TestnetBanner } from "@/components/ui";
import { useToast } from "@/components/Toast";

const DRAFT_KEY = "giwa-escrow-draft-v1";
const DAY_MS = 86_400_000;

interface DraftMilestone {
  title: string;
  description: string;
  amount: string;
  dueAt: string;
  evidence: string;
  isRetention: boolean;
  retentionDays: number;
}

interface Draft {
  title: string;
  description: string;
  provider: string;
  arbiter: string;
  total: string;
  templateId: string;
  milestones: DraftMilestone[];
}

const toDateInput = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

function draftFromTemplate(template: MilestoneTemplate, previous?: Draft): Draft {
  const total = template.defaultTotal;
  return {
    title: previous?.title ?? "",
    description: previous?.description ?? "",
    provider: previous?.provider ?? "",
    arbiter: previous?.arbiter ?? "",
    total,
    templateId: template.id,
    milestones: template.items.map((item, index) => ({
      title: item.title,
      description: item.description,
      amount: String((Number(total) * item.ratio) / 100),
      dueAt: toDateInput((index + 1) * 14),
      evidence: item.evidence,
      isRetention: Boolean(item.isRetention),
      retentionDays: item.retentionDays ?? 30,
    })),
  };
}

export default function NewAgreementPage() {
  return (
    <div className="shell page">
      <div className="stack stack-24" style={{ maxWidth: "var(--max-form)" }}>
        <SetupGuard>
          <Wizard />
        </SetupGuard>
      </div>
    </div>
  );
}

function Wizard() {
  const router = useRouter();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { run, isPending } = useTx();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(() => draftFromTemplate(INTERIOR_TEMPLATE));
  const [phase, setPhase] = useState<string | null>(null);
  const { data: krwBalance } = useTokenBalance(MOCK_KRW_ADDRESS);

  // 임시저장 — 새로고침해도 입력이 남는다
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(DRAFT_KEY) : null;
    if (saved) {
      try {
        setDraft(JSON.parse(saved) as Draft);
      } catch {
        // 손상된 임시저장은 무시한다
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [draft]);

  const milestoneTotal = useMemo(
    () => draft.milestones.reduce((sum, m) => sum + parseMkrw(m.amount), 0n),
    [draft.milestones],
  );
  const declaredTotal = parseMkrw(draft.total);

  const errors = useMemo(() => validate(draft, address, milestoneTotal, declaredTotal), [
    draft,
    address,
    milestoneTotal,
    declaredTotal,
  ]);

  const step1Errors = errors.filter((e) => e.step === 1);
  const step2Errors = errors.filter((e) => e.step === 2);

  const update = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const updateMilestone = (index: number, patch: Partial<DraftMilestone>) =>
    setDraft((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));

  async function submit() {
    if (!publicClient || !address) return;

    const metadata = JSON.stringify({
      t: draft.title,
      d: draft.description || undefined,
      ms: draft.milestones.map((m) => m.title),
      ev: draft.milestones.map((m) => m.evidence),
    });

    const amounts = draft.milestones.map((m) => parseMkrw(m.amount));
    const dueDates = draft.milestones.map((m) => BigInt(Math.floor(new Date(`${m.dueAt}T12:00:00`).getTime() / 1000)));
    const retentionFlags = draft.milestones.map((m) => m.isRetention);
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const retentionReleaseDates = draft.milestones.map((m) =>
      m.isRetention
        ? nowSeconds + BigInt(m.retentionDays > 0 ? m.retentionDays * 86_400 : DEMO_RETENTION_SECONDS)
        : 0n,
    );
    const titleHashes = draft.milestones.map((m) => hashText(m.title));

    try {
      setPhase("1/3 계약을 만드는 중입니다");
      const createHash = await run("계약 생성", {
        ...escrowContract,
        functionName: "createAgreement",
        args: [
          draft.provider as Address,
          draft.arbiter as Address,
          MOCK_KRW_ADDRESS as Address,
          amounts,
          dueDates,
          retentionFlags,
          retentionReleaseDates,
          titleHashes,
          hashText(metadata),
          metadata,
        ],
      });

      const receipt = await publicClient.getTransactionReceipt({ hash: createHash });
      const logs = parseEventLogs({ abi: escrowContract.abi, eventName: "AgreementCreated", logs: receipt.logs });
      const agreementId = (logs[0]?.args as { agreementId?: bigint } | undefined)?.agreementId;

      if (agreementId === undefined) {
        toast.push("계약은 만들어졌지만 번호를 읽지 못했습니다. 내 계약 목록에서 확인해 주세요.", "danger");
        router.push("/agreements");
        return;
      }

      // 이미 승인된 한도가 충분하면 approve 를 건너뛴다
      setPhase("2/3 토큰 사용을 승인하는 중입니다");
      const allowance = (await publicClient.readContract({
        ...mockKrwContract,
        functionName: "allowance",
        args: [address, ESCROW_ADDRESS as Address],
      })) as bigint;

      if (allowance < declaredTotal) {
        await run("토큰 사용 승인", {
          ...mockKrwContract,
          functionName: "approve",
          args: [ESCROW_ADDRESS as Address, declaredTotal],
        });
      }

      setPhase("3/3 계약금을 예치하는 중입니다");
      await run("계약금 예치", { ...escrowContract, functionName: "fundAgreement", args: [agreementId] });

      window.localStorage.removeItem(DRAFT_KEY);
      router.push(`/agreements/${agreementId}`);
    } catch (error) {
      // 사용자에게는 useTx 가 이미 토스트로 알렸다. 어느 단계에서 멈췄는지만 남긴다.
      console.error("계약 생성 실패", toKoreanError(error), error);
    } finally {
      setPhase(null);
    }
  }

  return (
    <div className="stack stack-24">
      <div className="stack stack-12">
        <h1 className="page-title">새 계약 만들기</h1>
        <div className="steps">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className="step-pip" data-on={step >= n} />
          ))}
        </div>
        <span className="muted">
          {step}단계 / 4 · {["거래 기본정보", "작업 단계", "계약 확인", "생성 및 예치"][step - 1]}
        </span>
      </div>

      {step === 1 && (
        <section className="stack stack-16">
          <div className="field">
            <label className="label" htmlFor="title">
              계약명
            </label>
            <input
              id="title"
              className="input"
              placeholder="예: 평택 아파트 32평 부분 인테리어"
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="provider">
              업체 지갑 주소
            </label>
            <input
              id="provider"
              className="input mono"
              placeholder="0x..."
              value={draft.provider}
              onChange={(e) => update({ provider: e.target.value.trim() })}
              data-invalid={Boolean(draft.provider) && !isAddress(draft.provider)}
            />
            <span className="hint">대금을 받을 업체의 지갑입니다.</span>
          </div>

          <div className="field">
            <label className="label" htmlFor="arbiter">
              중재자 지갑 주소
            </label>
            <input
              id="arbiter"
              className="input mono"
              placeholder="0x..."
              value={draft.arbiter}
              onChange={(e) => update({ arbiter: e.target.value.trim() })}
              data-invalid={Boolean(draft.arbiter) && !isAddress(draft.arbiter)}
            />
            <span className="hint">분쟁이 생겼을 때만 개입합니다. 고객·업체와 다른 지갑이어야 합니다.</span>
          </div>

          <div className="field">
            <label className="label" htmlFor="description">
              작업 설명 (선택)
            </label>
            <textarea
              id="description"
              className="textarea"
              placeholder="작업 범위를 간단히 적어 주세요. 개인정보·주소·연락처는 넣지 마세요."
              value={draft.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </div>

          <Notice tone="neutral">
            여기 적은 계약명과 단계명은 <strong>GIWA에 공개 기록</strong>됩니다. 주소·전화번호 같은 개인정보는 넣지
            마세요.
          </Notice>

          <ErrorList errors={step1Errors} />

          <div className="bottom-bar">
            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={step1Errors.length > 0}
              onClick={() => setStep(2)}
            >
              다음
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="stack stack-16">
          <div className="field">
            <span className="label">템플릿</span>
            <div className="row wrap" style={{ gap: 8 }}>
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={draft.templateId === template.id ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
                  onClick={() => setDraft((prev) => draftFromTemplate(template, prev))}
                >
                  {template.name}
                </button>
              ))}
            </div>
            <span className="hint">{TEMPLATES.find((t) => t.id === draft.templateId)?.summary}</span>
          </div>

          <div className="field">
            <label className="label" htmlFor="total">
              총 계약금 (mKRW)
            </label>
            <input
              id="total"
              className="input num"
              inputMode="numeric"
              value={draft.total}
              onChange={(e) => {
                const total = e.target.value.replace(/[^0-9]/g, "");
                const template = TEMPLATES.find((t) => t.id === draft.templateId) ?? INTERIOR_TEMPLATE;
                // 총액을 바꾸면 템플릿 비율대로 단계 금액을 다시 나눈다
                setDraft((prev) => ({
                  ...prev,
                  total,
                  milestones: prev.milestones.map((m, i) => {
                    const ratio = template.items[i]?.ratio;
                    return ratio ? { ...m, amount: String(Math.floor((Number(total) * ratio) / 100)) } : m;
                  }),
                }));
              }}
            />
            <span className="hint">{toKoreanAmount(declaredTotal)}</span>
          </div>

          <div className="stack stack-12">
            {draft.milestones.map((milestone, index) => (
              <div key={index} className="card stack stack-12">
                <div className="row-between">
                  <span className="label">{index + 1}단계</span>
                  {milestone.isRetention && (
                    <span className="badge" data-tone="info">
                      하자보증금
                    </span>
                  )}
                </div>

                <input
                  className="input"
                  value={milestone.title}
                  placeholder="단계명"
                  onChange={(e) => updateMilestone(index, { title: e.target.value })}
                />

                <div className="row" style={{ gap: 8 }}>
                  <div className="field grow">
                    <span className="label">금액 (mKRW)</span>
                    <input
                      className="input num"
                      inputMode="numeric"
                      value={milestone.amount}
                      onChange={(e) => updateMilestone(index, { amount: e.target.value.replace(/[^0-9]/g, "") })}
                    />
                  </div>
                  <div className="field grow">
                    <span className="label">예정 완료일</span>
                    <input
                      className="input"
                      type="date"
                      value={milestone.dueAt}
                      onChange={(e) => updateMilestone(index, { dueAt: e.target.value })}
                    />
                  </div>
                </div>

                <input
                  className="input"
                  value={milestone.evidence}
                  placeholder="증빙 요구사항"
                  onChange={(e) => updateMilestone(index, { evidence: e.target.value })}
                />

                {milestone.isRetention && (
                  <div className="field">
                    <span className="label">하자보증 잠금 기간</span>
                    <select
                      className="select"
                      value={milestone.retentionDays}
                      onChange={(e) => updateMilestone(index, { retentionDays: Number(e.target.value) })}
                    >
                      <option value={0}>5분 (시연용)</option>
                      <option value={7}>7일</option>
                      <option value={30}>30일</option>
                      <option value={90}>90일</option>
                    </select>
                    <span className="hint">
                      이 기간이 끝나야 업체에게 지급됩니다. 실제 서비스 기본값은 30일 이상입니다.
                    </span>
                  </div>
                )}

                <div className="row-between">
                  <span className="muted">{toKoreanAmount(parseMkrw(milestone.amount))}</span>
                  <span className="muted num">
                    {declaredTotal > 0n
                      ? `${Math.round((Number(parseMkrw(milestone.amount)) / Number(declaredTotal)) * 100)}%`
                      : "-"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="card-soft row-between">
            <span className="label">단계 합계</span>
            <div className="right stack stack-4">
              <Amount value={milestoneTotal} size="sm" />
              {milestoneTotal !== declaredTotal && (
                <span className="error-text">총 계약금과 {formatMkrwWithUnit(milestoneTotal - declaredTotal)} 차이</span>
              )}
            </div>
          </div>

          <ErrorList errors={step2Errors} />

          <div className="bottom-bar row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep(1)}>
              이전
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg grow"
              disabled={step2Errors.length > 0}
              onClick={() => setStep(3)}
            >
              다음
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="stack stack-16">
          <div className="card stack stack-16">
            <div className="stack stack-4">
              <span className="label">계약명</span>
              <strong style={{ fontSize: 18 }}>{draft.title}</strong>
            </div>

            <hr className="divider" />

            <dl className="kv">
              <dt>고객 (나)</dt>
              <dd className="mono">{shortAddress(address)}</dd>
              <dt>업체</dt>
              <dd className="mono">{shortAddress(draft.provider)}</dd>
              <dt>중재자</dt>
              <dd className="mono">{shortAddress(draft.arbiter)}</dd>
              <dt>수수료</dt>
              <dd>없음 (MVP)</dd>
            </dl>

            <hr className="divider" />

            <div className="stack stack-8">
              <span className="label">단계별 금액</span>
              {draft.milestones.map((m, i) => (
                <div key={i} className="row-between">
                  <span>
                    {i + 1}. {m.title}
                    {m.isRetention && (
                      <span className="badge" data-tone="info" style={{ marginLeft: 6 }}>
                        {m.retentionDays > 0 ? `${m.retentionDays}일 잠금` : "5분 잠금"}
                      </span>
                    )}
                  </span>
                  <span className="num" style={{ fontWeight: 600 }}>
                    {formatMkrwWithUnit(parseMkrw(m.amount))}
                  </span>
                </div>
              ))}
            </div>

            <hr className="divider" />

            <div className="row-between">
              <span className="label">총 예치 금액</span>
              <Amount value={declaredTotal} size="lg" />
            </div>
          </div>

          <Notice tone="info" title="GIWA에 공개되는 항목">
            계약명·단계명·금액·상태·양측 지갑 주소가 공개 기록됩니다. 증빙 파일은 올라가지 않고 파일 해시만 기록됩니다.
          </Notice>

          <TestnetBanner />

          <div className="bottom-bar row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => setStep(2)}>
              이전
            </button>
            <button type="button" className="btn btn-primary btn-lg grow" onClick={() => setStep(4)}>
              확인했습니다
            </button>
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="stack stack-16">
          <div className="card stack stack-12">
            <span className="label">지갑에서 서명할 순서</span>
            <ol className="stack stack-8" style={{ paddingLeft: 20, margin: 0, color: "var(--ink-2)" }}>
              <li>계약 생성 — 단계와 금액을 GIWA에 기록합니다</li>
              <li>토큰 사용 승인 — 에스크로가 mKRW를 옮길 수 있게 합니다</li>
              <li>계약금 예치 — 총액이 컨트랙트에 잠깁니다</li>
            </ol>
          </div>

          {krwBalance !== undefined && krwBalance < declaredTotal && (
            <Notice tone="danger" title="mKRW 잔액이 부족합니다">
              필요 {formatMkrwWithUnit(declaredTotal)} / 보유 {formatMkrwWithUnit(krwBalance)} — 테스트 토큰 화면에서
              먼저 받아 주세요.
            </Notice>
          )}

          {phase && (
            <div className="notice" data-tone="info">
              <span className="row" style={{ gap: 8 }}>
                <Spinner dark />
                {phase}
              </span>
            </div>
          )}

          <div className="bottom-bar row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-lg"
              disabled={isPending}
              onClick={() => setStep(3)}
            >
              이전
            </button>
            <button
              type="button"
              className="btn btn-primary btn-lg grow"
              disabled={isPending || errors.length > 0}
              onClick={submit}
            >
              {isPending ? <Spinner /> : null}
              계약 만들고 예치하기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

interface ValidationError {
  step: number;
  message: string;
}

function validate(draft: Draft, viewer: string | undefined, milestoneTotal: bigint, declaredTotal: bigint) {
  const errors: ValidationError[] = [];

  if (!draft.title.trim()) errors.push({ step: 1, message: "계약명을 입력해 주세요." });
  if (!isAddress(draft.provider)) errors.push({ step: 1, message: "업체 지갑 주소가 올바르지 않습니다." });
  if (!isAddress(draft.arbiter)) errors.push({ step: 1, message: "중재자 지갑 주소가 올바르지 않습니다." });

  const lower = (value?: string) => value?.toLowerCase();
  if (isAddress(draft.provider) && lower(draft.provider) === lower(viewer)) {
    errors.push({ step: 1, message: "업체는 본인과 다른 지갑이어야 합니다." });
  }
  if (isAddress(draft.arbiter) && lower(draft.arbiter) === lower(viewer)) {
    errors.push({ step: 1, message: "중재자는 본인과 다른 지갑이어야 합니다." });
  }
  if (isAddress(draft.provider) && isAddress(draft.arbiter) && lower(draft.provider) === lower(draft.arbiter)) {
    errors.push({ step: 1, message: "업체와 중재자는 서로 다른 지갑이어야 합니다." });
  }

  if (draft.milestones.length < 2 || draft.milestones.length > 10) {
    errors.push({ step: 2, message: "작업 단계는 2개 이상 10개 이하여야 합니다." });
  }
  if (draft.milestones.some((m) => !m.title.trim())) {
    errors.push({ step: 2, message: "모든 단계에 단계명이 필요합니다." });
  }
  if (draft.milestones.some((m) => parseMkrw(m.amount) <= 0n)) {
    errors.push({ step: 2, message: "금액이 0인 단계는 만들 수 없습니다." });
  }
  if (declaredTotal <= 0n) {
    errors.push({ step: 2, message: "총 계약금을 입력해 주세요." });
  }
  if (milestoneTotal !== declaredTotal) {
    errors.push({ step: 2, message: "단계 금액의 합이 총 계약금과 같아야 합니다." });
  }

  const retentionIndexes = draft.milestones.flatMap((m, i) => (m.isRetention ? [i] : []));
  if (retentionIndexes.length > 1) {
    errors.push({ step: 2, message: "하자보증금 단계는 하나만 지정할 수 있습니다." });
  }
  if (retentionIndexes.length === 1 && retentionIndexes[0] !== draft.milestones.length - 1) {
    errors.push({ step: 2, message: "하자보증금은 마지막 단계여야 합니다." });
  }

  for (let i = 1; i < draft.milestones.length; i++) {
    if (draft.milestones[i].dueAt < draft.milestones[i - 1].dueAt) {
      errors.push({ step: 2, message: "단계 예정일은 순서대로 같거나 늦어야 합니다." });
      break;
    }
  }

  return errors;
}

function ErrorList({ errors }: { errors: ValidationError[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="stack stack-4">
      {errors.map((error) => (
        <span key={error.message} className="error-text">
          · {error.message}
        </span>
      ))}
    </div>
  );
}
