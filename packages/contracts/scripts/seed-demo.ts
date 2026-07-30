import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import { keccak256, parseEventLogs, parseUnits, stringToHex } from "viem";

/**
 * 심사용 데모 계약을 만든다 (명세서 17장).
 * 1단계는 제출·승인까지 진행해 "지급이 실제로 일어났다"를 바로 보여준다.
 *
 * 필요한 환경변수:
 *   DEPLOYER_PRIVATE_KEY  고객 역할로 서명한다
 *   DEMO_PROVIDER_ADDRESS 업체 지갑
 *   DEMO_ARBITER_ADDRESS  중재자 지갑
 */

const here = dirname(fileURLToPath(import.meta.url));

const mKRW = (value: string) => parseUnits(value, 6);
const hash = (text: string) => keccak256(stringToHex(text));

const TITLES = [
  "자재 발주 및 작업 착수",
  "철거·설비·전기 기초공사",
  "목공·타일·주요 시공",
  "준공 및 최종검수",
  "하자보증금",
];
const AMOUNTS = [mKRW("10000000"), mKRW("10000000"), mKRW("15000000"), mKRW("10000000"), mKRW("5000000")];
const TOTAL = AMOUNTS.reduce((a, b) => a + b, 0n);

const { viem, networkName } = await network.connect();
const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();
const [client] = wallets;

const deploymentPath = resolve(
  here,
  "../../shared/src/deployments",
  networkName === "giwaSepolia" ? "giwa-sepolia.json" : `${networkName}.json`,
);

const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as {
  escrow: string | null;
  mockKRW: string | null;
};

if (!deployment.escrow || !deployment.mockKRW) {
  throw new Error("먼저 배포하세요: pnpm --filter contracts deploy:giwa");
}

// 로컬 노드에서는 노드가 주는 계정을 그대로 업체·중재자로 쓴다
const provider = process.env.DEMO_PROVIDER_ADDRESS ?? wallets[1]?.account.address;
const arbiter = process.env.DEMO_ARBITER_ADDRESS ?? wallets[2]?.account.address;

if (!provider || !arbiter) {
  throw new Error(
    "DEMO_PROVIDER_ADDRESS 와 DEMO_ARBITER_ADDRESS 를 .env 에 넣어주세요. 고객 지갑과 서로 달라야 합니다.",
  );
}

const escrow = await viem.getContractAt("GiwaMilestoneEscrow", deployment.escrow as `0x${string}`);
const token = await viem.getContractAt("MockKRW", deployment.mockKRW as `0x${string}`);

console.log(`고객   : ${client.account.address}`);
console.log(`업체   : ${provider}`);
console.log(`중재자 : ${arbiter}`);

const balance = await token.read.balanceOf([client.account.address]);
if (balance < TOTAL) {
  console.log("고객 잔액이 부족해 faucet 을 호출합니다...");
  await send("faucet", token.write.faucet({ account: client.account }));
}

const now = Math.floor(Date.now() / 1000);
const DAY = 86_400;

/**
 * 실제 네트워크에서는 트랜잭션이 바로 채굴되지 않는다.
 * 다음 호출이 이전 상태를 읽지 않도록 매번 영수증을 기다린다.
 */
async function send(label: string, hashPromise: Promise<`0x${string}`>) {
  const txHash = await hashPromise;
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  if (receipt.status !== "success") throw new Error(`${label} 트랜잭션이 실패했습니다: ${txHash}`);
  console.log(`  ${label} ✓ ${txHash}`);
  return receipt;
}

// 이전 실행이 계약을 만들고 예치 전에 멈췄을 수 있다. 같은 조건의 미예치
// 계약이 있으면 새로 만들지 않고 그것을 이어서 쓴다 (스크립트 재실행 안전).
const existingIds = await escrow.read.getClientAgreementIds([client.account.address]);
let agreementId: bigint | undefined;

for (const id of existingIds) {
  const a = await escrow.read.getAgreement([id]);
  const reusable =
    a.status === 0 && // Created — 아직 예치 전
    a.provider.toLowerCase() === provider.toLowerCase() &&
    a.arbiter.toLowerCase() === arbiter.toLowerCase() &&
    a.originalAmount === TOTAL;

  if (reusable) {
    agreementId = id;
    console.log(`\n예치 전 상태인 기존 계약 #${id} 을 이어서 씁니다.`);
    break;
  }
}

