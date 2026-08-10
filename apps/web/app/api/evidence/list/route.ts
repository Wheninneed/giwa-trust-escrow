import { NextResponse } from "next/server";
import { AccessError, authorize, parseAccessRequest } from "@/lib/server/evidenceAuth";
import { createViewUrl, listEvidence } from "@/lib/server/evidenceStore";

/**
 * 계약 당사자에게만 증빙 파일 목록과 짧은 수명의 열람 주소를 준다.
 * 버킷이 비공개이므로 이 경로를 거치지 않으면 파일을 열 수 없다.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const access = parseAccessRequest(body, "view");
    await authorize(access);

    const rows = await listEvidence(access.agreementId, access.milestoneIndex);

    const files = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        sha256Hash: row.sha256_hash,
        uploadedBy: row.uploaded_by_wallet,
        createdAt: row.created_at,
        url: await createViewUrl(row.storage_path),
      })),
    );

    return NextResponse.json({ files });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("evidence list 실패", error);
    return NextResponse.json({ error: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
