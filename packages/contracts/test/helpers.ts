import assert from "node:assert/strict";
import { network } from "hardhat";
import { keccak256, parseUnits, stringToHex, type Address } from "viem";

export const DAY = 86_400;
export const mKRW = (amount: string) => parseUnits(amount, 6);
export const hash = (text: string) => keccak256(stringToHex(text));

/// 데모 계약 — 명세서 17장의 "평택 아파트 32평 부분 인테리어"
export const DEMO_TITLES = [
  "자재 발주 및 작업 착수",
  "철거·설비·전기 기초공사",
  "목공·타일·주요 시공",
  "준공 및 최종검수",
  "하자보증금",
];
export const DEMO_AMOUNTS = [
  mKRW("10000000"),
  mKRW("10000000"),
  mKRW("15000000"),
  mKRW("10000000"),
  mKRW("5000000"),
];
export const DEMO_TOTAL = DEMO_AMOUNTS.reduce((a, b) => a + b, 0n);

export async function setup() {
  const { viem, networkHelpers } = await network.create();
  const [admin, client, provider, arbiter, outsider] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();

  const token = await viem.deployContract("MockKRW", [admin.account.address]);
  const escrow = await viem.deployContract("GiwaMilestoneEscrow", [admin.account.address]);

  // 고객에게 넉넉한 테스트 잔액을 준다
  await token.write.mintTo([client.account.address, mKRW("1000000000")], { account: admin.account });

  return { viem, networkHelpers, publicClient, admin, client, provider, arbiter, outsider, token, escrow };
}

export type Ctx = Awaited<ReturnType<typeof setup>>;

/// 명세서 9.3 의 createAgreement 인자 묶음
export function demoParams(now: number, overrides: Partial<Record<string, unknown>> = {}) {
  const base = {
    amounts: DEMO_AMOUNTS,
    dueDates: [1, 2, 3, 4, 5].map((n) => BigInt(now + n * 7 * DAY)),
    retentionFlags: [false, false, false, false, true],
    retentionReleaseDates: [0n, 0n, 0n, 0n, BigInt(now + 60 * DAY)],
    titleHashes: DEMO_TITLES.map(hash),
    termsHash: hash("평택 아파트 32평 부분 인테리어 표준 계약"),
    metadataURI: JSON.stringify({ title: "평택 아파트 32평 부분 인테리어", ms: DEMO_TITLES }),
  };
  return { ...base, ...overrides } as typeof base;
}

export async function createDemo(ctx: Ctx, overrides: Partial<Record<string, unknown>> = {}) {
  const now = await ctx.networkHelpers.time.latest();
  const p = demoParams(now, overrides);
  await ctx.escrow.write.createAgreement(
    [
      ctx.provider.account.address,
      ctx.arbiter.account.address,
      ctx.token.address,
      p.amounts,
      p.dueDates,
      p.retentionFlags,
      p.retentionReleaseDates,
      p.titleHashes,
      p.termsHash,
      p.metadataURI,
    ],
    { account: ctx.client.account },
  );
  return (await ctx.escrow.read.agreementCount()) - 1n;
}

export async function fund(ctx: Ctx, agreementId: bigint, amount = DEMO_TOTAL) {
  await ctx.token.write.approve([ctx.escrow.address, amount], { account: ctx.client.account });
  await ctx.escrow.write.fundAgreement([agreementId], { account: ctx.client.account });
}

export async function createAndFund(ctx: Ctx) {
  const id = await createDemo(ctx);
  await fund(ctx, id);
  return id;
}

/// 커스텀 에러 이름으로 revert 를 확인한다
export async function expectRevert(p: Promise<unknown>, errorName: string) {
  await assert.rejects(p, (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    assert.ok(
      message.includes(errorName),
      `"${errorName}" 로 revert 되어야 하는데 실제 메시지는:\n${message}`,
    );
    return true;
  });
}

/// 명세서 10.1 의 핵심 회계 불변조건.
/// 컨트랙트가 실제로 들고 있는 토큰 = 모든 계약의 미지급 잔액 합계
export async function assertAccounting(ctx: Ctx) {
  const count = await ctx.escrow.read.agreementCount();
  let expected = 0n;
  for (let i = 0n; i < count; i++) {
    const a = await ctx.escrow.read.getAgreement([i]);
    assert.ok(a.totalReleased + a.totalRefunded <= a.totalFunded, `계약 ${i}: 지급+환불이 예치액을 넘었다`);
    expected += await ctx.escrow.read.escrowBalance([i]);
  }
  const actual = await ctx.token.read.balanceOf([ctx.escrow.address as Address]);
  assert.equal(actual, expected, "컨트랙트 토큰 잔액이 계약별 회계 합계와 다르다");
}
