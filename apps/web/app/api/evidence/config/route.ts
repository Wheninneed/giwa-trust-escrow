import { NextResponse } from "next/server";
import { isStoreConfigured } from "@/lib/server/evidenceStore";

/**
 * 파일 저장소가 켜져 있는지 알려준다.
 * 꺼져 있으면 화면은 업로드 대신 공유 링크 방식으로 안내한다.
 */
export async function GET() {
  return NextResponse.json({ enabled: isStoreConfigured() });
}
