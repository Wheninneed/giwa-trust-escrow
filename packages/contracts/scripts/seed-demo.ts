import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import { keccak256, parseUnits, stringToHex } from "viem";

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
  await token.write.faucet({ account: client.account });
}

const now = Math.floor(Date.now() / 1000);
const DAY = 86_400;

console.log("\n계약을 만드는 중...");
await escrow.write.createAgreement(
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
);

const agreementId = (await escrow.read.agreementCount()) - 1n;
console.log(`  계약 번호: ${agreementId}`);

console.log("토큰 사용 승인...");
await token.write.approve([deployment.escrow as `0x${string}`, TOTAL], { account: client.account });

console.log("계약금 예치...");
await escrow.write.fundAgreement([agreementId], { account: client.account });

const locked = await escrow.read.escrowBalance([agreementId]);
console.log(`  잠긴 금액: ${locked / 1_000_000n} mKRW`);

// 업체 지갑을 이 스크립트가 다룰 수 있을 때(로컬 노드)만 1단계까지 진행해서
// "지급이 실제로 일어났다"를 화면에서 바로 보여준다.
const providerWallet = wallets.find((w) => w.account.address.toLowerCase() === provider.toLowerCase());

if (providerWallet) {
  console.log("\n1단계 증빙 제출 (업체)...");
  await escrow.write.submitMilestone(
    [agreementId, 0n, hash("발주서-2026-07.pdf"), "자재 발주를 완료했습니다. 발주서 첨부합니다."],
    { account: providerWallet.account },
  );

  console.log("1단계 승인 (고객)...");
  await escrow.write.approveMilestone([agreementId, 0n, hash("확인"), "발주서 확인했습니다."], {
    account: client.account,
  });

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
