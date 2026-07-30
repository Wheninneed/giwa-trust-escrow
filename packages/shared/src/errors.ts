/**
 * 명세서 16.2 — 지갑·RPC·컨트랙트 오류를 사람이 이해할 수 있는 한국어로 바꾼다.
 * 원문 메시지는 개발자용으로 따로 보관한다.
 */

const CONTRACT_ERRORS: Record<string, string> = {
  ZeroAddress: "지갑 주소가 비어 있습니다. 주소를 다시 확인해 주세요.",
  DuplicateRole: "고객·업체·중재자는 서로 다른 지갑이어야 합니다.",
  InvalidMilestoneCount: "작업 단계는 2개 이상 10개 이하로 만들 수 있습니다.",
  ArrayLengthMismatch: "단계 정보가 서로 맞지 않습니다. 입력값을 확인해 주세요.",
  ZeroAmount: "금액이 0인 단계는 만들 수 없습니다.",
  InvalidDueDate: "단계 예정일은 순서대로 같거나 늦어야 합니다.",
  MultipleRetentionMilestones: "하자보증금 단계는 하나만 지정할 수 있습니다.",
  RetentionMustBeLast: "하자보증금은 마지막 단계여야 합니다.",
  InvalidRetentionRelease: "하자보증 해제일은 오늘보다 나중이어야 합니다.",
  StringTooLong: "입력한 설명이 너무 깁니다.",
  UnknownAgreement: "존재하지 않는 계약입니다.",
  NotClient: "고객 지갑만 할 수 있는 작업입니다.",
  NotProvider: "업체 지갑만 할 수 있는 작업입니다.",
  NotArbiter: "중재자 지갑만 할 수 있는 작업입니다.",
  NotParty: "이 계약의 당사자만 할 수 있는 작업입니다.",
  InvalidAgreementStatus: "지금 계약 상태에서는 할 수 없는 작업입니다.",
  InvalidMilestoneStatus: "이미 처리된 단계이거나 지금 처리할 수 없는 단계입니다.",
  MilestoneOutOfRange: "존재하지 않는 단계입니다.",
  OutOfOrder: "앞 단계가 끝나야 이 단계를 제출할 수 있습니다.",
  FundingAmountMismatch: "예치 금액이 맞지 않습니다. 토큰 설정을 확인해 주세요.",
  ZeroEvidenceHash: "증빙 파일을 먼저 올려 주세요.",
  RetentionNotMatured: "하자보증 기간이 아직 끝나지 않았습니다.",
  NotRetentionMilestone: "하자보증금 단계가 아닙니다.",
  ResolutionAmountMismatch: "업체 지급액과 고객 환불액의 합이 분쟁 금액과 같아야 합니다.",
  UnknownChangeOrder: "존재하지 않는 변경계약입니다.",
  InvalidChangeOrderStatus: "이미 처리된 변경계약입니다.",
  CannotAcceptOwnProposal: "본인이 제안한 변경계약은 본인이 승인할 수 없습니다.",
  RetentionAlreadyStarted: "하자보증금 단계가 시작된 뒤에는 변경계약을 추가할 수 없습니다.",
  TooManyMilestones: "단계를 더 추가할 수 없습니다.",
  SelfAcceptCancellation: "본인이 제안한 취소는 상대방이 수락해야 합니다.",
  EnforcedPause: "안전 점검을 위해 일시적으로 거래가 중지되어 있습니다.",
  OwnableUnauthorizedAccount: "관리자만 할 수 있는 작업입니다.",
  ERC20InsufficientAllowance: "토큰 사용 승인이 부족합니다. 승인 단계를 먼저 진행해 주세요.",
  ERC20InsufficientBalance: "mKRW 잔액이 부족합니다. 테스트 토큰을 먼저 받아 주세요.",
};

const PATTERN_ERRORS: Array<[RegExp, string]> = [
  [/user rejected|User denied|rejected the request/i, "지갑에서 서명을 취소했습니다."],
  [/insufficient funds/i, "가스비로 쓸 테스트 ETH가 부족합니다. GIWA faucet에서 받아 주세요."],
  [/chain (mismatch|not configured)|does not match the target chain/i, "지갑 네트워크가 GIWA Sepolia가 아닙니다. 네트워크를 전환해 주세요."],
  [/timed? ?out|timeout/i, "네트워크 응답이 늦습니다. 잠시 후 다시 시도해 주세요."],
  [/HTTP request failed|fetch failed|Failed to fetch/i, "GIWA RPC 연결에 실패했습니다. 잠시 후 다시 시도해 주세요."],
  [/rate ?limit|429/i, "RPC 요청이 많아 잠시 제한되었습니다. 잠시 후 다시 시도해 주세요."],
  [/nonce/i, "이전 거래가 아직 처리 중입니다. 잠시 후 다시 시도해 주세요."],
  [/connector not connected|no account/i, "지갑이 연결되어 있지 않습니다."],
];

export function toKoreanError(error: unknown): string {
  const raw = extractMessage(error);

  for (const [name, message] of Object.entries(CONTRACT_ERRORS)) {
    // viem 은 커스텀 에러를 "Error: NotClient()" 형태로 메시지에 담는다
    if (new RegExp(`\\b${name}\\b`).test(raw)) return message;
  }

  for (const [pattern, message] of PATTERN_ERRORS) {
    if (pattern.test(raw)) return message;
  }

  const shortMessage = (error as { shortMessage?: string })?.shortMessage;
  if (shortMessage) return shortMessage;

  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/** 개발자용 원문. 화면에서는 접어두고 필요할 때만 펼친다. */
export function extractMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.message}\n${(error as { details?: string }).details ?? ""}`;
  return String(error);
}
