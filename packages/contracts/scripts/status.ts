import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";

/**
 * 배포된 컨트랙트의 현재 상태를 한눈에 본다.
 * 데모 계약이 제대로 만들어졌는지, 어느 단계까지 진행됐는지 확인할 때 쓴다.
 *
 *   npx hardhat run scripts/status.ts --network giwaSepolia
 */

const here = dirname(fileURLToPath(import.meta.url));

const { viem, networkName } = await network.connect();

const deploymentPath = resolve(
  here,
  "../../shared/src/deployments",
  networkName === "giwaSepolia" ? "giwa-sepolia.json" : `${networkName}.json`,
);

const deployment = JSON.parse(readFileSync(deploymentPath, "utf8")) as {
  escrow: string | null;
  mockKRW: string | null;
};

if (!deployment.escrow) throw new Error("배포 기록이 없습니다.");

const escrow = await viem.getContractAt("GiwaMilestoneEscrow", deployment.escrow as `0x${string}`);

const AGREEMENT_STATUS = ["예치 대기", "진행 중", "분쟁 중", "취소 대기", "완료", "취소됨"];
const MILESTONE_STATUS = ["대기", "제출됨", "보완요청", "승인됨", "분쟁중", "중재정산", "지급완료"];
const mkrw = (value: bigint) => `${(value / 1_000_000n).toLocaleString("ko-KR")} mKRW`;

const count = await escrow.read.agreementCount();
console.log(`에스크로 : ${deployment.escrow}`);
console.log(`계약 수  : ${count}\n`);

for (let i = 0n; i < count; i++) {
  const a = await escrow.read.getAgreement([i]);
  const milestones = await escrow.read.getMilestones([i]);
  const locked = await escrow.read.escrowBalance([i]);

  let title = "(제목 없음)";
  try {
    title = (JSON.parse(a.metadataURI) as { t?: string }).t ?? title;
  } catch {
    // 외부 URI 형식이면 그대로 둔다
  }

  console.log(`#${i}  ${title}`);
  console.log(`     상태 ${AGREEMENT_STATUS[a.status]} | 총 ${mkrw(a.originalAmount)} | 예치 ${mkrw(a.totalFunded)}`);
  console.log(`     지급 ${mkrw(a.totalReleased)} | 환불 ${mkrw(a.totalRefunded)} | 잠김 ${mkrw(locked)}`);
  console.log(`     고객 ${a.client}`);
  console.log(`     업체 ${a.provider}`);
  console.log(`     중재 ${a.arbiter}`);
  console.log(
    `     단계 ${milestones.map((m, index) => `${index + 1}.${MILESTONE_STATUS[m.status]}`).join(" ")}`,
  );
  console.log("");
}
