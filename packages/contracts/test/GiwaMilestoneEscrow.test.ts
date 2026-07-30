import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { zeroAddress } from "viem";
import {
  DAY,
  DEMO_AMOUNTS,
  DEMO_TOTAL,
  assertAccounting,
  createAndFund,
  createDemo,
  demoParams,
  expectRevert,
  fund,
  hash,
  mKRW,
  setup,
  type Ctx,
} from "./helpers.js";

const Status = {
  Created: 0,
  Active: 1,
  Disputed: 2,
  CancelPending: 3,
  Completed: 4,
  Cancelled: 5,
} as const;

const MilestoneStatus = {
  Pending: 0,
  Submitted: 1,
  RevisionRequested: 2,
  Approved: 3,
  Disputed: 4,
  Resolved: 5,
  Paid: 6,
} as const;

/// 앞선 일반 단계 네 개를 제출·승인해 하자보증금 차례까지 진행시킨다
async function completeNormalMilestones(ctx: Ctx, id: bigint) {
  for (let i = 0; i < 4; i++) {
    await ctx.escrow.write.submitMilestone([id, BigInt(i), hash(`증빙 ${i}`)], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, BigInt(i), hash(`승인 ${i}`)], { account: ctx.client.account });
  }
}

describe("계약 생성", () => {
  it("정상 생성되고 조회 값이 일치한다", async () => {
    const ctx = await setup();
    const id = await createDemo(ctx);

    const a = await ctx.escrow.read.getAgreement([id]);
    assert.equal(a.client.toLowerCase(), ctx.client.account.address.toLowerCase());
    assert.equal(a.provider.toLowerCase(), ctx.provider.account.address.toLowerCase());
    assert.equal(a.arbiter.toLowerCase(), ctx.arbiter.account.address.toLowerCase());
    assert.equal(a.originalAmount, DEMO_TOTAL);
    assert.equal(a.totalFunded, 0n);
    assert.equal(a.status, Status.Created);

    const ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms.length, 5);
    assert.equal(ms[4].isRetention, true);
    assert.equal(ms[0].isRetention, false);
  });

  it("생성 이벤트를 발생시킨다", async () => {
    const ctx = await setup();
    await createDemo(ctx);

    const events = await ctx.escrow.getEvents.AgreementCreated();
    assert.equal(events.length, 1);
    assert.equal(events[0].args.totalAmount, DEMO_TOTAL);
  });

  it("역할별 계약 목록에 등록된다", async () => {
    const ctx = await setup();
    const id = await createDemo(ctx);

    assert.deepEqual(await ctx.escrow.read.getClientAgreementIds([ctx.client.account.address]), [id]);
    assert.deepEqual(await ctx.escrow.read.getProviderAgreementIds([ctx.provider.account.address]), [id]);
    assert.deepEqual(await ctx.escrow.read.getArbiterAgreementIds([ctx.arbiter.account.address]), [id]);
  });

  it("zero address 는 거부한다", async () => {
    const ctx = await setup();
    await expectRevert(createDemo({ ...ctx, provider: { account: { address: zeroAddress } } } as Ctx), "ZeroAddress");
  });

  it("고객과 업체가 같으면 거부한다", async () => {
    const ctx = await setup();
    await expectRevert(createDemo({ ...ctx, provider: ctx.client } as Ctx), "DuplicateRole");
  });

  it("업체와 중재자가 같으면 거부한다", async () => {
    const ctx = await setup();
    await expectRevert(createDemo({ ...ctx, arbiter: ctx.provider } as Ctx), "DuplicateRole");
  });

  it("마일스톤이 1개면 거부한다", async () => {
    const ctx = await setup();
    await expectRevert(
      createDemo(ctx, {
        amounts: [mKRW("1000")],
        dueDates: [1n],
        retentionFlags: [false],
        retentionReleaseDates: [0n],
        titleHashes: [hash("단일")],
      }),
      "InvalidMilestoneCount",
    );
  });

  it("마일스톤이 11개면 거부한다", async () => {
    const ctx = await setup();
    const n = 11;
    await expectRevert(
      createDemo(ctx, {
        amounts: Array.from({ length: n }, () => mKRW("1000")),
        dueDates: Array.from({ length: n }, (_, i) => BigInt(i + 1)),
        retentionFlags: Array.from({ length: n }, () => false),
        retentionReleaseDates: Array.from({ length: n }, () => 0n),
        titleHashes: Array.from({ length: n }, (_, i) => hash(`단계 ${i}`)),
      }),
      "InvalidMilestoneCount",
    );
  });

  it("금액이 0인 단계가 있으면 거부한다", async () => {
    const ctx = await setup();
    const p = demoParams(await ctx.networkHelpers.time.latest());
    await expectRevert(createDemo(ctx, { amounts: [0n, ...p.amounts.slice(1)] }), "ZeroAmount");
  });

  it("배열 길이가 다르면 거부한다", async () => {
    const ctx = await setup();
    await expectRevert(createDemo(ctx, { titleHashes: [hash("하나")] }), "ArrayLengthMismatch");
  });

  it("하자보증금이 2개면 거부한다", async () => {
    const ctx = await setup();
    const now = await ctx.networkHelpers.time.latest();
    await expectRevert(
      createDemo(ctx, {
        retentionFlags: [false, false, false, true, true],
        retentionReleaseDates: [0n, 0n, 0n, BigInt(now + 60 * DAY), BigInt(now + 60 * DAY)],
      }),
      "RetentionMustBeLast",
    );
  });

  it("하자보증금이 마지막이 아니면 거부한다", async () => {
    const ctx = await setup();
    const now = await ctx.networkHelpers.time.latest();
    await expectRevert(
      createDemo(ctx, {
        retentionFlags: [false, false, true, false, false],
        retentionReleaseDates: [0n, 0n, BigInt(now + 60 * DAY), 0n, 0n],
      }),
      "RetentionMustBeLast",
    );
  });

  it("예정일이 거꾸로 가면 거부한다", async () => {
    const ctx = await setup();
    const now = await ctx.networkHelpers.time.latest();
    await expectRevert(
      createDemo(ctx, {
        dueDates: [5, 4, 3, 2, 1].map((n) => BigInt(now + n * 7 * DAY)),
      }),
      "InvalidDueDate",
    );
  });

  it("하자보증 해제일이 과거면 거부한다", async () => {
    const ctx = await setup();
    const now = await ctx.networkHelpers.time.latest();
    await expectRevert(
      createDemo(ctx, { retentionReleaseDates: [0n, 0n, 0n, 0n, BigInt(now - DAY)] }),
      "InvalidRetentionRelease",
    );
  });
});

