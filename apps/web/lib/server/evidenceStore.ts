import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GIWA_SEPOLIA_ID } from "shared";
import { ESCROW_ADDRESS } from "@/lib/contracts";

/**
 * 증빙 파일 저장소.
 *
 * service_role 키는 이 파일에서만 읽고, 브라우저로는 절대 나가지 않는다.
 * 버킷은 비공개이며, 열람은 짧은 수명의 서명된 URL 로만 가능하다.
 */

export const EVIDENCE_BUCKET = "evidence";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

/** 열람용 URL 수명. 링크가 새더라도 오래 쓰이지 못하게 짧게 둔다. */
const SIGNED_URL_TTL_SECONDS = 300;

let cached: SupabaseClient | null = null;

export function getStore(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  cached ??= createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export const isStoreConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * 파일이 놓일 폴더. 계약·단계별로 나눠 다른 계약의 파일에 손댈 수 없게 한다.
 * 컨트랙트를 재배포해도 기록이 섞이지 않도록 체인과 컨트랙트 주소를 포함한다.
 */
export function evidenceDir(agreementId: string, milestoneIndex: number) {
  return `${GIWA_SEPOLIA_ID}/${(ESCROW_ADDRESS ?? "unknown").toLowerCase()}/${agreementId}/${milestoneIndex}`;
}

/** 파일명에서 경로 조작에 쓰일 수 있는 문자를 걷어낸다. */
export function safeExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName);
  return match ? `.${match[1].toLowerCase()}` : "";
}

export interface EvidenceRow {
  id: string;
  milestone_index: number;
  uploaded_by_wallet: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  sha256_hash: string;
  created_at: string;
}

export async function listEvidence(agreementId: string, milestoneIndex?: number) {
  const store = getStore();
  if (!store) return [];

  let query = store
    .from("evidence_files")
    .select("*")
    .eq("chain_id", GIWA_SEPOLIA_ID)
    .eq("contract_address", (ESCROW_ADDRESS ?? "").toLowerCase())
    .eq("agreement_id", agreementId)
    .order("created_at", { ascending: false });

  if (milestoneIndex !== undefined) query = query.eq("milestone_index", milestoneIndex);

  const { data, error } = await query;
  if (error) throw new Error(`증빙 목록을 읽지 못했습니다: ${error.message}`);

  return (data ?? []) as EvidenceRow[];
}

export async function createViewUrl(storagePath: string): Promise<string | null> {
  const store = getStore();
  if (!store) return null;

  const { data, error } = await store.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) return null;
  return data?.signedUrl ?? null;
}
