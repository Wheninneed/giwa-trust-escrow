"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { sha256File } from "@/lib/hash";
import { Spinner } from "./ui";

type Result = { ok: boolean; fileName: string; hash: Hex } | null;

/**
 * 업체가 보낸 파일이 온체인에 기록된 그 파일이 맞는지 대조한다.
 *
 * 파일 자체는 체인에 올리지 않으므로(개인정보·용량 문제) 고객은 파일을
 * 카카오톡·메일 등으로 따로 받는다. 그 파일이 중간에 바뀌지 않았는지는
 * 여기서 확인한다. 해시가 하는 일이 원래 이것이다.
 */
export function EvidenceVerifier({ evidenceHash }: { evidenceHash: Hex }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card-soft stack stack-8">
      <span className="label">받은 파일이 맞는지 확인</span>
      <p className="hint" style={{ margin: 0 }}>
        업체에게 받은 파일을 넣으면 온체인에 기록된 지문과 대조합니다. 파일은 업로드되지 않고 브라우저 안에서만
        계산합니다.
      </p>

      <input
        type="file"
        className="input"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;

          setBusy(true);
          setError(null);
          setResult(null);
          try {
            const hash = await sha256File(file);
            setResult({ ok: hash.toLowerCase() === evidenceHash.toLowerCase(), fileName: file.name, hash });
          } catch {
            setError("파일을 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.");
          } finally {
            setBusy(false);
          }
        }}
      />

      {busy && (
        <span className="row muted" style={{ gap: 6 }}>
          <Spinner dark /> 대조하는 중입니다…
        </span>
      )}

      {error && <span className="error-text">{error}</span>}

      {result && (
        <div className="notice" data-tone={result.ok ? "info" : "danger"}>
          {result.ok ? (
            <>
              <strong>제출된 파일과 일치합니다.</strong>
              <br />
              {result.fileName} — 업체가 제출한 그 파일이 맞습니다.
            </>
          ) : (
            <>
              <strong>제출된 파일과 다릅니다.</strong>
              <br />
              {result.fileName} 의 지문이 온체인 기록과 맞지 않습니다. 파일이 바뀌었거나 다른 파일입니다.
            </>
          )}
        </div>
      )}
    </div>
  );
}
