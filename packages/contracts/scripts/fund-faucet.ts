import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import { formatUnits, parseUnits } from "viem";

/**
 * 시작 지원금 지갑에 mKRW 를 채운다.
 * 사용자 한 명당 1억씩 나눠주므로 넉넉히 보낸다.
 *
 *   FAUCET_WALLET_ADDRESS=0x... npx hardhat run scripts/fund-faucet.ts --network giwaSepolia
 */

const here = dirname(fileURLToPath(import.meta.url));
const AMOUNT = parseUnits("5000000000", 6); // 50억 mKRW = 50명분

const target = process.env.FAUCET_WALLET_ADDRESS;
if (!target || !/^0x[0-9a-fA-F]{40}$/.test(target)) {
  throw new Error("FAUCET_WALLET_ADDRESS 를 지정하세요.");
}

const { viem, networkName } = await network.connect();
const publicClient = await viem.getPublicClient();
const [sender] = await viem.getWalletClients();

const deployment = JSON.parse(
  readFileSync(
    resolve(here, "../../shared/src/deployments", networkName === "giwaSepolia" ? "giwa-sepolia.json" : `${networkName}.json`),
    "utf8",
  ),
) as { mockKRW: string | null };

if (!deployment.mockKRW) throw new Error("배포 기록에 mockKRW 주소가 없습니다.");

const token = await viem.getContractAt("MockKRW", deployment.mockKRW as `0x${string}`);

const before = await token.read.balanceOf([target as `0x${string}`]);
console.log(`보내는 지갑: ${sender.account.address}`);
console.log(`받는 지갑  : ${target}`);
console.log(`현재 잔액  : ${formatUnits(before, 6)} mKRW`);

const hash = await token.write.transfer([target as `0x${string}`, AMOUNT], { account: sender.account });
const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
if (receipt.status !== "success") throw new Error(`전송 실패: ${hash}`);

console.log(`\n전송 완료 ✓ ${hash}`);

// 공개 RPC 는 노드를 오가므로 방금 채굴된 블록을 지정해 읽으면 실패할 수 있다.
// 확인용 조회일 뿐이라 실패해도 전송 결과에는 영향이 없다.
try {
  const after = await token.read.balanceOf([target as `0x${string}`]);
  console.log(`받은 뒤 잔액: ${formatUnits(after, 6)} mKRW`);
} catch {
  console.log("잔액 조회는 실패했지만 전송은 성공했습니다. 잠시 뒤 다시 확인하세요.");
}
