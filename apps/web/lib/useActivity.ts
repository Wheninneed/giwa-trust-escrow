"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { escrowContract, isDeployed } from "./contracts";

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
 * 공개 RPC 가 넓은 블록 범위를 거부할 수 있으므로 실패해도 화면을 막지 않는다.
 */
export function useActivity(agreementId?: bigint) {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["activity", agreementId?.toString()],
    enabled: agreementId !== undefined && isDeployed && Boolean(publicClient),
    staleTime: 15_000,
    retry: 0,
    queryFn: async (): Promise<ActivityEntry[]> => {
      const logs = await publicClient!.getContractEvents({
        address: escrowContract.address,
        abi: escrowContract.abi,
        eventName: "MilestoneNote",
        args: { agreementId },
        fromBlock: "earliest",
        toBlock: "latest",
      });

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
