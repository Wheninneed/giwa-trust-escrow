import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header, MobileNav } from "@/components/Header";
import { StarterFunds } from "@/components/StarterFunds";

export const metadata: Metadata = {
  title: "GIWA Trust Escrow — 단계별 지급 에스크로",
  description:
    "공사비는 안전하게 예치하고, 작업이 끝난 만큼만 지급하세요. GIWA 기반 마일스톤 에스크로 (테스트넷 MVP).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>
          <Header />
          <div className="shell" style={{ paddingTop: 12 }}>
            <StarterFunds />
          </div>
          <main>{children}</main>
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