describe("예치", () => {
  it("고객이 전액을 예치하면 진행 중 상태가 된다", async () => {
    const ctx = await setup();
    const id = await createDemo(ctx);
    await fund(ctx, id);

    const a = await ctx.escrow.read.getAgreement([id]);
    assert.equal(a.status, Status.Active);
    assert.equal(a.totalFunded, DEMO_TOTAL);
    assert.equal(await ctx.escrow.read.escrowBalance([id]), DEMO_TOTAL);
    await assertAccounting(ctx);
  });

  it("업체가 예치를 시도하면 거부한다", async () => {
    const ctx = await setup();
    const id = await createDemo(ctx);
    await ctx.token.write.approve([ctx.escrow.address, DEMO_TOTAL], { account: ctx.provider.account });
    await expectRevert(ctx.escrow.write.fundAgreement([id], { account: ctx.provider.account }), "NotClient");
  });

  it("allowance 가 부족하면 실패한다", async () => {
    const ctx = await setup();
    const id = await createDemo(ctx);
    await ctx.token.write.approve([ctx.escrow.address, DEMO_TOTAL - 1n], { account: ctx.client.account });
    await expectRevert(ctx.escrow.write.fundAgreement([id], { account: ctx.client.account }), "ERC20InsufficientAllowance");
  });

  it("두 번 예치할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.token.write.approve([ctx.escrow.address, DEMO_TOTAL], { account: ctx.client.account });
    await expectRevert(ctx.escrow.write.fundAgreement([id], { account: ctx.client.account }), "InvalidAgreementStatus");
  });
});

