"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { sha256File } from "@/lib/hash";
import { Notice, Spinner } from "./ui";

/**
 * 증빙 파일의 SHA-256 을 브라우저에서 계산한다.
 * 파일 자체는 어디에도 업로드하지 않고 해시만 온체인에 기록한다.
 */
export interface EvidenceSelection {
  hash?: Hex;
  fileName?: string;
  file?: File;
}

export function EvidenceInput({
  value,
  onChange,
  storageEnabled,
}: {
  value: EvidenceSelection;
  onChange: (next: EvidenceSelection) => void;
  storageEnabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="stack stack-8">
      <label className="label" htmlFor="evidence-file">
        증빙 파일
      </label>

      <input
        id="evidence-file"
        type="file"
        className="input"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;

          if (file.size > 10 * 1024 * 1024) {
            setError("파일은 10MB 이하만 올릴 수 있습니다.");
            onChange({});
            return;
          }

          setBusy(true);
          setError(null);
          try {
            const hash = await sha256File(file);
            onChange({ hash, fileName: file.name, file });
          } catch {
            setError("파일을 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.");
            onChange({});
          } finally {
            setBusy(false);
          }
        }}
      />

      {busy && (
        <span className="row muted" style={{ gap: 6 }}>
          <Spinner dark /> 파일을 확인하는 중입니다…
        </span>
      )}

      {error && <span className="error-text">{error}</span>}

      {value.fileName && (
        <div className="card-soft">
          <span className="label">{value.fileName}</span>
        </div>
      )}

      {storageEnabled ? (
        <Notice tone="neutral">
          파일은 <strong>계약 당사자만 열람할 수 있는 비공개 저장소</strong>에 보관됩니다. 따로 보내지 않아도 고객이
          화면에서 바로 보고 내려받을 수 있습니다.
        </Notice>
      ) : (
        <Notice tone="warning">
          파일 저장소가 꺼져 있습니다. 고객이 확인할 수 있도록 아래 공유 링크를 함께 남겨 주세요.
        </Notice>
      )}
    </div>
  );
}
