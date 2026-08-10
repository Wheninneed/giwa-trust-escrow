"use client";

import { useState } from "react";
import { formatDateTime, toKoreanError } from "shared";
import { useEvidenceFiles, type EvidenceFile } from "@/lib/useEvidence";
import { Spinner } from "./ui";

/**
 * 업체가 올린 증빙을 계약 당사자에게 보여준다.
 * 고객은 사진을 보거나 내려받아 확인한 뒤 직접 승인 여부를 판단한다.
 */
export function EvidenceGallery({
  agreementId,
  milestoneIndex,
}: {
  agreementId: bigint;
  milestoneIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const { data: files, isFetching, error } = useEvidenceFiles({
    agreementId,
    milestoneIndex,
    enabled: open,
  });

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        증빙 파일 보기
      </button>
    );
  }

  if (isFetching) {
    return (
      <span className="row muted" style={{ gap: 6 }}>
        <Spinner dark /> 파일을 불러오는 중입니다…
      </span>
    );
  }

  if (error) {
    return (
      <div className="notice" data-tone="warning">
        {toKoreanError(error)}
        <button
          type="button"
          className="btn-quiet"
          style={{ display: "block", marginTop: 4 }}
          onClick={() => setOpen(false)}
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (!files || files.length === 0) {
    return <span className="muted">올라온 증빙 파일이 없습니다.</span>;
  }

  return (
    <div className="stack stack-12">
      {files.map((file, index) => (
        <EvidenceCard key={file.id} file={file} isLatest={index === 0} />
      ))}
    </div>
  );
}

function EvidenceCard({ file, isLatest }: { file: EvidenceFile; isLatest: boolean }) {
  const isImage = (file.mimeType ?? "").startsWith("image/");

  return (
    <div className="stack stack-8">
      {isImage && file.url && (
        // next/image 를 쓰지 않는다. 남이 올린 이미지를 서버 최적화 경로로
        // 통과시키면 이미지 처리 라이브러리의 취약점에 노출된다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={file.url}
          alt={file.fileName}
          style={{ width: "100%", borderRadius: 10, border: "1px solid var(--line)", display: "block" }}
        />
      )}

      <div className="row-between wrap" style={{ gap: 8 }}>
        <span style={{ fontWeight: 600, wordBreak: "break-all" }}>{file.fileName}</span>
        {!isLatest && (
          <span className="badge" data-tone="neutral">
            이전 제출본
          </span>
        )}
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        <span className="muted">{formatDateTime(Math.floor(new Date(file.createdAt).getTime() / 1000))}</span>
        {file.sizeBytes && <span className="muted">{Math.round(file.sizeBytes / 1024).toLocaleString()} KB</span>}
        {file.url && (
          <a className="link" href={file.url} target="_blank" rel="noreferrer" download={file.fileName}>
            내려받기
          </a>
        )}
      </div>
    </div>
  );
}