describe("단계 제출과 승인", () => {
  it("업체가 제출하면 고객 확인 대기 상태가 된다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.submitMilestone([id, 0n, hash("발주서.pdf")], { account: ctx.provider.account });

    const ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms[0].status, MilestoneStatus.Submitted);
    assert.equal(ms[0].evidenceHash, hash("발주서.pdf"));
  });

  it("고객은 제출할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await expectRevert(
      ctx.escrow.write.submitMilestone([id, 0n, hash("x")], { account: ctx.client.account }),
      "NotProvider",
    );
  });

  it("순서를 건너뛴 제출은 거부한다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await expectRevert(
      ctx.escrow.write.submitMilestone([id, 2n, hash("x")], { account: ctx.provider.account }),
      "OutOfOrder",
    );
  });

  it("증빙 해시가 비어 있으면 거부한다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await expectRevert(
      ctx.escrow.write.submitMilestone([id, 0n, `0x${"00".repeat(32)}`], { account: ctx.provider.account }),
      "ZeroEvidenceHash",
    );
  });

  it("승인하면 해당 금액만 업체에게 지급된다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    const before = await ctx.token.read.balanceOf([ctx.provider.account.address]);

    await ctx.escrow.write.submitMilestone([id, 0n, hash("발주서")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.client.account });

    const after = await ctx.token.read.balanceOf([ctx.provider.account.address]);
    assert.equal(after - before, DEMO_AMOUNTS[0]);
    assert.equal(await ctx.escrow.read.escrowBalance([id]), DEMO_TOTAL - DEMO_AMOUNTS[0]);

    const ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms[0].status, MilestoneStatus.Paid);
    await assertAccounting(ctx);
  });

  it("같은 단계를 두 번 승인할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.submitMilestone([id, 0n, hash("발주서")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.client.account });

    await expectRevert(
      ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.client.account }),
      "InvalidMilestoneStatus",
    );
  });

  it("업체는 승인할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.submitMilestone([id, 0n, hash("발주서")], { account: ctx.provider.account });
    await expectRevert(
      ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.provider.account }),
      "NotClient",
    );
  });

  it("설명문은 상태가 아니라 이벤트로만 남는다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.submitMilestone([id, 0n, hash("발주서"), "자재 발주 완료했습니다"], {
      account: ctx.provider.account,
    });

    const notes = await ctx.escrow.getEvents.MilestoneNote();
    assert.equal(notes.length, 1);
    assert.equal(notes[0].args.note, "자재 발주 완료했습니다");
  });
});

describe("보완 요청", () => {
  it("보완 요청 후 재제출하면 승인할 수 있다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);

    await ctx.escrow.write.submitMilestone([id, 0n, hash("1차")], { account: ctx.provider.account });
    await ctx.escrow.write.requestRevision([id, 0n, hash("사진이 흐립니다")], { account: ctx.client.account });

    let ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms[0].status, MilestoneStatus.RevisionRequested);
    assert.equal(ms[0].responseHash, hash("사진이 흐립니다"));

    await ctx.escrow.write.submitMilestone([id, 0n, hash("2차")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.client.account });

    ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms[0].status, MilestoneStatus.Paid);
    await assertAccounting(ctx);
  });

  it("제3자는 보완을 요청할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.submitMilestone([id, 0n, hash("1차")], { account: ctx.provider.account });
    await expectRevert(
      ctx.escrow.write.requestRevision([id, 0n, hash("이유")], { account: ctx.outsider.account }),
      "NotClient",
    );
  });
});

