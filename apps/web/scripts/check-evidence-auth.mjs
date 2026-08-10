// 증빙 접근 권한 판정 테스트.
// 실제 지갑 키로 서명해 API 가 역할을 정확히 가르는지 확인한다.
// 키는 이 프로세스 안에서만 쓰고 출력하지 않는다.

import { readFileSync } from "node:fs";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE = "http://localhost:3120";
const ESCROW = "0x649050b15a61f3690c8a07857203e6f1ec72c3a5";
const CHAIN = 91342;

const env = readFileSync(
  "C:/Users/crush/.claude/workspace/giwa-trust-escrow/packages/contracts/.env",
  "utf8",
);
const key = /DEPLOYER_PRIVATE_KEY\s*=\s*(0x[0-9a-fA-F]{64})/.exec(env)?.[1];
if (!key) throw new Error("DEPLOYER_PRIVATE_KEY 를 찾지 못했습니다.");

const client = privateKeyToAccount(key);
const stranger = privateKeyToAccount(generatePrivateKey());

function buildMessage({ action, agreementId, milestoneIndex, issuedAt }) {
  const actionLabel = action === "upload" ? "증빙 파일 올리기" : "증빙 파일 열기";
  return [
    "GIWA Trust Escrow",
    "",
    `요청: ${actionLabel}`,
    `계약: #${agreementId}`,
    `단계: ${milestoneIndex + 1}`,
    `컨트랙트: ${ESCROW}`,
    `체인: ${CHAIN}`,
    `시각: ${issuedAt}`,
    "",
    "이 서명으로 가스비가 들지 않으며, 자금이 이동하지 않습니다.",
  ].join("\n");
}

async function call(endpoint, account, action, overrides = {}) {
  const issuedAt = new Date().toISOString();
  const agreementId = overrides.agreementId ?? "0";
  const milestoneIndex = overrides.milestoneIndex ?? 0;

  const message = buildMessage({ action, agreementId, milestoneIndex, issuedAt });
  const signature = await account.signMessage({ message });

  const res = await fetch(`${BASE}/api/evidence/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      agreementId,
      milestoneIndex,
      address: account.address,
      issuedAt,
      signature,
      ...overrides.body,
    }),
  });

  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

const results = {};

// 1. 고객이 열람 → 허용되어야 함
const view = await call("list", client, "view");
results["고객 열람"] = { status: view.status, files: view.files?.length ?? view.error };

// 2. 계약과 무관한 지갑이 열람 → 403
const strangerView = await call("list", stranger, "view");
results["제3자 열람"] = { status: strangerView.status, error: strangerView.error };

// 3. 고객이 업로드 시도 → 업체만 가능하므로 403
const clientUpload = await call("upload-url", client, "upload", {
  body: { fileName: "test.png", mimeType: "image/png", sizeBytes: 1234 },
});
results["고객이 업로드 시도"] = { status: clientUpload.status, error: clientUpload.error };

// 4. 서명은 열람용인데 업로드 엔드포인트에 사용 → 문구가 달라 401
const issuedAt = new Date().toISOString();
const viewMessage = buildMessage({ action: "view", agreementId: "0", milestoneIndex: 0, issuedAt });
const viewSig = await client.signMessage({ message: viewMessage });
const crossRes = await fetch(`${BASE}/api/evidence/upload-url`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    agreementId: "0",
    milestoneIndex: 0,
    address: client.address,
    issuedAt,
    signature: viewSig,
    fileName: "a.png",
    mimeType: "image/png",
    sizeBytes: 100,
  }),
});
results["열람 서명을 업로드에 재사용"] = {
  status: crossRes.status,
  error: (await crossRes.json().catch(() => ({}))).error,
};

// 5. 다른 단계의 서명을 이 단계에 재사용 → 401
const otherStepMsg = buildMessage({ action: "view", agreementId: "0", milestoneIndex: 3, issuedAt });
const otherStepSig = await client.signMessage({ message: otherStepMsg });
const stepRes = await fetch(`${BASE}/api/evidence/list`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    agreementId: "0",
    milestoneIndex: 0,
    address: client.address,
    issuedAt,
    signature: otherStepSig,
  }),
});
results["다른 단계 서명 재사용"] = {
  status: stepRes.status,
  error: (await stepRes.json().catch(() => ({}))).error,
};

// 6. 존재하지 않는 계약
const ghost = await call("list", client, "view", { agreementId: "999999" });
results["없는 계약 조회"] = { status: ghost.status, error: ghost.error };

console.log(JSON.stringify(results, null, 2));
