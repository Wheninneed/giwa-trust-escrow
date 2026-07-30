"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { MAX_LOG_BLOCK_RANGE } from "shared";
import { ESCROW_DEPLOY_BLOCK, escrowContract, isDeployed } from "./contracts";

export interface ActivityEntry {
  kind: number;
  author: string;
  note: string;
  milestoneIndex: number | null;
  blockNumber: bigint;
  txHash: string;
}

/**
 * 사람이 읽는 설명문은 MilestoneNote 이벤트에만 남는다.
 *
 * GIWA 공개 RPC 는 eth_getLogs 를 한 번에 10만 블록까지만 받으므로
 * 배포 블록부터 현재까지를 구간으로 나눠 읽는다. 실패해도 화면을 막지 않는다.
 */
export function useActivity(agreementId?: bigint) {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["activity", agreementId?.toString()],
    enabled: agreementId !== undefined && isDeployed && Boolean(publicClient),
    staleTime: 15_000,
    retry: 0,
    queryFn: async (): Promise<ActivityEntry[]> => {
      const latest = await publicClient!.getBlockNumber();

      // 배포 블록을 모르면 RPC 가 받아주는 최근 구간만 훑는다
      const start =
        ESCROW_DEPLOY_BLOCK > 0n
          ? ESCROW_DEPLOY_BLOCK
          : latest > MAX_LOG_BLOCK_RANGE
            ? latest - MAX_LOG_BLOCK_RANGE + 1n
            : 0n;

      const ranges: Array<{ from: bigint; to: bigint }> = [];
      for (let from = start; from <= latest; from += MAX_LOG_BLOCK_RANGE) {
        const to = from + MAX_LOG_BLOCK_RANGE - 1n;
        ranges.push({ from, to: to > latest ? latest : to });
      }

      const chunks = await Promise.all(
        ranges.map((range) =>
          publicClient!.getContractEvents({
            address: escrowContract.address,
            abi: escrowContract.abi,
            eventName: "MilestoneNote",
            args: { agreementId },
            fromBlock: range.from,
            toBlock: range.to,
          }),
        ),
      );

      const logs = chunks.flat();

      return logs
        .map((log) => {
          const args = log.args as {
            kind?: number;
            author?: string;
            note?: string;
            milestoneIndex?: bigint;
          };
          const index = args.milestoneIndex;
          // 취소 사유는 특정 단계에 속하지 않으므로 uint256 최대값으로 보낸다
          const isAgreementLevel = index !== undefined && index > 1_000_000n;

          return {
            kind: Number(args.kind ?? 0),
            author: args.author ?? "",
            note: args.note ?? "",
            milestoneIndex: isAgreementLevel || index === undefined ? null : Number(index),
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
          };
        })
        .reverse();
    },
  });
}

export const NOTE_KIND_LABEL: Record<number, string> = {
  0: "증빙 제출",
  1: "보완 요청",
  2: "분쟁 제기",
  3: "승인 메모",
  4: "중재 결정",
  5: "취소 제안",
};
