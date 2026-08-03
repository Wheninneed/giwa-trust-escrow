"use client";

import type { PublicClient } from "viem";
import { MAX_LOG_BLOCK_RANGE } from "shared";
import { ESCROW_DEPLOY_BLOCK } from "./contracts";

/**
 * GIWA 공개 RPC 는 eth_getLogs 를 한 번에 10만 블록까지만 받는다.
 * 배포 블록부터 현재까지를 구간으로 나눠 읽는다.
 */
export async function fetchLogsInChunks<T>(
  publicClient: PublicClient,
  read: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
): Promise<T[]> {
  const latest = await publicClient.getBlockNumber();

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

  const chunks = await Promise.all(ranges.map((range) => read(range.from, range.to)));
  return chunks.flat();
}
