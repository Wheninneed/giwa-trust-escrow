"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { escrowContract, isDeployed } from "./contracts";
import { fetchLogsInChunks } from "./logs";

export interface PaymentEntry {
  /** 어느 단계에서 나갔는지 */
  milestoneIndex: number;
  /** 업체에게 지급된 금액 */
  toProvider: bigint;
  /** 고객에게 환불된 금액 (중재 결과일 때만 0 이상) */
  toClient: bigint;
  /** 중재로 정산된 건인지 */
  byArbitration: boolean;
  blockNumber: bigint;
  txHash: string;
}

/**
 * 자금이 실제로 움직인 기록.
 * 승인에 따른 지급(MilestonePaid)과 중재 배분(DisputeResolved)을 함께 모은다.
 */
export function usePayments(agreementId?: bigint) {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["payments", agreementId?.toString()],
    enabled: agreementId !== undefined && isDeployed && Boolean(publicClient),
    staleTime: 10_000,
    retry: 0,
    queryFn: async (): Promise<PaymentEntry[]> => {
      const [paidResult, resolvedResult] = await Promise.all([
        fetchLogsInChunks(publicClient!, (fromBlock, toBlock) =>
          publicClient!.getContractEvents({
            address: escrowContract.address,
            abi: escrowContract.abi,
            eventName: "MilestonePaid",
            args: { agreementId },
            fromBlock,
            toBlock,
          }),
        ),
        fetchLogsInChunks(publicClient!, (fromBlock, toBlock) =>
          publicClient!.getContractEvents({
            address: escrowContract.address,
            abi: escrowContract.abi,
            eventName: "DisputeResolved",
            args: { agreementId },
            fromBlock,
            toBlock,
          }),
        ),
      ]);

      const paid = paidResult.logs;
      const resolved = resolvedResult.logs;
      const entries: PaymentEntry[] = [];

      for (const log of paid) {
        const args = log.args as { milestoneIndex?: bigint; amount?: bigint };
        entries.push({
          milestoneIndex: Number(args.milestoneIndex ?? 0n),
          toProvider: args.amount ?? 0n,
          toClient: 0n,
          byArbitration: false,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        });
      }

      for (const log of resolved) {
        const args = log.args as {
          milestoneIndex?: bigint;
          providerAmount?: bigint;
          clientRefundAmount?: bigint;
        };
        entries.push({
          milestoneIndex: Number(args.milestoneIndex ?? 0n),
          toProvider: args.providerAmount ?? 0n,
          toClient: args.clientRefundAmount ?? 0n,
          byArbitration: true,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        });
      }

      // 최근 것이 위로
      return entries.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));
    },
  });
}

/**
 * "내가 아직 확인하지 않은 입금"을 판단하기 위해 마지막으로 본 누적 지급액을
 * 브라우저에 기록해 둔다. 계약·지갑별로 따로 센다.
 */
export function seenKey(agreementId: bigint, viewer?: Address) {
  return `giwa-escrow-seen-released-${agreementId}-${(viewer ?? "anon").toLowerCase()}`;
}

export function readSeenReleased(agreementId: bigint, viewer?: Address): bigint | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(seenKey(agreementId, viewer));
  if (raw === null) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export function writeSeenReleased(agreementId: bigint, viewer: Address | undefined, value: bigint) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(seenKey(agreementId, viewer), value.toString());
}
