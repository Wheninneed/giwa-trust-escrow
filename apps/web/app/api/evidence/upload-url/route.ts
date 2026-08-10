import { NextResponse } from "next/server";
import { AccessError, authorize, parseAccessRequest } from "@/lib/server/evidenceAuth";
import {
  ALLOWED_MIME,
  EVIDENCE_BUCKET,
  MAX_FILE_BYTES,
  evidenceDir,
  getStore,
  safeExtension,
} from "@/lib/server/evidenceStore";

/**
 * 업체가 증빙 파일을 올릴 수 있는 일회용 주소를 발급한다.
 *
 * 파일 본문은 이 서버를 거치지 않고 저장소로 곧장 간다. 서버는 "이 지갑이
 * 이 계약의 업체가 맞는지" 만 확인하고 경로를 정한다. 경로를 브라우저가
 * 정하게 두면 다른 계약의 폴더에 쓸 수 있으므로 서버에서만 만든다.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const access = parseAccessRequest(body, "upload");
    await authorize(access);

    const store = getStore();
    if (!store) {
      return NextResponse.json({ error: "파일 저장소가 설정되지 않았습니다." }, { status: 503 });
    }

    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    const sizeBytes = Number(body?.sizeBytes);

    if (!fileName) {
      return NextResponse.json({ error: "파일 이름이 없습니다." }, { status: 400 });
    }
    if (!ALLOWED_MIME.includes(mimeType)) {
      return NextResponse.json(
        { error: "사진(JPG·PNG·WEBP·HEIC) 또는 PDF 만 올릴 수 있습니다." },
        { status: 400 },
      );
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "파일은 10MB 이하만 올릴 수 있습니다." }, { status: 400 });
    }

    const dir = evidenceDir(access.agreementId, access.milestoneIndex);
    const storagePath = `${dir}/${crypto.randomUUID()}${safeExtension(fileName)}`;

    const { data, error } = await store.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(storagePath);

    if (error || !data) {
      return NextResponse.json({ error: "업로드 주소를 만들지 못했습니다." }, { status: 502 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl, storagePath });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("upload-url 실패", error);
    return NextResponse.json({ error: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