if (agreementId === undefined) {
  console.log("\n계약을 만드는 중...");
  const createReceipt = await send(
    "계약 생성",
    escrow.write.createAgreement(
  [
    provider as `0x${string}`,
    arbiter as `0x${string}`,
    deployment.mockKRW as `0x${string}`,
    AMOUNTS,
    [1, 2, 3, 4, 5].map((n) => BigInt(now + n * 14 * DAY)),
    [false, false, false, false, true],
    // 심사 중에 하자보증 흐름까지 볼 수 있도록 잠금을 5분으로 둔다
    [0n, 0n, 0n, 0n, BigInt(now + 300)],
    TITLES.map(hash),
    hash("평택 아파트 32평 부분 인테리어 표준 계약"),
    JSON.stringify({
      t: "평택 아파트 32평 부분 인테리어",
      d: "데모용 계약입니다. 하자보증 잠금이 5분으로 짧게 설정되어 있습니다.",
      ms: TITLES,
      ev: ["발주서, 자재 목록", "전후 사진, 배선 사진", "공정별 사진", "완료 사진, 검수 목록", "하자보수 완료 확인"],
    }),
  ],
  { account: client.account },
    ),
  );

  // 동시에 다른 계약이 생겼을 수도 있으므로 카운터 대신 이벤트에서 번호를 읽는다
  const created = parseEventLogs({
    abi: escrow.abi,
    eventName: "AgreementCreated",
    logs: createReceipt.logs,
  });
  agreementId = (created[0]?.args as { agreementId?: bigint } | undefined)?.agreementId;
  if (agreementId === undefined) throw new Error("AgreementCreated 이벤트를 찾지 못했습니다.");
}

console.log(`  계약 번호: ${agreementId}`);

console.log("\n토큰 사용 승인...");
await send(
  "approve",
  token.write.approve([deployment.escrow as `0x${string}`, TOTAL], { account: client.account }),
);

console.log("\n계약금 예치...");
const fundReceipt = await send(
  "fundAgreement",
  escrow.write.fundAgreement([agreementId], { account: client.account }),
);

// 공개 RPC 는 노드 여러 대를 오가므로, 방금 채굴된 블록을 명시해 조회한다.
// 그러지 않으면 아직 따라오지 못한 노드가 이전 값을 돌려줄 수 있다.
const locked = await escrow.read.escrowBalance([agreementId], { blockNumber: fundReceipt.blockNumber });
console.log(`  잠긴 금액: ${locked / 1_000_000n} mKRW`);

// 업체 지갑을 이 스크립트가 다룰 수 있을 때(로컬 노드)만 1단계까지 진행해서
// "지급이 실제로 일어났다"를 화면에서 바로 보여준다.
const providerWallet = wallets.find((w) => w.account.address.toLowerCase() === provider.toLowerCase());

if (providerWallet) {
  console.log("\n1단계 증빙 제출 (업체)...");
  await send(
    "submitMilestone",
    escrow.write.submitMilestone(
      [agreementId, 0n, hash("발주서-2026-07.pdf"), "자재 발주를 완료했습니다. 발주서 첨부합니다."],
      { account: providerWallet.account },
    ),
  );

  console.log("\n1단계 승인 (고객)...");
  await send(
    "approveMilestone",
    escrow.write.approveMilestone([agreementId, 0n, hash("확인"), "발주서 확인했습니다."], {
      account: client.account,
    }),
  );

  const paid = await token.read.balanceOf([provider as `0x${string}`]);
  console.log(`  업체 수령액: ${paid / 1_000_000n} mKRW`);
  console.log(`  남은 잠금액: ${(await escrow.read.escrowBalance([agreementId])) / 1_000_000n} mKRW`);
}

const chainId = await publicClient.getChainId();
console.log(`\n데모 계약 준비 완료 (계약 #${agreementId}, chainId ${chainId})`);

if (networkName === "giwaSepolia") {
  console.log(`  https://sepolia-explorer.giwa.io/address/${deployment.escrow}`);
  console.log(`\n다음 단계는 업체 지갑으로 진행하세요:`);
  console.log(`  1단계 증빙 제출 → 고객 승인 → 지급 확인`);
}
