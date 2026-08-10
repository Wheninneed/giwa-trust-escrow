import { keccak256, stringToHex, type Hex } from "viem";

export const ZERO_HASH = `0x${"00".repeat(32)}` as Hex;

/** 문자열 해시 — 계약 조건, 단계명, 사유문에 사용 */
export const hashText = (text: string): Hex => keccak256(stringToHex(text));

/**
 * 파일 SHA-256 을 브라우저 Web Crypto 로 계산한다.
 * 파일 원본은 어디에도 올리지 않고 해시만 온체인에 기록한다.
 */
export async function sha256Blob(blob: Blob): Promise<Hex> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = Array.from(new Uint8Array(digest));
  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export const sha256File = (file: File): Promise<Hex> => sha256Blob(file);

export const isZeroHash = (value?: string) => !value || value === ZERO_HASH;
