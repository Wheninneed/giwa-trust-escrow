"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { sha256File } from "@/lib/hash";
import { Notice, Spinner } from "./ui";

/**
 * 증빙 파일의 SHA-256 을 브라우저에서 계산한다.
 * 파일 자체는 어디에도 업로드하지 않고 해시만 온체인에 기록한다.
 */
export function EvidenceInput({
  value,
  onChange,
}: {
  value: { hash?: Hex; fileName?: string };
  onChange: (next: { hash?: Hex; fileName?: string }) => void;
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
        accept="image/*,application/pdf"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;

          setBusy(true);
          setError(null);
          try {
            const hash = await sha256File(file);
            onChange({ hash, fileName: file.name });
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
          <Spinner dark /> 파일 해시를 계산하는 중입니다…
        </span>
      )}

      {error && <span className="error-text">{error}</span>}

      {value.hash && (
        <div className="card-soft stack stack-4">
          <span className="label">{value.fileName}</span>
          <code className="mono" style={{ wordBreak: "break-all", color: "var(--ink-2)" }}>
            {value.hash}
          </code>
        </div>
      )}

      <Notice tone="neutral">
        파일은 업로드되지 않습니다. <strong>파일 지문(SHA-256)만</strong> GIWA에 기록되며, 나중에 같은 파일인지
        확인하는 용도로 쓰입니다. 원본은 직접 보관하고 상대방에게 전달하세요.
      </Notice>
    </div>
  );
}
