import type { Address, Hex } from "viem";

export interface Agreement {
  id: bigint;
  client: Address;
  provider: Address;
  arbiter: Address;
  paymentToken: Address;
  originalAmount: bigint;
  totalFunded: bigint;
  totalReleased: bigint;
  totalRefunded: bigint;
  createdAt: bigint;
  fundedAt: bigint;
  status: number;
  termsHash: Hex;
  metadataURI: string;
}

export interface Milestone {
  amount: bigint;
  dueAt: bigint;
  retentionReleaseAt: bigint;
  isRetention: boolean;
  status: number;
  titleHash: Hex;
  evidenceHash: Hex;
  responseHash: Hex;
  submittedAt: bigint;
  resolvedAt: bigint;
}

export interface ChangeOrder {
  id: bigint;
  agreementId: bigint;
  proposer: Address;
  additionalAmount: bigint;
  additionalDays: bigint;
  proposedAt: bigint;
  status: number;
  metadataHash: Hex;
  metadataURI: string;
}

/**
 * metadataURI 에 담기는 표시용 메타데이터.
 * 개인정보·주소·연락처는 넣지 않는다 (명세서 0장 8번, 13장).
 */
export interface AgreementMetadata {
  /** 계약명 */
  t: string;
  /** 작업 설명 */
  d?: string;
  /** 단계명 목록 */
  ms: string[];
  /** 단계별 증빙 요구사항 */
  ev?: string[];
}

export interface ChangeOrderMetadata {
  t: string;
  d?: string;
}

export function parseAgreementMetadata(uri: string): AgreementMetadata {
  try {
    const parsed = JSON.parse(uri) as Partial<AgreementMetadata>;
    if (typeof parsed?.t === "string" && Array.isArray(parsed?.ms)) {
      return { t: parsed.t, d: parsed.d, ms: parsed.ms, ev: parsed.ev };
    }
  } catch {
    // JSON 이 아니면 외부 URI 이거나 손상된 값이다. 아래 기본값으로 떨어진다.
  }
  return { t: "이름 없는 계약", ms: [] };
}

export function parseChangeOrderMetadata(uri: string): ChangeOrderMetadata {
  try {
    const parsed = JSON.parse(uri) as Partial<ChangeOrderMetadata>;
    if (typeof parsed?.t === "string") return { t: parsed.t, d: parsed.d };
  } catch {
    // 무시하고 기본값 사용
  }
  return { t: "추가 작업" };
}

export const milestoneTitle = (metadata: AgreementMetadata, index: number) =>
  metadata.ms[index] ?? `${index + 1}단계`;
