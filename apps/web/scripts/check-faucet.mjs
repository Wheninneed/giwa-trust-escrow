// 시작 지원금 지갑 상태 확인.
// 개인키는 이 프로세스 안에서만 쓰고 주소와 잔액만 출력한다.

import { readFileSync } from "node:fs";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const read = (n) => new RegExp(`^${n}\\s*=\\s*(.+)$`, "m").exec(env)?.[1]?.trim();

const key = read("FAUCET_PRIVATE_KEY");
if (!key) {
  console.log("❌ .env.local 에 FAUCET_PRIVATE_KEY 가 없습니다.");
  process.exit(1);
}
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.log("❌ FAUCET_PRIVATE_KEY 형식이 올바르지 않습니다. 0x 로 시작하는 64자리여야 합니다.");
  process.exit(1);
}

const account = privateKeyToAccount(key);
const mockKrw = read("NEXT_PUBLIC_MOCK_KRW_ADDRESS");

const client = createPublicClient({
  transport: http(read("NEXT_PUBLIC_GIWA_RPC_URL") ?? "https://sepolia-rpc.giwa.io"),
});

console.log(`지원금 지갑 주소: ${account.address}`);

const eth = await client.getBalance({ address: account.address });
console.log(`가스(ETH): ${formatEther(eth)}`);
if (eth === 0n) console.log("   → https://faucet.giwa.io 에서 위 주소로 테스트 ETH 를 받으세요.");

if (mockKrw) {
  const balance = await client.readContract({
    address: mockKrw,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "a", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [account.address],
  });
  console.log(`mKRW: ${Number(formatUnits(balance, 6)).toLocaleString("ko-KR")}`);
  if (balance === 0n) console.log("   → 배포 지갑에서 mKRW 를 보내야 사용자에게 나눠줄 수 있습니다.");
}

// 몇 명에게 나눠줄 수 있는지
const GAS_GRANT = 300_000_000_000_000n;
console.log(`\n지금 잔액으로 약 ${eth / GAS_GRANT}명에게 가스비를 나눠줄 수 있습니다.`);
