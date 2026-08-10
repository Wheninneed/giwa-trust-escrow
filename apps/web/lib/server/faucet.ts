import "server-only";

import { createPublicClient, createWalletClient, http, parseUnits, verifyMessage, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giwaSepolia } from "shared";
import { MOCK_KRW_ADDRESS, mockKrwAbi } from "@/lib/contracts";

/**
 * 신규 사용자에게 가스비와 테스트 토큰을 자동으로 넣어준다.
 *
 * 구글로 로그인하면 지갑은 생기지만 GIWA 테스트 ETH 가 0이라 아무것도 못 한다.
 * "faucet 에서 받아오세요" 는 지갑 설치보다 더 막막한 요구라, 서버가 대신 넣는다.
 *
 * GIWA 에는 아직 ERC-4337 번들러·페이마스터가 없어 진짜 가스 대납은 못 한다.
 * 테스트넷이므로 소액을 직접 보내는 방식으로 같은 경험을 만든다.
 */

/** 가스비. GIWA 는 트랜잭션당 0.000003 ETH 수준이라 100회 이상 쓸 수 있는 양. */
export const GAS_GRANT_WEI = 300_000_000_000_000n; // 0.0003 ETH

/** 계약 하나를 만들어 볼 수 있는 양 */
export const TOKEN_GRANT = parseUnits("100000000", 6); // 1억 mKRW

/** 이미 이만큼 갖고 있으면 지원하지 않는다 */
const GAS_ENOUGH_WEI = 100_000_000_000_000n; // 0.0001 ETH

export const isFaucetConfigured = () => Boolean(process.env.FAUCET_PRIVATE_KEY);

const publicClient = createPublicClient({
  chain: giwaSepolia,
  transport: http(process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io", {
    timeout: 20_000,
    retryCount: 2,
  }),
});

function getFaucetAccount() {
  const key = process.env.FAUCET_PRIVATE_KEY;
  if (!key) return null;
  return privateKeyToAccount(key as `0x${string}`);
}

export class FaucetError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function buildFaucetMessage(address: string, issuedAt: string) {
  return [
    "GIWA Trust Escrow",
    "",
    "시작 지원금 받기",
    `주소: ${address}`,
    `체인: ${giwaSepolia.id}`,
    `시각: ${issuedAt}`,
    "",
    "이 서명으로 가스비가 들지 않으며, 자금이 이동하지 않습니다.",
  ].join("\n");
}

export interface FaucetResult {
  gasSent: boolean;
  tokenSent: boolean;
  gasTx?: string;
  tokenTx?: string;
}

/**
 * 지급 요청을 한 줄로 세운다.
 * 같은 지갑에서 트랜잭션 두 건을 보내는데, 동시에 처리하면 nonce 가 겹쳐
 * "replacement transaction underpriced" 로 거부된다.
 */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

export async function grantStarterFunds(params: {
  address: Address;
  issuedAt: string;
  signature: `0x${string}`;
}): Promise<FaucetResult> {
  const account = getFaucetAccount();
  if (!account) throw new FaucetError(503, "시작 지원금 기능이 꺼져 있습니다.");

  const issued = Date.parse(params.issuedAt);
  if (Number.isNaN(issued) || Math.abs(Date.now() - issued) > 10 * 60 * 1000) {
    throw new FaucetError(401, "요청이 만료되었습니다. 다시 시도해 주세요.");
  }

  // 지갑을 실제로 가진 사람인지 확인한다. 남의 주소로 대신 요청하지 못하게.
  let valid = false;
  try {
    valid = await verifyMessage({
      address: params.address,
      message: buildFaucetMessage(params.address, params.issuedAt),
      signature: params.signature,
    });
  } catch {
    valid = false;
  }
  if (!valid) throw new FaucetError(401, "서명을 확인하지 못했습니다.");

  const walletClient = createWalletClient({
    account,
    chain: giwaSepolia,
    transport: http(process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io"),
  });

  return enqueue(async () => {
    const result: FaucetResult = { gasSent: false, tokenSent: false };

    // 이미 쓸 만큼 갖고 있으면 보내지 않는다. 반복 호출로 퍼내는 것도 이걸로 막는다.
    const balance = await publicClient.getBalance({ address: params.address });
    const needsGas = balance < GAS_ENOUGH_WEI;

    let needsToken = false;
    if (MOCK_KRW_ADDRESS) {
      const tokenBalance = (await publicClient.readContract({
        address: MOCK_KRW_ADDRESS,
        abi: mockKrwAbi,
        functionName: "balanceOf",
        args: [params.address],
      })) as bigint;
      needsToken = tokenBalance === 0n;
    }

    if (!needsGas && !needsToken) return result;

    if (needsGas) {
      const reserve = await publicClient.getBalance({ address: account.address });
      if (reserve < GAS_GRANT_WEI * 2n) {
        throw new FaucetError(503, "지원금 잔액이 부족합니다. 잠시 후 다시 시도해 주세요.");
      }
    }

    // 두 건을 연달아 보내므로 nonce 를 직접 매긴다.
    // 자동으로 두면 둘 다 같은 값을 받아 두 번째가 거부된다.
    let nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    });

    if (needsGas) {
      result.gasTx = await walletClient.sendTransaction({
        to: params.address,
        value: GAS_GRANT_WEI,
        nonce: nonce++,
      });
      result.gasSent = true;
    }

    if (needsToken && MOCK_KRW_ADDRESS) {
      result.tokenTx = await walletClient.writeContract({
        address: MOCK_KRW_ADDRESS,
        abi: mockKrwAbi,
        functionName: "transfer",
        args: [params.address, TOKEN_GRANT],
        nonce: nonce++,
      });
      result.tokenSent = true;
    }

    return result;
  });
}
