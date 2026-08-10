// 시작 지원금 지급 흐름 확인.
// 새 지갑을 즉석에서 만들어 서명하고, 실제로 가스와 토큰이 들어오는지 본다.
//
//   node scripts/check-starter-funds.mjs [주소]
//   주소를 생략하면 로컬 서버(http://localhost:3120)를 검사한다.

import { readFileSync } from "node:fs";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = process.argv[2] ?? "http://localhost:3120";
const CHAIN = 91342;

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const read = (n) => new RegExp(`^${n}\\s*=\\s*(.+)$`, "m").exec(env)?.[1]?.trim();

const client = createPublicClient({
  transport: http(read("NEXT_PUBLIC_GIWA_RPC_URL") ?? "https://sepolia-rpc.giwa.io"),
});

const buildMessage = (address, issuedAt) =>
  [
    "GIWA Trust Escrow",
    "",
    "시작 지원금 받기",
    `주소: ${address}`,
    `체인: ${CHAIN}`,
    `시각: ${issuedAt}`,
    "",
    "이 서명으로 가스비가 들지 않으며, 자금이 이동하지 않습니다.",
  ].join("\n");

async function request(account, overrides = {}) {
  const issuedAt = overrides.issuedAt ?? new Date().toISOString();
  const signature = await account.signMessage({ message: buildMessage(account.address, issuedAt) });
  const res = await fetch(`${BASE}/api/onboarding/fund`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: account.address, issuedAt, signature, ...overrides.body }),
  });
  return { status: res.status, ...(await res.json().catch(() => ({}))) };
}

const config = await (await fetch(`${BASE}/api/onboarding/fund`)).json();
console.log(`대상: ${BASE}`);
console.log(`기능 켜짐: ${config.enabled}\n`);

if (!config.enabled) {
  console.log("FAUCET_PRIVATE_KEY 가 설정되지 않았습니다.");
  process.exit(0);
}

// 1) 새 지갑이 지원금을 받는다
const fresh = privateKeyToAccount(generatePrivateKey());
console.log(`새 지갑: ${fresh.address}`);
const first = await request(fresh);
console.log(`  1차 요청: ${first.status} gas=${first.gasSent} token=${first.tokenSent}`);

if (first.status === 200) {
  await new Promise((r) => setTimeout(r, 4000));
  const eth = await client.getBalance({ address: fresh.address });
  const mockKrw = read("NEXT_PUBLIC_MOCK_KRW_ADDRESS");
  const token = mockKrw
    ? await client.readContract({
        address: mockKrw,
        abi: [
          { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
        ],
        functionName: "balanceOf",
        args: [fresh.address],
      })
    : 0n;
  console.log(`  받은 가스: ${formatEther(eth)} ETH`);
  console.log(`  받은 토큰: ${Number(formatUnits(token, 6)).toLocaleString("ko-KR")} mKRW`);
}

// 2) 같은 지갑이 또 요청하면 중복 지급되지 않아야 한다
const second = await request(fresh);
console.log(`  2차 요청(중복): ${second.status} gas=${second.gasSent} token=${second.tokenSent}`);

// 3) 남의 주소로 대신 요청 — 서명이 안 맞으므로 거부되어야 한다
const attacker = privateKeyToAccount(generatePrivateKey());
const victim = privateKeyToAccount(generatePrivateKey());
const issuedAt = new Date().toISOString();
const forged = await fetch(`${BASE}/api/onboarding/fund`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    address: victim.address,
    issuedAt,
    signature: await attacker.signMessage({ message: buildMessage(victim.address, issuedAt) }),
  }),
});
console.log(`  남의 주소로 요청: ${forged.status} ${(await forged.json().catch(() => ({}))).error ?? ""}`);

// 4) 오래된 서명은 거부되어야 한다
const stale = await request(privateKeyToAccount(generatePrivateKey()), {
  issuedAt: new Date(Date.now() - 3600e3).toISOString(),
});
console.log(`  만료된 요청: ${stale.status} ${stale.error ?? ""}`);
