import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { network } from "hardhat";
import { formatEther } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
const sharedRoot = resolve(here, "../../shared/src");

const { viem, networkName } = await network.connect();

const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

if (!deployer) {
  throw new Error(
    "배포 계정이 없습니다. .env 파일에 DEPLOYER_PRIVATE_KEY 를 넣었는지 확인하세요.",
  );
}

const chainId = await publicClient.getChainId();
const balance = await publicClient.getBalance({ address: deployer.account.address });

console.log(`네트워크   : ${networkName} (chainId ${chainId})`);
console.log(`배포 계정  : ${deployer.account.address}`);
console.log(`가스 잔액  : ${formatEther(balance)} ETH`);

if (balance === 0n) {
  throw new Error(
    "배포 계정에 가스가 없습니다. https://faucet.giwa.io 에서 테스트 ETH 를 받은 뒤 다시 실행하세요.",
  );
}

console.log("\nMockKRW 배포 중...");
const mockKRW = await viem.deployContract("MockKRW", [deployer.account.address]);
console.log(`  MockKRW  : ${mockKRW.address}`);

console.log("GiwaMilestoneEscrow 배포 중...");
const escrow = await viem.deployContract("GiwaMilestoneEscrow", [deployer.account.address]);
console.log(`  Escrow   : ${escrow.address}`);

const record = {
  chainId,
  network: networkName,
  deployedAt: new Date().toISOString(),
  deployer: deployer.account.address,
  mockKRW: mockKRW.address,
  escrow: escrow.address,
};

// 로컬 노드도 같은 chainId 를 쓰므로 네트워크 이름으로 파일을 나눈다.
// 그래야 로컬 배포가 테스트넷 배포 기록을 덮어쓰지 않는다.
const target = resolve(
  sharedRoot,
  "deployments",
  networkName === "giwaSepolia" ? "giwa-sepolia.json" : `${networkName}.json`,
);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");

console.log(`\n배포 기록 저장: ${target}`);
console.log("\n다음 값을 apps/web/.env.local 에 넣으세요:");
console.log(`NEXT_PUBLIC_MOCK_KRW_ADDRESS=${mockKRW.address}`);
console.log(`NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=${escrow.address}`);

if (chainId === 91342) {
  console.log("\n소스 검증:");
  console.log(`  npx hardhat verify --network giwaSepolia ${mockKRW.address} ${deployer.account.address}`);
  console.log(`  npx hardhat verify --network giwaSepolia ${escrow.address} ${deployer.account.address}`);
}