describe("분쟁과 중재", () => {
  async function disputed(ctx: Ctx) {
    const id = await createAndFund(ctx);
    await ctx.escrow.write.submitMilestone([id, 0n, hash("증빙")], { account: ctx.provider.account });
    await ctx.escrow.write.raiseDispute([id, 0n, hash("타일 재시공 필요")], { account: ctx.client.account });
    return id;
  }

  it("고객이 분쟁을 제기하면 계약이 분쟁 상태가 된다", async () => {
    const ctx = await setup();
    const id = await disputed(ctx);

    const a = await ctx.escrow.read.getAgreement([id]);
    assert.equal(a.status, Status.Disputed);
    assert.equal(await ctx.escrow.read.openDisputeCount([id]), 1n);
  });

  it("업체도 분쟁을 제기할 수 있다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.submitMilestone([id, 0n, hash("증빙")], { account: ctx.provider.account });
    await ctx.escrow.write.requestRevision([id, 0n, hash("보완")], { account: ctx.client.account });
    await ctx.escrow.write.raiseDispute([id, 0n, hash("이미 완료한 작업입니다")], { account: ctx.provider.account });

    assert.equal((await ctx.escrow.read.getAgreement([id])).status, Status.Disputed);
  });

  it("분쟁 중에는 일반 승인으로 지급할 수 없다", async () => {
    const ctx = await setup();
    const id = await disputed(ctx);
    await expectRevert(
      ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.client.account }),
      "InvalidAgreementStatus",
    );
  });

  it("중재자가 아니면 해결할 수 없다", async () => {
    const ctx = await setup();
    const id = await disputed(ctx);
    await expectRevert(
      ctx.escrow.write.resolveDispute([id, 0n, DEMO_AMOUNTS[0], 0n, hash("결정")], { account: ctx.client.account }),
      "NotArbiter",
    );
  });

  it("배분 합계가 단계 금액과 다르면 거부한다", async () => {
    const ctx = await setup();
    const id = await disputed(ctx);
    await expectRevert(
      ctx.escrow.write.resolveDispute([id, 0n, DEMO_AMOUNTS[0], 1n, hash("결정")], { account: ctx.arbiter.account }),
      "ResolutionAmountMismatch",
    );
  });

  it("70대 30 부분 정산이 양쪽 잔액에 반영된다", async () => {
    const ctx = await setup();
    const id = await disputed(ctx);

    const providerBefore = await ctx.token.read.balanceOf([ctx.provider.account.address]);
    const clientBefore = await ctx.token.read.balanceOf([ctx.client.account.address]);

    const toProvider = (DEMO_AMOUNTS[0] * 70n) / 100n;
    const toClient = DEMO_AMOUNTS[0] - toProvider;
    await ctx.escrow.write.resolveDispute([id, 0n, toProvider, toClient, hash("70:30 배분")], {
      account: ctx.arbiter.account,
    });

    assert.equal((await ctx.token.read.balanceOf([ctx.provider.account.address])) - providerBefore, toProvider);
    assert.equal((await ctx.token.read.balanceOf([ctx.client.account.address])) - clientBefore, toClient);

    const a = await ctx.escrow.read.getAgreement([id]);
    assert.equal(a.status, Status.Active, "분쟁이 끝나면 진행 중으로 돌아와야 한다");
    const ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms[0].status, MilestoneStatus.Resolved);
    await assertAccounting(ctx);
  });

  it("전액 업체 지급으로 해결할 수 있다", async () => {
    const ctx = await setup();
    const id = await disputed(ctx);
    await ctx.escrow.write.resolveDispute([id, 0n, DEMO_AMOUNTS[0], 0n, hash("업체 손")], {
      account: ctx.arbiter.account,
    });
    await assertAccounting(ctx);
    assert.equal((await ctx.escrow.read.getAgreement([id])).totalReleased, DEMO_AMOUNTS[0]);
  });

  it("전액 고객 환불로 해결할 수 있다", async () => {
    const ctx = await setup();
    const id = await disputed(ctx);
    await ctx.escrow.write.resolveDispute([id, 0n, 0n, DEMO_AMOUNTS[0], hash("고객 손")], {
      account: ctx.arbiter.account,
    });
    await assertAccounting(ctx);
    assert.equal((await ctx.escrow.read.getAgreement([id])).totalRefunded, DEMO_AMOUNTS[0]);
  });

  it("분쟁 해결 후 다음 단계를 이어서 진행할 수 있다", async () => {
    const ctx = await setup();
    const id = await disputed(ctx);
    await ctx.escrow.write.resolveDispute([id, 0n, DEMO_AMOUNTS[0], 0n, hash("결정")], {
      account: ctx.arbiter.account,
    });

    await ctx.escrow.write.submitMilestone([id, 1n, hash("2단계 증빙")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 1n, hash("확인")], { account: ctx.client.account });

    const ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms[1].status, MilestoneStatus.Paid);
    await assertAccounting(ctx);
  });
});

