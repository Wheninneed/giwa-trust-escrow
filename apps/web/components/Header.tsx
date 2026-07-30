"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const LINKS = [
  { href: "/agreements", label: "내 계약" },
  { href: "/agreements/new", label: "계약 만들기" },
  { href: "/faucet", label: "테스트 토큰" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="header">
      <div className="shell header-inner">
        <Link href="/" className="logo">
          <span className="logo-mark">기</span>
          <span>GIWA Trust Escrow</span>
        </Link>

        <div className="row" style={{ gap: 8 }}>
          <nav className="nav hide-sm">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} data-active={pathname === link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

/** 모바일에서는 하단 이동 바로 대체한다 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="nav"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(8px)",
        borderTop: "1px solid var(--line)",
        padding: "8px 12px calc(8px + env(safe-area-inset-bottom))",
        justifyContent: "space-around",
        zIndex: 40,
      }}
      data-mobile-nav
    >
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} data-active={pathname === link.href} style={{ fontSize: 14 }}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
