export const AgreementStatus = {
  Created: 0,
  Active: 1,
  Disputed: 2,
  CancelPending: 3,
  Completed: 4,
  Cancelled: 5,
} as const;

export type AgreementStatusValue = (typeof AgreementStatus)[keyof typeof AgreementStatus];

export const MilestoneStatus = {
  Pending: 0,
  Submitted: 1,
  RevisionRequested: 2,
  Approved: 3,
  Disputed: 4,
  Resolved: 5,
  Paid: 6,
} as const;

export type MilestoneStatusValue = (typeof MilestoneStatus)[keyof typeof MilestoneStatus];

export const ChangeOrderStatus = {
  Proposed: 0,
  Accepted: 1,
  Funded: 2,
  Rejected: 3,
  Cancelled: 4,
} as const;

export type Tone = "neutral" | "info" | "warning" | "success" | "danger";

export interface StatusLabel {
  text: string;
  tone: Tone;
}

/** 명세서 19장의 권장 상태 문구 */
export const agreementLabel: Record<number, StatusLabel> = {
  [AgreementStatus.Created]: { text: "예치 대기", tone: "warning" },
  [AgreementStatus.Active]: { text: "공사 진행 중", tone: "info" },
  [AgreementStatus.Disputed]: { text: "분쟁 조정 중", tone: "danger" },
  [AgreementStatus.CancelPending]: { text: "취소 승인 대기", tone: "warning" },
  [AgreementStatus.Completed]: { text: "거래 완료", tone: "success" },
  [AgreementStatus.Cancelled]: { text: "계약 취소", tone: "neutral" },
};

export const milestoneLabel: Record<number, StatusLabel> = {
  [MilestoneStatus.Pending]: { text: "작업 대기", tone: "neutral" },
  [MilestoneStatus.Submitted]: { text: "고객 확인 대기", tone: "warning" },
  [MilestoneStatus.RevisionRequested]: { text: "보완 작업 중", tone: "warning" },
  [MilestoneStatus.Approved]: { text: "지급 대기", tone: "info" },
  [MilestoneStatus.Disputed]: { text: "분쟁 조정 중", tone: "danger" },
  [MilestoneStatus.Resolved]: { text: "중재 정산 완료", tone: "info" },
  [MilestoneStatus.Paid]: { text: "지급 완료", tone: "success" },
};

export const changeOrderLabel: Record<number, StatusLabel> = {
  [ChangeOrderStatus.Proposed]: { text: "승인 대기", tone: "warning" },
  [ChangeOrderStatus.Accepted]: { text: "추가금 입금 대기", tone: "warning" },
  [ChangeOrderStatus.Funded]: { text: "확정", tone: "success" },
  [ChangeOrderStatus.Rejected]: { text: "거절", tone: "neutral" },
  [ChangeOrderStatus.Cancelled]: { text: "취소", tone: "neutral" },
};

export type Role = "client" | "provider" | "arbiter" | "observer";

export const roleLabel: Record<Role, string> = {
  client: "고객",
  provider: "업체",
  arbiter: "중재자",
  observer: "열람",
};

/**
 * 지금 이 사용자가 해야 할 행동을 한 문장으로 돌려준다.
 * 명세서 19장 "사용자가 지금 해야 하는 행동을 한 화면에 하나만 강조한다".
 */
export function nextAction(params: {
  role: Role;
  agreementStatus: number;
  milestoneStatus?: number;
  isRetentionMatured?: boolean;
}): string | null {
  const { role, agreementStatus, milestoneStatus, isRetentionMatured } = params;

  if (agreementStatus === AgreementStatus.Created) {
    return role === "client" ? "계약금을 예치해 주세요" : "고객의 예치를 기다리는 중입니다";
  }
  if (agreementStatus === AgreementStatus.Completed) return null;
  if (agreementStatus === AgreementStatus.Cancelled) return null;
  if (agreementStatus === AgreementStatus.CancelPending) {
    return "상대방이 계약 취소를 제안했습니다";
  }
  if (agreementStatus === AgreementStatus.Disputed) {
    return role === "arbiter" ? "분쟁 내용을 확인하고 배분을 결정해 주세요" : "중재자의 결정을 기다리는 중입니다";
  }

  switch (milestoneStatus) {
    case MilestoneStatus.Pending:
      return role === "provider" ? "작업 완료 증빙을 제출해 주세요" : "업체의 작업을 기다리는 중입니다";
    case MilestoneStatus.Submitted:
      return role === "client" ? "증빙을 확인하고 승인해 주세요" : "고객의 확인을 기다리는 중입니다";
    case MilestoneStatus.RevisionRequested:
      return role === "provider" ? "보완한 증빙을 다시 제출해 주세요" : "업체의 보완 작업을 기다리는 중입니다";
    case MilestoneStatus.Approved:
      return isRetentionMatured
        ? "하자보증 기간이 끝났습니다. 지급을 실행해 주세요"
        : "하자보증 기간이 끝나면 자동으로 지급할 수 있습니다";
    default:
      return null;
  }
}