describe("변경계약", () => {
  it("제안·승인·추가금 예치로 새 단계가 열린다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    const extra = mKRW("300000");

    await ctx.escrow.write.proposeChangeOrder(
      [id, extra, 1n, hash("콘센트 추가"), JSON.stringify({ title: "거실 콘센트 4구 추가 및 배선 변경" })],
      { account: ctx.provider.account },
    );
    await ctx.escrow.write.acceptChangeOrder([id, 0n], { account: ctx.client.account });
    await ctx.token.write.approve([ctx.escrow.address, extra], { account: ctx.client.account });
    await ctx.escrow.write.fundChangeOrder([id, 0n], { account: ctx.client.account });

    const a = await ctx.escrow.read.getAgreement([id]);
    assert.equal(a.totalFunded, DEMO_TOTAL + extra);
    assert.equal(await ctx.escrow.read.escrowBalance([id]), DEMO_TOTAL + extra);

    const ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms.length, 6);
    assert.equal(ms[4].amount, extra, "새 단계는 하자보증금 앞에 들어가야 한다");
    assert.equal(ms[5].isRetention, true, "하자보증금은 항상 마지막이어야 한다");
    await assertAccounting(ctx);
  });

  it("제안자는 자기 제안을 승인할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.proposeChangeOrder([id, mKRW("300000"), 1n, hash("추가"), "{}"], {
      account: ctx.provider.account,
    });
    await expectRevert(
      ctx.escrow.write.acceptChangeOrder([id, 0n], { account: ctx.provider.account }),
      "CannotAcceptOwnProposal",
    );
  });

  it("고객이 제안하고 업체가 승인할 수도 있다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.proposeChangeOrder([id, mKRW("100000"), 1n, hash("추가"), "{}"], {
      account: ctx.client.account,
    });
    await ctx.escrow.write.acceptChangeOrder([id, 0n], { account: ctx.provider.account });

    const cos = await ctx.escrow.read.getChangeOrders([id]);
    assert.equal(cos[0].status, 1, "추가금이 있으므로 승인 단계에서 멈춘다");
  });

  it("추가금이 0이면 승인 즉시 기록만 확정된다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.proposeChangeOrder([id, 0n, 3n, hash("기간 연장"), "{}"], {
      account: ctx.provider.account,
    });
    await ctx.escrow.write.acceptChangeOrder([id, 0n], { account: ctx.client.account });

    const cos = await ctx.escrow.read.getChangeOrders([id]);
    assert.equal(cos[0].status, 2, "옮길 자금이 없으므로 바로 확정된다");
    assert.equal((await ctx.escrow.read.getMilestones([id])).length, 5, "새 단계는 생기지 않는다");
  });

  it("예치하지 않은 변경계약 단계는 제출할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.proposeChangeOrder([id, mKRW("300000"), 1n, hash("추가"), "{}"], {
      account: ctx.provider.account,
    });
    await ctx.escrow.write.acceptChangeOrder([id, 0n], { account: ctx.client.account });

    // 아직 fundChangeOrder 전이므로 단계 자체가 없다
    await expectRevert(
      ctx.escrow.write.submitMilestone([id, 5n, hash("증빙")], { account: ctx.provider.account }),
      "MilestoneOutOfRange",
    );
  });

  it("하자보증금이 이미 진행 중이면 변경계약을 막는다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await completeNormalMilestones(ctx, id);
    await ctx.escrow.write.submitMilestone([id, 4n, hash("하자보수 확인")], { account: ctx.provider.account });

    await expectRevert(
      ctx.escrow.write.proposeChangeOrder([id, mKRW("100000"), 1n, hash("추가"), "{}"], {
        account: ctx.provider.account,
      }),
      "RetentionAlreadyStarted",
    );
  });
});

describe("하자보증금", () => {
  it("잠금기간 전에는 지급되지 않는다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await completeNormalMilestones(ctx, id);

    await ctx.escrow.write.submitMilestone([id, 4n, hash("하자보수 확인")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 4n, hash("확인")], { account: ctx.client.account });

    const ms = await ctx.escrow.read.getMilestones([id]);
    assert.equal(ms[4].status, MilestoneStatus.Approved, "승인만 되고 지급은 보류된다");
    assert.equal(await ctx.escrow.read.escrowBalance([id]), DEMO_AMOUNTS[4]);

    await expectRevert(
      ctx.escrow.write.releaseRetention([id, 4n], { account: ctx.provider.account }),
      "RetentionNotMatured",
    );
  });

  it("잠금기간이 지나면 지급되고 계약이 완료된다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await completeNormalMilestones(ctx, id);
    await ctx.escrow.write.submitMilestone([id, 4n, hash("하자보수 확인")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 4n, hash("확인")], { account: ctx.client.account });

    await ctx.networkHelpers.time.increase(61 * DAY);
    await ctx.escrow.write.releaseRetention([id, 4n], { account: ctx.provider.account });

    const a = await ctx.escrow.read.getAgreement([id]);
    assert.equal(a.status, Status.Completed);
    assert.equal(a.totalReleased, DEMO_TOTAL);
    assert.equal(await ctx.escrow.read.escrowBalance([id]), 0n);

    const done = await ctx.escrow.getEvents.AgreementCompleted();
    assert.equal(done.length, 1);
    await assertAccounting(ctx);
  });

  it("일반 단계에는 하자보증 지급 함수를 쓸 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await expectRevert(
      ctx.escrow.write.releaseRetention([id, 0n], { account: ctx.client.account }),
      "NotRetentionMilestone",
    );
  });

  it("하자보증금에 분쟁이 걸리면 지급되지 않는다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await completeNormalMilestones(ctx, id);
    await ctx.escrow.write.submitMilestone([id, 4n, hash("하자보수 확인")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 4n, hash("확인")], { account: ctx.client.account });
    await ctx.escrow.write.raiseDispute([id, 4n, hash("하자 미보수")], { account: ctx.client.account });

    await ctx.networkHelpers.time.increase(61 * DAY);
    await expectRevert(
      ctx.escrow.write.releaseRetention([id, 4n], { account: ctx.provider.account }),
      "InvalidAgreementStatus",
    );
  });
});

