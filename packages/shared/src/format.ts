import { formatUnits, parseUnits } from "viem";

export const MKRW_DECIMALS = 6;

/** 1,000,000 형태의 천 단위 콤마 표기 */
export function formatMkrw(value: bigint): string {
  const whole = value / 10n ** BigInt(MKRW_DECIMALS);
  return whole.toLocaleString("ko-KR");
}

export const formatMkrwWithUnit = (value: bigint) => `${formatMkrw(value)} mKRW`;

export const parseMkrw = (value: string) => parseUnits(value.replace(/,/g, "") || "0", MKRW_DECIMALS);

export const toNumber = (value: bigint) => Number(formatUnits(value, MKRW_DECIMALS));

/**
 * 국내 사용자가 금액 크기를 직관적으로 읽도록 만 단위로 환산한다.
 * 명세서 19장: "50,000,000 mKRW" 와 "5,000만원" 을 함께 표시한다.
 */
export function toKoreanAmount(value: bigint): string {
  const won = value / 10n ** BigInt(MKRW_DECIMALS);

  if (won >= 100_000_000n) {
    const eok = won / 100_000_000n;
    const man = (won % 100_000_000n) / 10_000n;
    return man === 0n
      ? `${eok.toLocaleString("ko-KR")}억원`
      : `${eok.toLocaleString("ko-KR")}억 ${man.toLocaleString("ko-KR")}만원`;
  }

  if (won >= 10_000n) {
    const man = won / 10_000n;
    const rest = won % 10_000n;
    return rest === 0n
      ? `${man.toLocaleString("ko-KR")}만원`
      : `${man.toLocaleString("ko-KR")}만 ${rest.toLocaleString("ko-KR")}원`;
  }

  return `${won.toLocaleString("ko-KR")}원`;
}

/** 지갑 주소는 앞 6자리·뒤 4자리만 보여준다 (명세서 19장) */
export function shortAddress(address?: string): string {
  if (!address || address.length < 12) return address ?? "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDate(timestamp: bigint | number): string {
  const ms = Number(timestamp) * 1000;
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

export function formatDateTime(timestamp: bigint | number): string {
  const ms = Number(timestamp) * 1000;
  if (!ms) return "-";
  return new Date(ms).toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 남은 시간을 "3일 4시간" 처럼 표기한다. 이미 지났으면 null */
export function timeUntil(timestamp: bigint | number): string | null {
  const seconds = Number(timestamp) - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return null;

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

export const toDateInput = (date: Date) => date.toISOString().slice(0, 10);

export const dateInputToTimestamp = (value: string) => BigInt(Math.floor(new Date(`${value}T12:00:00`).getTime() / 1000));
