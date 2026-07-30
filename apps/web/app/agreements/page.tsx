"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import {
  AgreementStatus,
  MilestoneStatus,
  agreementLabel,
  nextAction,
  roleLabel,
  shortAddress,
} from "shared";
import { useAgreementSummaries, useMyAgreementIds, type AgreementSummary } from "@/lib/useAgreements";
import { SetupGuard } from "@/components/SetupGuard";
import { Amount, Badge, EmptyState, Notice } from "@/components/ui";

type FilterId = "all" | "created" | "active" | "waiting" | "disputed" | "done" | "cancelled";

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "all", label: "전체" },
  { id: "created", label: "예치 대기" },
  { id: "active", label: "진행 중" },
  { id: "waiting", label: "내 확인 대기" },
  { id: "disputed", label: "분쟁 중" },
  { id: "done", label: "완료" },
  { id: "cancelled", label: "취소" },
];

export default function AgreementsPage() {
  return (
    <div className="shell page">
      <div className="stack stack-24">
        <div className="row-between wrap">
          <div className="stack stack-4">
            <h1 className="page-title">내 계약</h1>
            <p className="muted">고객·업체·중재자로 참여 중인 계약을 모두 보여줍니다.</p>
          </div>
          <Link href="/agreements/new" className="btn btn-primary">
            새 계약 만들기
          </Link>
        </div>

        <SetupGuard>
          <AgreementList />
        </SetupGuard>
      </div>
    </div>
  );
}

function matchesFilter(summary: AgreementSummary, filter: FilterId): boolean {
  const status = summary.agreement.status;

  switch (filter) {
    case "all":
      return true;
    case "created":
      return status === AgreementStatus.Created;
    case "active":
      return status === AgreementStatus.Active || status === AgreementStatus.CancelPending;
    case "disputed":
      return status === AgreementStatus.Disputed;
    case "done":
      return status === AgreementStatus.Completed;
    case "cancelled":
      return status === AgreementStatus.Cancelled;
    case "waiting": {
      if (status !== AgreementStatus.Active) return false;
      const milestoneStatus = summary.activeMilestone?.milestone.status;
      if (summary.role === "client") return milestoneStatus === MilestoneStatus.Submitted;
      if (summary.role === "provider") {
        return milestoneStatus === MilestoneStatus.Pending || milestoneStatus === MilestoneStatus.RevisionRequested;
      }
      return false;
    }
    default:
      return true;
  }
}

function AgreementList() {
  const { ids, isLoading: idsLoading, error } = useMyAgreementIds();
  const { summaries, isLoading } = useAgreementSummaries(ids);
  const [filter, setFilter] = useState<FilterId>("all");

  const counts = useMemo(() => {
    const map = {} as Record<FilterId, number>;
    for (const item of FILTERS) map[item.id] = summaries.filter((s) => matchesFilter(s, item.id)).length;
    return map;
  }, [summaries]);

  const visible = summaries.filter((summary) => matchesFilter(summary, filter));

  if (error) {
    return (
      <Notice tone="danger" title="계약 목록을 불러오지 못했습니다">
        GIWA RPC 연결을 확인한 뒤 새로고침해 주세요.
      </Notice>
    );
  }

  if (idsLoading || isLoading) {
    return <div className="card-soft center muted" style={{ padding: 48 }}>계약을 불러오는 중입니다…</div>;
  }

  if (summaries.length === 0) {
    return (
      <EmptyState
        title="아직 계약이 없습니다"
        description="고객으로 새 계약을 만들거나, 업체·중재자로 지정되면 여기에 자동으로 나타납니다."
        action={
          <Link href="/agreements/new" className="btn btn-primary">
            첫 계약 만들기
          </Link>
        }
      />
    );
  }

  return (
    <div className="stack stack-16">
      <div className="row wrap scroll-x" style={{ gap: 6 }}>
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"}
            onClick={() => setFilter(item.id)}
          >
            {item.label} {counts[item.id] > 0 && <span style={{ opacity: 0.75 }}>{counts[item.id]}</span>}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card-soft center muted" style={{ padding: 40 }}>
          이 조건에 해당하는 계약이 없습니다.
        </div>
      ) : (
        <div className="stack stack-12">
          {visible.map((summary) => (
            <AgreementCard key={summary.id.toString()} summary={summary} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgreementCard({ summary }: { summary: AgreementSummary }) {
  const { address } = useAccount();
  const { agreement, milestones, role, metadata } = summary;

  const counterparty =
    role === "client" ? agreement.provider : role === "provider" ? agreement.client : agreement.client;
  const counterpartyLabel = role === "client" ? "업체" : role === "provider" ? "고객" : "고객";

  const settled = milestones.filter(
    (m) => m.status === MilestoneStatus.Paid || m.status === MilestoneStatus.Resolved,
  ).length;

  const locked = agreement.totalFunded - agreement.totalReleased - agreement.totalRefunded;
  const percent = agreement.totalFunded > 0n ? Number((agreement.totalReleased * 100n) / agreement.totalFunded) : 0;

  const action = nextAction({
    role,
    agreementStatus: agreement.status,
    milestoneStatus: summary.activeMilestone?.milestone.status,
    isRetentionMatured:
      summary.activeMilestone?.milestone.isRetention &&
      Number(summary.activeMilestone.milestone.retentionReleaseAt) * 1000 <= Date.now(),
  });

  const isMyTurn =
    (role === "client" && summary.activeMilestone?.milestone.status === MilestoneStatus.Submitted) ||
    (role === "provider" &&
      (summary.activeMilestone?.milestone.status === MilestoneStatus.Pending ||
        summary.activeMilestone?.milestone.status === MilestoneStatus.RevisionRequested)) ||
    (role === "client" && agreement.status === AgreementStatus.Created) ||
    (role === "arbiter" && agreement.status === AgreementStatus.Disputed);

  return (
    <Link href={`/agreements/${summary.id}`} className="card card-link stack stack-12" style={{ display: "block" }}>
      <div className="row-between wrap" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="badge" data-tone="neutral">
            {roleLabel[role]}
          </span>
          <Badge label={agreementLabel[agreement.status]} />
        </div>
        <span className="muted mono">#{summary.id.toString()}</span>
      </div>

      <div className="stack stack-4">
        <strong style={{ fontSize: 17, letterSpacing: "-0.02em" }}>{metadata.t}</strong>
        <span className="muted">
          {counterpartyLabel} {shortAddress(counterparty)}
          {address && counterparty.toLowerCase() === address.toLowerCase() ? " (나)" : ""}
        </span>
      </div>

      <div className="bar">
        <div className="bar-fill" style={{ width: `${percent}%` }} data-tone={percent === 100 ? "success" : undefined} />
      </div>

      <dl className="kv">
        <dt>총 계약금</dt>
        <dd>
          <Amount value={agreement.totalFunded > 0n ? agreement.totalFunded : agreement.originalAmount} size="sm" />
        </dd>
        <dt>지급 완료</dt>
        <dd>
          <Amount value={agreement.totalReleased} size="sm" />
        </dd>
        <dt>잠긴 금액</dt>
        <dd>
          <Amount value={locked} size="sm" />
        </dd>
        <dt>진행 단계</dt>
        <dd className="num">
          {settled} / {milestones.length}
        </dd>
      </dl>

      {action && (
        <div className="notice" data-tone={isMyTurn ? "info" : "neutral"} style={{ padding: "10px 12px" }}>
          {isMyTurn ? "👉 " : ""}
          {action}
        </div>
      )}
    </Link>
  );
}