describe("상호 합의 취소", () => {
  it("업체가 수락하면 미지급 잔액이 고객에게 환불된다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);

    await ctx.escrow.write.submitMilestone([id, 0n, hash("증빙")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.client.account });

    const clientBefore = await ctx.token.read.balanceOf([ctx.client.account.address]);
    const remaining = await ctx.escrow.read.escrowBalance([id]);

    await ctx.escrow.write.proposeCancellation([id, hash("현장 사정")], { account: ctx.client.account });
    await ctx.escrow.write.acceptCancellation([id], { account: ctx.provider.account });

    assert.equal((await ctx.token.read.balanceOf([ctx.client.account.address])) - clientBefore, remaining);

    const a = await ctx.escrow.read.getAgreement([id]);
    assert.equal(a.status, Status.Cancelled);
    assert.equal(a.totalReleased, DEMO_AMOUNTS[0], "이미 지급한 금액은 회수하지 않는다");
    assert.equal(await ctx.escrow.read.escrowBalance([id]), 0n);
    await assertAccounting(ctx);
  });

  it("제안자 본인은 수락할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.proposeCancellation([id, hash("사유")], { account: ctx.client.account });
    await expectRevert(
      ctx.escrow.write.acceptCancellation([id], { account: ctx.client.account }),
      "SelfAcceptCancellation",
    );
  });

  it("분쟁 중에는 일반 취소를 제안할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.submitMilestone([id, 0n, hash("증빙")], { account: ctx.provider.account });
    await ctx.escrow.write.raiseDispute([id, 0n, hash("분쟁")], { account: ctx.client.account });

    await expectRevert(
      ctx.escrow.write.proposeCancellation([id, hash("사유")], { account: ctx.client.account }),
      "InvalidAgreementStatus",
    );
  });

  it("제3자는 취소를 제안할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await expectRevert(
      ctx.escrow.write.proposeCancellation([id, hash("사유")], { account: ctx.outsider.account }),
      "NotParty",
    );
  });

  it("상대방이 취소 제안을 거절하면 계약이 다시 진행된다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);

    await ctx.escrow.write.proposeCancellation([id, hash("사유")], { account: ctx.client.account });
    await ctx.escrow.write.withdrawCancellation([id], { account: ctx.provider.account });

    assert.equal((await ctx.escrow.read.getAgreement([id])).status, Status.Active);
    assert.equal(
      (await ctx.escrow.read.cancellationProposer([id])).toLowerCase(),
      "0x0000000000000000000000000000000000000000",
    );

    // 계약이 실제로 다시 굴러가야 한다
    await ctx.escrow.write.submitMilestone([id, 0n, hash("증빙")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.client.account });
    await assertAccounting(ctx);
  });

  it("제안자 본인도 취소 제안을 물릴 수 있다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);

    await ctx.escrow.write.proposeCancellation([id, hash("사유")], { account: ctx.provider.account });
    await ctx.escrow.write.withdrawCancellation([id], { account: ctx.provider.account });

    assert.equal((await ctx.escrow.read.getAgreement([id])).status, Status.Active);
  });

  it("취소 제안만으로 상대방의 이의 제기를 막을 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);

    // 업체가 작업을 끝내고 증빙을 냈는데
    await ctx.escrow.write.submitMilestone([id, 0n, hash("증빙")], { account: ctx.provider.account });
    // 고객이 승인 대신 취소를 제안해 대금을 회피하려 한다
    await ctx.escrow.write.proposeCancellation([id, hash("그만하겠습니다")], { account: ctx.client.account });

    // 업체는 여전히 분쟁을 제기할 수 있어야 한다
    await ctx.escrow.write.raiseDispute([id, 0n, hash("완료한 작업입니다")], { account: ctx.provider.account });
    assert.equal((await ctx.escrow.read.getAgreement([id])).status, Status.Disputed);

    // 분쟁이 시작되면 계류 중이던 취소 제안은 무효가 된다
    await expectRevert(
      ctx.escrow.write.acceptCancellation([id], { account: ctx.provider.account }),
      "InvalidAgreementStatus",
    );

    // 중재자가 배분하면 정상 흐름으로 돌아온다
    await ctx.escrow.write.resolveDispute([id, 0n, DEMO_AMOUNTS[0], 0n, hash("업체 손")], {
      account: ctx.arbiter.account,
    });
    assert.equal((await ctx.escrow.read.getAgreement([id])).status, Status.Active);
    await assertAccounting(ctx);
  });

  it("취소 대기 상태가 아니면 물릴 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await expectRevert(
      ctx.escrow.write.withdrawCancellation([id], { account: ctx.client.account }),
      "InvalidAgreementStatus",
    );
  });

  it("제3자는 취소 제안을 물릴 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await ctx.escrow.write.proposeCancellation([id, hash("사유")], { account: ctx.client.account });
    await expectRevert(
      ctx.escrow.write.withdrawCancellation([id], { account: ctx.outsider.account }),
      "NotParty",
    );
  });
});

