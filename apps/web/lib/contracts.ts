import type { Address } from "viem";
import { GiwaMilestoneEscrowAbi, MockKRWAbi, giwaSepoliaDeployment } from "shared";

const asAddress = (value?: string): Address | undefined =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;

export const ESCROW_ADDRESS = asAddress(process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS);
export const MOCK_KRW_ADDRESS = asAddress(process.env.NEXT_PUBLIC_MOCK_KRW_ADDRESS);

/**
 * 이벤트 조회 시작 블록. 배포 기록에서 읽되, 다른 주소를 환경변수로 덮어썼다면
 * 그 기록을 믿을 수 없으므로 0 으로 두고 호출부가 최근 구간만 훑게 한다.
 */
export const ESCROW_DEPLOY_BLOCK =
  giwaSepoliaDeployment.escrow?.toLowerCase() === ESCROW_ADDRESS?.toLowerCase()
    ? BigInt(giwaSepoliaDeployment.deployBlock ?? 0)
    : 0n;

export const isDeployed = Boolean(ESCROW_ADDRESS && MOCK_KRW_ADDRESS);

export const escrowAbi = GiwaMilestoneEscrowAbi;
export const mockKrwAbi = MockKRWAbi;

export const escrowContract = {
  address: ESCROW_ADDRESS as Address,
  abi: escrowAbi,
} as const;

export const mockKrwContract = {
  address: MOCK_KRW_ADDRESS as Address,
  abi: mockKrwAbi,
} as const;
