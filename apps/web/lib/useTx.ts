"use client";

import { useCallback, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { toKoreanError } from "shared";
import { useToast } from "@/components/Toast";

/**
 * 트랜잭션 한 건을 "지갑 서명 → 블록 확인 → 화면 갱신"까지 끌고 간다.
 * 명세서 0장 3번에 따라 확인 대기에는 타임아웃을 둔다.
 */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  const run = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (label: string, request: any): Promise<`0x${string}`> => {
      setPendingLabel(label);
      try {
        const hash = await writeContractAsync(request);
        toast.push(`${label} — 처리 중입니다`, "neutral", hash);

        const receipt = await publicClient!.waitForTransactionReceipt({
          hash,
          timeout: 120_000,
          confirmations: 1,
        });

        if (receipt.status !== "success") {
          throw new Error("트랜잭션이 체인에서 실패했습니다.");
        }

        toast.push(`${label} 완료`, "success", hash);
        await queryClient.invalidateQueries();
        return hash;
      } catch (error) {
        toast.push(toKoreanError(error), "danger");
        throw error;
      } finally {
        setPendingLabel(null);
      }
    },
    [publicClient, queryClient, toast, writeContractAsync],
  );

  return { run, pendingLabel, isPending: pendingLabel !== null };
}
