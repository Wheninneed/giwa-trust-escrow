import Link from "next/link";
import { TestnetBanner } from "@/components/ui";

const VALUE_CARDS = [
  {
    title: "전체 금액 안전 예치",
    body: "고객이 계약 총액을 먼저 스마트컨트랙트에 맡깁니다. 업체는 대금이 실제로 있다는 사실을 확인하고 자재를 발주할 수 있습니다.",
  },
  {
    title: "단계별 작업 승인",
    body: "합의한 작업 단계가 끝날 때마다 고객이 증빙을 확인하고 승인합니다. 승인한 단계의 금액만 지급되고 나머지는 계속 잠겨 있습니다.",
  },
  {
    title: "추가 작업 기록",
    body: "공사 중 생기는 추가 작업과 추가금을 변경계약으로 남깁니다. 구두 합의 대신 양측이 승인한 기록이 남습니다.",
  },
  {
    title: "분쟁 시 지급 동결",
    body: "이견이 생기면 해당 단계의 금액이 즉시 동결됩니다. 사전에 정한 중재자가 업체 지급분과 고객 환불분을 나눕니다.",
  },
  {
    title: "하자보증금 관리",
    body: "마지막 금액은 하자보증금으로 일정 기간 별도로 잠급니다. 기간이 끝나야 업체에게 지급됩니다.",
  },
];

const FLOW = [
  { step: "1", title: "계약 만들기", body: "업체·중재자 지갑과 작업 단계, 단계별 금액을 정합니다." },
  { step: "2", title: "전액 예치", body: "고객이 총 계약금을 한 번에 예치합니다." },
  { step: "3", title: "증빙 제출", body: "업체가 단계별 작업 완료 증빙 파일의 해시를 기록합니다." },
  { step: "4", title: "승인과 지급", body: "고객이 확인하고 승인하면 그 단계 금액만 업체 지갑으로 갑니다." },
];

export default function LandingPage() {
  return (
    <div className="shell page">
      <div className="stack stack-32">
        <section className="stack stack-24" style={{ paddingTop: 24 }}>
          <div className="stack stack-16" style={{ maxWidth: 680 }}>
            <span className="badge" data-tone="info">
              GIWA Sepolia 테스트넷 MVP
            </span>
            <h1 className="hero-title">
              공사비는 안전하게 예치하고,
              <br />
              작업이 끝난 만큼만 지급하세요.
            </h1>
            <p className="lead">
              고객과 업체가 합의한 작업 단계를 GIWA에 기록하고, 완료된 단계의 대금만 순서대로 지급합니다. 인테리어
              공사에서 시작해 단계별 이행 확인이 필요한 모든 서비스 거래로 넓혀갑니다.
            </p>
          </div>

          <div className="row wrap">
            <Link href="/agreements/new" className="btn btn-primary btn-lg">
              새 계약 만들기
            </Link>
            <Link href="/agreements" className="btn btn-secondary btn-lg">
              내 계약 보기
            </Link>
            <Link href="/faucet" className="btn btn-ghost btn-lg">
              테스트 토큰 받기
            </Link>
          </div>

          <TestnetBanner />
        </section>

        <section className="stack stack-16">
          <h2 className="section-title">이 서비스가 막는 문제</h2>
          <div className="grid grid-3">
            {VALUE_CARDS.map((card) => (
              <article key={card.title} className="card stack stack-8">
                <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>{card.title}</strong>
                <p style={{ color: "var(--ink-2)", fontSize: 14.5 }}>{card.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="stack stack-16">
          <h2 className="section-title">진행 흐름</h2>
          <div className="grid grid-2">
            {FLOW.map((item) => (
              <div key={item.step} className="card-soft row" style={{ alignItems: "flex-start", gap: 14 }}>
                <span className="tl-dot" data-tone="info">
                  {item.step}
                </span>
                <div className="stack stack-4">
                  <strong>{item.title}</strong>
                  <span className="muted">{item.body}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card-brand stack stack-12">
          <h2 className="section-title">자금 보관 방식</h2>
          <p style={{ fontSize: 14.5, color: "var(--brand-ink)" }}>
            <strong>현재 MVP</strong> — GIWA Sepolia 테스트넷의 스마트컨트랙트에 테스트용 mKRW 를 예치합니다. 실제
            가치와 이자가 없습니다.
          </p>
          <p style={{ fontSize: 14.5, color: "var(--brand-ink)" }}>
            <strong>실제 서비스 1단계</strong> — 등록된 은행·PG·에스크로 파트너의 분리계좌에 원화를 예치하고, GIWA 는
            계약·승인·지급 조건을 관리합니다.
          </p>
          <p style={{ fontSize: 14.5, color: "var(--brand-ink)" }}>
            <strong>향후</strong> — 규제에 적합한 원화 스테이블코인 또는 토큰화 예금과 직접 연결합니다.
          </p>
          <p className="muted" style={{ fontSize: 13 }}>
            예치금 운용과 이자 배분 방식은 금융기관 협의, 규제 검토, 사용자 인터뷰를 거쳐 결정할 예정입니다.
          </p>
        </section>
      </div>
    </div>
  );
}
