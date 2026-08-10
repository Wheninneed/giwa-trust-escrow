"use client";

import type { PublicClient } from "viem";
import { MAX_LOG_BLOCK_RANGE } from "shared";
import { ESCROW_DEPLOY_BLOCK } from "./contracts";

/**
 * GIWA 공개 RPC 는 eth_getLogs 를 한 번에 10만 블록까지만 받는다.
 * 그래서 배포 블록부터 현재까지를 구간으로 나눠 읽어야 하는데, 체인이 자랄수록
 * 구간 수도 함께 늘어난다. 이것을 한꺼번에 쏘면 공개 RPC 가 과부하로 보고
 * 503 을 돌려준다. 동시 요청 수를 묶고, 실패한 구간만 잠시 뒤 다시 시도한다.
 */

const CONCURRENCY = 3;
const RETRIES = 2;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ChunkedLogResult<T> {
  logs: T[];
  /** 재시도까지 실패한 구간 수. 0 이 아니면 화면에 일부 누락을 알린다. */
  failedRanges: number;
}

export async function fetchLogsInChunks<T>(
  publicClient: PublicClient,
  read: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
): Promise<ChunkedLogResult<T>> {
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

  const logs: T[] = [];
  let failedRanges = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < ranges.length) {
      const range = ranges[cursor++];

      for (let attempt = 0; ; attempt++) {
        try {
          logs.push(...(await read(range.from, range.to)));
          break;
        } catch (error) {
          if (attempt >= RETRIES) {
            // 한 구간이 끝내 실패해도 나머지 기록은 살린다.
            // 전부 버리면 화면에 아무것도 안 남아 더 나쁘다.
            failedRanges += 1;
            console.warn(`로그 구간 ${range.from}~${range.to} 조회 실패`, error);
            break;
          }
          await wait(400 * 2 ** attempt);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ranges.length) }, worker));

  return { logs, failedRanges };
}
