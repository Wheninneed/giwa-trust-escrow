import { NextResponse } from "next/server";
import { GIWA_SEPOLIA_ID } from "shared";
import { ESCROW_ADDRESS } from "@/lib/contracts";
import { AccessError, authorize, parseAccessRequest } from "@/lib/server/evidenceAuth";
import { EVIDENCE_BUCKET, evidenceDir, getStore } from "@/lib/server/evidenceStore";

/**
 * 업로드가 끝난 뒤 파일 정보를 기록한다.
 *
 * 브라우저가 알려준 경로를 그대로 믿지 않는다. 이 계약·단계의 폴더 안이어야
 * 하고, 저장소에 실제로 그 파일이 있어야 한다. 둘 다 확인한 뒤에만 기록한다.
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

    const storagePath = typeof body?.storagePath === "string" ? body.storagePath : "";
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : null;
    const sizeBytes = Number(body?.sizeBytes);
    const sha256Hash = typeof body?.sha256Hash === "string" ? body.sha256Hash.toLowerCase() : "";

    if (!/^0x[0-9a-f]{64}$/.test(sha256Hash)) {
      return NextResponse.json({ error: "파일 지문이 올바르지 않습니다." }, { status: 400 });
    }

    // 경로 위조 차단: 반드시 이 계약·단계의 폴더 안이어야 한다
    const dir = evidenceDir(access.agreementId, access.milestoneIndex);
    if (!storagePath.startsWith(`${dir}/`) || storagePath.includes("..")) {
      return NextResponse.json({ error: "잘못된 파일 경로입니다." }, { status: 400 });
    }

    // 실제로 올라간 파일인지 저장소에서 확인한다
    const objectName = storagePath.slice(dir.length + 1);
    const { data: found, error: listError } = await store.storage
      .from(EVIDENCE_BUCKET)
      .list(dir, { search: objectName, limit: 1 });

    if (listError || !found?.some((item) => item.name === objectName)) {
      return NextResponse.json({ error: "업로드된 파일을 찾지 못했습니다." }, { status: 400 });
    }

    const { error } = await store.from("evidence_files").insert({
      chain_id: GIWA_SEPOLIA_ID,
      contract_address: (ESCROW_ADDRESS ?? "").toLowerCase(),
      agreement_id: access.agreementId,
      milestone_index: access.milestoneIndex,
      uploaded_by_wallet: access.address.toLowerCase(),
      storage_path: storagePath,
      file_name: fileName.slice(0, 200),
      mime_type: mimeType,
      size_bytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      sha256_hash: sha256Hash,
    });

    if (error) {
      console.error("증빙 기록 실패", error);
      return NextResponse.json({ error: "파일 정보를 저장하지 못했습니다." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("record 실패", error);
    return NextResponse.json({ error: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
