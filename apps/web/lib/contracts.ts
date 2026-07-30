import type { Address } from "viem";
import { GiwaMilestoneEscrowAbi, MockKRWAbi } from "shared";

const asAddress = (value?: string): Address | undefined =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;

export const ESCROW_ADDRESS = asAddress(process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS);
export const MOCK_KRW_ADDRESS = asAddress(process.env.NEXT_PUBLIC_MOCK_KRW_ADDRESS);

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
