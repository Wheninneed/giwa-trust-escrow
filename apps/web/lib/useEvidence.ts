"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { buildAccessMessage, type EvidenceAction } from "./evidenceMessage";

export interface EvidenceFile {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256Hash: string;
  uploadedBy: string;
  createdAt: string;
  url: string | null;
}

/** 파일 저장소가 켜져 있는지. 꺼져 있으면 업로드 UI 를 숨긴다. */
export function useEvidenceEnabled() {
  return useQuery({
    queryKey: ["evidence-config"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch("/api/evidence/config");
      const json = (await res.json()) as { enabled?: boolean };
      return Boolean(json.enabled);
    },
  });
}

/**
 * 증빙 파일에 접근할 때마다 지갑 서명을 받는다.
 * 가스비가 들지 않고 즉시 끝나며, 서버는 이 서명으로 "이 지갑이 계약 당사자인지"
 * 를 온체인에서 확인한다.
 */
export function useEvidenceSigner() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  return useCallback(
    async (action: EvidenceAction, agreementId: bigint, milestoneIndex: number) => {
      if (!address) throw new Error("지갑이 연결되어 있지 않습니다.");

      const issuedAt = new Date().toISOString();
      const message = buildAccessMessage({
        action,
        agreementId: agreementId.toString(),
        milestoneIndex,
        issuedAt,
      });

      const signature = await signMessageAsync({ message });

      return {
        agreementId: agreementId.toString(),
        milestoneIndex,
        address,
        issuedAt,
        signature,
      };
    },
    [address, signMessageAsync],
  );
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "요청을 처리하지 못했습니다.");
  return json as T;
}

/** 업체가 파일을 올린다. 저장소로 곧장 보내고 서버에는 기록만 남긴다. */
export async function uploadEvidence(params: {
  access: Awaited<ReturnType<ReturnType<typeof useEvidenceSigner>>>;
  file: File;
  sha256Hash: string;
}) {
  const { access, file, sha256Hash } = params;

  const { signedUrl, storagePath } = await postJson<{ signedUrl: string; storagePath: string }>(
    "/api/evidence/upload-url",
    { ...access, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
  );

  const upload = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type },
    body: file,
  });

  if (!upload.ok) throw new Error("파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");

  await postJson("/api/evidence/record", {
    ...access,
    storagePath,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    sha256Hash,
  });

  return storagePath;
}

/**
 * 계약 당사자에게 증빙 파일 목록과 짧은 수명의 열람 주소를 가져온다.
 * 사진은 이 주소로 바로 띄우고, 내려받기도 같은 주소를 쓴다.
 */
export function useEvidenceFiles(params: {
  agreementId?: bigint;
  milestoneIndex: number;
  enabled: boolean;
}) {
  const { agreementId, milestoneIndex, enabled } = params;
  const sign = useEvidenceSigner();
  const { address } = useAccount();

  return useQuery({
    queryKey: ["evidence", agreementId?.toString(), milestoneIndex, address],
    enabled: enabled && agreementId !== undefined && Boolean(address),
    staleTime: 4 * 60_000,
    retry: 0,
    queryFn: async (): Promise<EvidenceFile[]> => {
      const access = await sign("view", agreementId as bigint, milestoneIndex);
      const { files } = await postJson<{ files: EvidenceFile[] }>("/api/evidence/list", access);
      return files;
    },
  });
}
