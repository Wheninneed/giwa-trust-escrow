import { NextResponse } from "next/server";
import type { Address } from "viem";
import { FaucetError, grantStarterFunds, isFaucetConfigured } from "@/lib/server/faucet";

export async function GET() {
  return NextResponse.json({ enabled: isFaucetConfigured() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const address = typeof body?.address === "string" ? body.address : "";
    const signature = typeof body?.signature === "string" ? body.signature : "";
    const issuedAt = typeof body?.issuedAt === "string" ? body.issuedAt : "";

    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: "지갑 주소가 올바르지 않습니다." }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]+$/.test(signature)) {
      return NextResponse.json({ error: "서명 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const result = await grantStarterFunds({
      address: address as Address,
      issuedAt,
      signature: signature as `0x${string}`,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof FaucetError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("시작 지원금 지급 실패", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