describe("관리자 권한", () => {
  it("일시정지 중에는 예치가 막힌다", async () => {
    const ctx = await setup();
    const id = await createDemo(ctx);
    await ctx.escrow.write.pause({ account: ctx.admin.account });
    await ctx.token.write.approve([ctx.escrow.address, DEMO_TOTAL], { account: ctx.client.account });

    await expectRevert(ctx.escrow.write.fundAgreement([id], { account: ctx.client.account }), "EnforcedPause");
  });

  it("일시정지를 풀면 다시 진행된다", async () => {
    const ctx = await setup();
    const id = await createDemo(ctx);
    await ctx.escrow.write.pause({ account: ctx.admin.account });
    await ctx.escrow.write.unpause({ account: ctx.admin.account });
    await fund(ctx, id);

    assert.equal((await ctx.escrow.read.getAgreement([id])).status, Status.Active);
  });

  it("관리자가 아니면 일시정지할 수 없다", async () => {
    const ctx = await setup();
    await expectRevert(ctx.escrow.write.pause({ account: ctx.outsider.account }), "OwnableUnauthorizedAccount");
  });

  it("상태를 바꾸는 함수는 허용된 목록뿐이다", async () => {
    const ctx = await setup();

    // 자금을 움직일 수 있는 진입점이 늘어나면 이 테스트가 먼저 깨진다.
    // 새 함수를 추가할 때는 권한을 다시 검토하고 여기에 명시적으로 넣어야 한다.
    const allowed = new Set([
      // 계약 당사자만 호출 — 각 함수에서 client/provider/arbiter 를 검증한다
      "createAgreement",
      "fundAgreement",
      "submitMilestone",
      "approveMilestone",
      "requestRevision",
      "releaseRetention",
      "raiseDispute",
      "resolveDispute",
      "proposeChangeOrder",
      "acceptChangeOrder",
      "fundChangeOrder",
      "proposeCancellation",
      "withdrawCancellation",
      "acceptCancellation",
      // 관리자 — 자금을 옮기지 않는다
      "pause",
      "unpause",
      "transferOwnership",
      "acceptOwnership",
      "renounceOwnership",
    ]);

    const stateChanging = ctx.escrow.abi
      .filter((item) => item.type === "function" && item.stateMutability !== "view" && item.stateMutability !== "pure")
      .map((item) => (item as { name: string }).name);

    const unexpected = stateChanging.filter((name) => !allowed.has(name));
    assert.deepEqual(unexpected, [], "검토되지 않은 상태 변경 함수가 있다");
  });

  it("관리자는 예치금을 빼낼 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    const before = await ctx.token.read.balanceOf([ctx.admin.account.address]);

    // 관리자가 쓸 수 있는 모든 수단을 동원해도 잠긴 금액은 움직이지 않는다
    await ctx.escrow.write.pause({ account: ctx.admin.account });
    await ctx.escrow.write.unpause({ account: ctx.admin.account });

    // 당사자 전용 함수는 관리자에게도 닫혀 있다
    await expectRevert(
      ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.admin.account }),
      "NotClient",
    );
    await expectRevert(
      ctx.escrow.write.acceptCancellation([id], { account: ctx.admin.account }),
      "NotParty",
    );

    assert.equal(await ctx.escrow.read.escrowBalance([id]), DEMO_TOTAL, "잠긴 금액이 그대로여야 한다");
    assert.equal(await ctx.token.read.balanceOf([ctx.admin.account.address]), before, "관리자 잔액이 늘면 안 된다");
    await assertAccounting(ctx);
  });

  it("제3자는 계약 당사자 함수를 호출할 수 없다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    await expectRevert(
      ctx.escrow.write.submitMilestone([id, 0n, hash("증빙")], { account: ctx.outsider.account }),
      "NotProvider",
    );
    await expectRevert(
      ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.outsider.account }),
      "NotClient",
    );
  });
});

