import { GIWA_SEPOLIA_ID } from "shared";
import { ESCROW_ADDRESS } from "./contracts";

export type EvidenceAction = "upload" | "view";

/**
 * 지갑이 서명할 문구. 서버와 브라우저가 글자 하나까지 같아야 검증이 통과하므로
 * 한 곳에서만 만든다.
 *
 * 계약·단계·동작·시각을 모두 담아 한 요청의 서명을 다른 요청에 재사용하지
 * 못하게 하고, 컨트랙트 주소와 체인 ID 로 다른 배포본으로의 재사용도 막는다.
 */
export function buildAccessMessage(params: {
  action: EvidenceAction;
  agreementId: string;
  milestoneIndex: number;
  issuedAt: string;
}): string {
  const actionLabel = params.action === "upload" ? "증빙 파일 올리기" : "증빙 파일 열기";

  return [
    "GIWA Trust Escrow",
    "",
    `요청: ${actionLabel}`,
    `계약: #${params.agreementId}`,
    `단계: ${params.milestoneIndex + 1}`,
    `컨트랙트: ${ESCROW_ADDRESS ?? ""}`,
    `체인: ${GIWA_SEPOLIA_ID}`,
    `시각: ${params.issuedAt}`,
    "",
    "이 서명으로 가스비가 들지 않으며, 자금이 이동하지 않습니다.",
  ].join("\n");
}
