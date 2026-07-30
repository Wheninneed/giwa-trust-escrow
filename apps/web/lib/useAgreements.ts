"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address } from "viem";
import {
  AgreementStatus,
  MilestoneStatus,
  parseAgreementMetadata,
  type Agreement,
  type ChangeOrder,
  type Milestone,
  type Role,
} from "shared";
import { escrowContract, isDeployed } from "./contracts";

const sameAddress = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());

export function roleOf(agreement: Pick<Agreement, "client" | "provider" | "arbiter">, viewer?: string): Role {
  if (sameAddress(agreement.client, viewer)) return "client";
  if (sameAddress(agreement.provider, viewer)) return "provider";
  if (sameAddress(agreement.arbiter, viewer)) return "arbiter";
  return "observer";
}

/** 내가 고객·업체·중재자로 참여 중인 모든 계약 id */
export function useMyAgreementIds() {
  const { address } = useAccount();

  const query = useReadContracts({
    contracts: [
      { ...escrowContract, functionName: "getClientAgreementIds", args: [address as Address] },
      { ...escrowContract, functionName: "getProviderAgreementIds", args: [address as Address] },
      { ...escrowContract, functionName: "getArbiterAgreementIds", args: [address as Address] },
    ],
    query: { enabled: Boolean(address) && isDeployed },
  });

  const ids = useMemo(() => {
    const merged = new Set<string>();
    for (const result of query.data ?? []) {
      if (result.status !== "success") continue;
      for (const id of result.result as readonly bigint[]) merged.add(id.toString());
    }
    // 최근에 만든 계약이 위로 오게 한다
    return Array.from(merged)
      .map((value) => BigInt(value))
      .sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
  }, [query.data]);

  return { ids, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

export interface AgreementSummary {
  id: bigint;
  agreement: Agreement;
  milestones: Milestone[];
  role: Role;
  metadata: ReturnType<typeof parseAgreementMetadata>;
  /** 지금 행동해야 할 단계. 모두 정산되었으면 undefined */
  activeMilestone?: { index: number; milestone: Milestone };
}

export function useAgreementSummaries(ids: bigint[]) {
  const { address } = useAccount();

  const query = useReadContracts({
    contracts: ids.flatMap((id) => [
      { ...escrowContract, functionName: "getAgreement" as const, args: [id] },
      { ...escrowContract, functionName: "getMilestones" as const, args: [id] },
    ]),
    query: { enabled: ids.length > 0 && isDeployed },
  });

  const summaries = useMemo<AgreementSummary[]>(() => {
    if (!query.data) return [];

    return ids.flatMap((id, index) => {
      const agreementResult = query.data[index * 2];
      const milestoneResult = query.data[index * 2 + 1];
      if (agreementResult?.status !== "success") return [];

      const agreement = agreementResult.result as unknown as Agreement;
      const milestones = [
        ...((milestoneResult?.status === "success" ? milestoneResult.result : []) as unknown as Milestone[]),
      ];

      const activeIndex = milestones.findIndex(
        (m) => m.status !== MilestoneStatus.Paid && m.status !== MilestoneStatus.Resolved,
      );

      return [
        {
          id,
          agreement,
          milestones,
          role: roleOf(agreement, address),
          metadata: parseAgreementMetadata(agreement.metadataURI),
          activeMilestone:
            activeIndex >= 0 ? { index: activeIndex, milestone: milestones[activeIndex] } : undefined,
        },
      ];
    });
  }, [query.data, ids, address]);

  return { summaries, isLoading: query.isLoading, error: query.error };
}

export interface AgreementDetail {
  agreement: Agreement;
  milestones: Milestone[];
  changeOrders: ChangeOrder[];
  escrowBalance: bigint;
  firstUnsettled: number;
  cancelProposer: Address;
  role: Role;
  metadata: ReturnType<typeof parseAgreementMetadata>;
}

export function useAgreementDetail(id?: bigint) {
  const { address } = useAccount();
  const enabled = id !== undefined && isDeployed;

  const query = useReadContracts({
    contracts: [
      { ...escrowContract, functionName: "getAgreement", args: [id as bigint] },
      { ...escrowContract, functionName: "getMilestones", args: [id as bigint] },
      { ...escrowContract, functionName: "getChangeOrders", args: [id as bigint] },
      { ...escrowContract, functionName: "escrowBalance", args: [id as bigint] },
      { ...escrowContract, functionName: "firstUnsettledMilestone", args: [id as bigint] },
      { ...escrowContract, functionName: "cancellationProposer", args: [id as bigint] },
    ],
    query: { enabled, refetchInterval: 12_000 },
  });

  const detail = useMemo<AgreementDetail | null>(() => {
    if (!query.data || query.data[0]?.status !== "success") return null;

    const agreement = query.data[0].result as unknown as Agreement;
    const milestones = (query.data[1]?.status === "success" ? query.data[1].result : []) as unknown as Milestone[];
    const changeOrders = (query.data[2]?.status === "success" ? query.data[2].result : []) as unknown as ChangeOrder[];
    const escrowBalance = (query.data[3]?.status === "success" ? query.data[3].result : 0n) as bigint;
    const firstUnsettled = Number((query.data[4]?.status === "success" ? query.data[4].result : 0n) as bigint);
    const cancelProposer = (query.data[5]?.status === "success"
      ? query.data[5].result
      : "0x0000000000000000000000000000000000000000") as Address;

    return {
      agreement,
      milestones: [...milestones],
      changeOrders: [...changeOrders],
      escrowBalance,
      firstUnsettled,
      cancelProposer,
      role: roleOf(agreement, address),
      metadata: parseAgreementMetadata(agreement.metadataURI),
    };
  }, [query.data, address]);

  return { detail, isLoading: query.isLoading, error: query.error, refetch: query.refetch };
}

/** 계약 카드·상세 상단에 쓰는 진행률 */
export function progressOf(detail: Pick<AgreementDetail, "agreement" | "milestones">) {
  const settled = detail.milestones.filter(
    (m) => m.status === MilestoneStatus.Paid || m.status === MilestoneStatus.Resolved,
  ).length;
  const total = detail.milestones.length || 1;
  const funded = detail.agreement.totalFunded || 1n;

  return {
    settled,
    total: detail.milestones.length,
    percent: Math.round((settled / total) * 100),
    paidPercent: Number((detail.agreement.totalReleased * 100n) / funded),
  };
}

export function useTokenBalance(token?: Address) {
  const { address } = useAccount();
  return useReadContract({
    address: token,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ] as const,
    functionName: "balanceOf",
    args: [address as Address],
    query: { enabled: Boolean(address && token) },
  });
}

export const isFinalStatus = (status: number) =>
  status === AgreementStatus.Completed || status === AgreementStatus.Cancelled;