describe("전체 흐름", () => {
  it("데모 시나리오 전체가 회계를 깨뜨리지 않는다", async () => {
    const ctx = await setup();
    const id = await createAndFund(ctx);
    const extra = mKRW("300000");

    // 1단계 정상 승인
    await ctx.escrow.write.submitMilestone([id, 0n, hash("발주서")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 0n, hash("확인")], { account: ctx.client.account });

    // 변경계약으로 추가 작업 등록
    await ctx.escrow.write.proposeChangeOrder([id, extra, 1n, hash("콘센트"), "{}"], {
      account: ctx.provider.account,
    });
    await ctx.escrow.write.acceptChangeOrder([id, 0n], { account: ctx.client.account });
    await ctx.token.write.approve([ctx.escrow.address, extra], { account: ctx.client.account });
    await ctx.escrow.write.fundChangeOrder([id, 0n], { account: ctx.client.account });

    // 2단계 정상 승인
    await ctx.escrow.write.submitMilestone([id, 1n, hash("기초공사")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 1n, hash("확인")], { account: ctx.client.account });

    // 3단계에서 분쟁 → 70:30 배분
    await ctx.escrow.write.submitMilestone([id, 2n, hash("타일")], { account: ctx.provider.account });
    await ctx.escrow.write.raiseDispute([id, 2n, hash("타일 재시공")], { account: ctx.client.account });
    const toProvider = (DEMO_AMOUNTS[2] * 70n) / 100n;
    await ctx.escrow.write.resolveDispute([id, 2n, toProvider, DEMO_AMOUNTS[2] - toProvider, hash("70:30")], {
      account: ctx.arbiter.account,
    });
    await assertAccounting(ctx);

    // 4단계 + 변경계약 단계 승인
    await ctx.escrow.write.submitMilestone([id, 3n, hash("준공")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 3n, hash("확인")], { account: ctx.client.account });
    await ctx.escrow.write.submitMilestone([id, 4n, hash("콘센트 완료")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 4n, hash("확인")], { account: ctx.client.account });

    // 하자보증금
    await ctx.escrow.write.submitMilestone([id, 5n, hash("하자보수")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([id, 5n, hash("확인")], { account: ctx.client.account });
    await ctx.networkHelpers.time.increase(61 * DAY);
    await ctx.escrow.write.releaseRetention([id, 5n], { account: ctx.client.account });

    const a = await ctx.escrow.read.getAgreement([id]);
    assert.equal(a.status, Status.Completed);
    assert.equal(a.totalReleased + a.totalRefunded, DEMO_TOTAL + extra);
    assert.equal(await ctx.escrow.read.escrowBalance([id]), 0n);
    await assertAccounting(ctx);
  });

  it("여러 계약이 섞여도 계약별 잔액이 분리된다", async () => {
    const ctx = await setup();
    const first = await createAndFund(ctx);
    const second = await createAndFund(ctx);

    await ctx.escrow.write.submitMilestone([first, 0n, hash("증빙")], { account: ctx.provider.account });
    await ctx.escrow.write.approveMilestone([first, 0n, hash("확인")], { account: ctx.client.account });

    assert.equal(await ctx.escrow.read.escrowBalance([first]), DEMO_TOTAL - DEMO_AMOUNTS[0]);
    assert.equal(await ctx.escrow.read.escrowBalance([second]), DEMO_TOTAL, "다른 계약은 영향을 받지 않는다");
    await assertAccounting(ctx);
  });
});
