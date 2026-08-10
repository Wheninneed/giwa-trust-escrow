import "server-only";

import { createPublicClient, http, verifyMessage, type Address } from "viem";
import { giwaSepolia } from "shared";
import { ESCROW_ADDRESS, escrowAbi } from "@/lib/contracts";
import { buildAccessMessage, type EvidenceAction } from "@/lib/evidenceMessage";

export { buildAccessMessage };
export type { EvidenceAction };

/**
 * 증빙 파일은 비공개 저장소에 있고, 계약 당사자만 열 수 있어야 한다.
 * 서버는 "요청한 지갑이 이 계약의 당사자인가"를 온체인에서 직접 확인한다.
 * 브라우저가 보내온 역할 주장은 믿지 않는다.
 */

/** 서명이 유효한 시간. 오래된 서명을 주워 재사용하지 못하게 짧게 둔다. */
const MAX_SIGNATURE_AGE_MS = 10 * 60 * 1000;

export interface AccessRequest {
  action: EvidenceAction;
  agreementId: string;
  milestoneIndex: number;
  address: Address;
  issuedAt: string;
  signature: `0x${string}`;
}

export interface AgreementParties {
  client: Address;
  provider: Address;
  arbiter: Address;
}

const serverClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io", {
    timeout: 20_000,
    retryCount: 2,
  }),
});

export class AccessError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * 서명을 검증하고, 그 지갑이 계약에서 어떤 역할인지 온체인에서 확인한다.
 * 통과하면 계약 당사자 주소들을 돌려준다.
 */
export async function authorize(request: AccessRequest): Promise<AgreementParties> {
  if (!ESCROW_ADDRESS) {
    throw new AccessError(500, "컨트랙트 주소가 설정되지 않았습니다.");
  }

  const issuedAt = Date.parse(request.issuedAt);
  if (Number.isNaN(issuedAt)) {
    throw new AccessError(400, "요청 시각이 올바르지 않습니다.");
  }

  const age = Date.now() - issuedAt;
  // 미래 시각으로 서명해 유효기간을 늘리는 것도 막는다
  if (age > MAX_SIGNATURE_AGE_MS || age < -60_000) {
    throw new AccessError(401, "요청이 만료되었습니다. 다시 시도해 주세요.");
  }

  if (!Number.isInteger(request.milestoneIndex) || request.milestoneIndex < 0) {
    throw new AccessError(400, "단계 번호가 올바르지 않습니다.");
  }

  if (!/^\d+$/.test(request.agreementId)) {
    throw new AccessError(400, "계약 번호가 올바르지 않습니다.");
  }

  const message = buildAccessMessage({
    action: request.action,
    agreementId: request.agreementId,
    milestoneIndex: request.milestoneIndex,
    issuedAt: request.issuedAt,
  });

  // 형식이 깨진 서명은 verifyMessage 가 예외를 던진다. 이것도 "서명이 틀렸다"
  // 로 다뤄야 한다. 그러지 않으면 아무나 500 을 유발하고 서버 로그를 채울 수 있다.
  let validSignature = false;
  try {
    validSignature = await verifyMessage({
      address: request.address,
      message,
      signature: request.signature,
    });
  } catch {
    validSignature = false;
  }

  if (!validSignature) {
    throw new AccessError(401, "서명을 확인하지 못했습니다.");
  }

  // 없는 계약이면 컨트랙트가 되돌린다. RPC 장애와 구분해 둘 다 안전하게 막는다.
  let agreement: AgreementParties;
  try {
    agreement = (await serverClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: "getAgreement",
      args: [BigInt(request.agreementId)],
    })) as unknown as AgreementParties;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UnknownAgreement")) {
      throw new AccessError(404, "존재하지 않는 계약입니다.");
    }
    throw new AccessError(503, "계약 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  const parties: AgreementParties = {
    client: agreement.client,
    provider: agreement.provider,
    arbiter: agreement.arbiter,
  };

  const caller = request.address.toLowerCase();
  const isProvider = parties.provider.toLowerCase() === caller;
  const isParty =
    isProvider ||
    parties.client.toLowerCase() === caller ||
    parties.arbiter.toLowerCase() === caller;

  // 올리는 것은 업체만, 보는 것은 세 당사자 모두
  if (request.action === "upload" && !isProvider) {
    throw new AccessError(403, "이 계약의 업체 지갑만 증빙을 올릴 수 있습니다.");
  }
  if (!isParty) {
    throw new AccessError(403, "이 계약의 당사자만 증빙을 볼 수 있습니다.");
  }

  return parties;
}

/** 요청 본문에서 필요한 값만 골라낸다. 나머지는 무시한다. */
export function parseAccessRequest(body: unknown, action: EvidenceAction): AccessRequest {
  const data = body as Record<string, unknown>;

  const address = typeof data?.address === "string" ? data.address : "";
  const signature = typeof data?.signature === "string" ? data.signature : "";

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new AccessError(400, "지갑 주소가 올바르지 않습니다.");
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) throw new AccessError(400, "서명 형식이 올바르지 않습니다.");

  return {
    action,
    agreementId: String(data?.agreementId ?? ""),
    milestoneIndex: Number(data?.milestoneIndex),
    address: address as Address,
    issuedAt: String(data?.issuedAt ?? ""),
    signature: signature as `0x${string}`,
  };
}
