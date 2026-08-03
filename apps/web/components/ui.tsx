"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  explorerAddress,
  formatMkrwWithUnit,
  shortAddress,
  toKoreanAmount,
  type StatusLabel,
} from "shared";

export function Badge({ label }: { label: StatusLabel }) {
  return (
    <span className="badge" data-tone={label.tone}>
      {label.text}
    </span>
  );
}

/** 명세서 19.4 — mKRW 수치와 만원 환산을 함께 보여준다 */
export function Amount({ value, size = "md" }: { value: bigint; size?: "md" | "lg" | "sm" }) {
  if (size === "lg") {
    return (
      <div className="stack stack-4">
        <div className="figure">{formatMkrwWithUnit(value)}</div>
        <div className="figure-sub">{toKoreanAmount(value)}</div>
      </div>
    );
  }
  if (size === "sm") {
    return (
      <span className="num" style={{ fontWeight: 600 }}>
        {formatMkrwWithUnit(value)}
      </span>
    );
  }
  return (
    <span className="num">
      <strong style={{ fontWeight: 700 }}>{formatMkrwWithUnit(value)}</strong>{" "}
      <span className="muted">{toKoreanAmount(value)}</span>
    </span>
  );
}

export function AddressChip({ address, label }: { address?: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  if (!address) return <span className="muted">-</span>;

  return (
    <span className="row" style={{ gap: 4, display: "inline-flex" }}>
      {label && <span className="muted">{label}</span>}
      <a className="mono link" href={explorerAddress(address)} target="_blank" rel="noreferrer">
        {shortAddress(address)}
      </a>
      <button
        type="button"
        className="copy-btn"
        aria-label="주소 복사"
        onClick={async () => {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </span>
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger" | "neutral";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="notice" data-tone={tone}>
      {title && <strong style={{ display: "block", marginBottom: 4 }}>{title}</strong>}
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h3 className="section-title">{title}</h3>
          <button type="button" className="copy-btn" onClick={onClose} aria-label="닫기">
            닫기
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * 설명문 안의 주소를 눌러서 열 수 있게 한다.
 * 파일 자체는 체인에 올리지 않으므로, 업체가 공유 링크를 남기면 고객이
 * 여기서 바로 증빙을 열어볼 수 있어야 한다.
 */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);

  return (
    <>
      {parts.map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a key={index} className="link" href={part} target="_blank" rel="noreferrer noopener">
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

export function Spinner({ dark = false }: { dark?: boolean }) {
  return <span className="spinner" data-dark={dark} aria-hidden />;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card-soft center stack stack-12" style={{ padding: "48px 24px" }}>
      <strong style={{ fontSize: 17 }}>{title}</strong>
      <p className="muted" style={{ maxWidth: 420, margin: "0 auto" }}>
        {description}
      </p>
      {action}
    </div>
  );
}

/** 테스트넷 MVP 임을 어느 화면에서나 분명히 한다 (명세서 11.2) */
export function TestnetBanner() {
  return (
    <Notice tone="warning">
      현재 <strong>GIWA Sepolia 테스트넷</strong> MVP 입니다. 화면의 mKRW 는 테스트용 토큰이며 실제 원화나 가치가 있는
      자산이 아닙니다.
    </Notice>
  );
}
