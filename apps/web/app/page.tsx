import Link from "next/link";
import { TestnetBanner } from "@/components/ui";

const RISKS = [
  {
    mode: "선불",
    title: "구매자가 위험을 부담합니다",
    body: "결과물이 계약 내용과 달라도 대금은 이미 넘어간 뒤입니다. 시정을 요구할 수단이 마땅치 않고, 환불과 보상 협의에서 불리한 위치에 놓입니다.",
  },
  {
    mode: "후불",
    title: "공급자가 위험을 부담합니다",
    body: "자재 구입과 인건비 등 착수 비용을 자체 자금으로 먼저 집행해야 합니다. 약속된 대금이 지급되지 않으면 공급자는 손실을 그대로 떠안게 됩니다.",
  },
];

const USE_CASES = [
  {
    title: "서비스 거래",
    examples: "인테리어, 개발 외주, 영상 제작",
    detail: "공정 단위로 완료를 확인하고 해당 단계 대금만 지급",
    ready: true,
  },
  {
    title: "물품 거래",
    examples: "중고 거래, B2B 납품",
    detail: "대금이 예치된 상태에서 발송하고, 수령 확인 후 지급",
    ready: true,
  },
  {
    title: "정기 지급",
    examples: "성과급 분할, 토큰 베스팅",
    detail: "약정한 일자가 도래하면 수령 측이 직접 수령",
    ready: false,
  },
];

const FLOW_STEPS = ["전액 예치", "조건 충족", "해당 금액 지급", "이견 시 지급 동결"];

const FEATURES = [
  {
    title: "전체 금액 안전 예치",
    body: "구매자가 총액을 먼저 컨트랙트에 맡깁니다. 공급자는 대금이 실제로 확보된 것을 확인하고 착수할 수 있습니다.",
  },
  {
    title: "단계별 완료 승인",
    body: "합의한 단계가 끝날 때마다 구매자가 증빙을 확인하고 승인합니다. 승인한 단계의 금액만 지급되고 나머지는 계속 잠겨 있습니다.",
  },
  {
    title: "추가 작업 기록",
    body: "진행 중 생기는 추가 작업과 추가금을 변경계약으로 남깁니다. 구두 합의 대신 양측이 승인한 기록이 남습니다.",
  },
  {
    title: "분쟁 시 지급 동결",
    body: "이견이 생기면 해당 단계의 금액이 즉시 동결됩니다. 사전에 정한 중재자가 공급자 지급분과 구매자 환불분을 나눕니다.",
  },
  {
    title: "하자보증금 관리",
    body: "마지막 금액은 하자보증금으로 일정 기간 별도로 잠급니다. 기간이 끝나야 공급자에게 지급됩니다.",
  },
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
              대금은 먼저 안전하게 맡기고,
              <br />
              약속이 지켜진 만큼만 지급하세요.
            </h1>
            <p className="lead">
              구매자와 공급자가 합의한 조건을 GIWA에 기록하고, 충족된 단계의 대금만 순서대로 지급합니다. 인테리어
              공사에서 시작해 단계로 나눌 수 있는 모든 거래로 넓혀갑니다.
            </p>
          </div>

          <div className="row wrap">
            <Link href="/agreements/new" className="btn btn-primary btn-lg">
              새 계약 만들기
            </Link>
            <Link href="/agreements" className="btn btn-secondary btn-lg">
              내 계약 보기
            </Link>
          </div>

          <TestnetBanner />
        </section>

        <section className="stack stack-16">
          <div className="stack stack-8">
            <span className="label">해결하는 문제</span>
            <h2 className="page-title">선불과 후불, 어느 쪽도 안전하지 않습니다</h2>
            <p className="lead">
              대금을 먼저 지급하면 구매자가, 나중에 지급하면 공급자가 위험을 떠안습니다. 지금까지는 둘 중 하나를 고르는
              수밖에 없었습니다.
            </p>
          </div>

          <div className="grid grid-2">
            {RISKS.map((risk) => (
              <article key={risk.mode} className="card stack stack-8">
                <span className="badge" data-tone="danger" style={{ alignSelf: "flex-start" }}>
                  {risk.mode}
                </span>
                <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>{risk.title}</strong>
                <p style={{ color: "var(--ink-2)", fontSize: 14.5 }}>{risk.body}</p>
              </article>
            ))}
          </div>

          <div className="card-brand stack stack-8">
            <strong style={{ fontSize: 16, color: "var(--brand-ink)" }}>양자택일을 없앱니다</strong>
            <p style={{ fontSize: 14.5, color: "var(--brand-ink)" }}>
              대금은 계약 시점에 전액 예치되어 어느 쪽도 임의로 사용할 수 없습니다. 합의한 조건이 충족될 때마다 사전에
              약속된 금액이 단계적으로 지급됩니다. 공급자는 대금이 확보된 것을 확인하고 작업에 착수하고, 구매자는
              약속된 결과물을 받기 전까지 금액을 계속 보호받습니다.
            </p>
          </div>
        </section>

        <section className="stack stack-16">
          <div className="stack stack-8">
            <span className="label">적용 범위</span>
            <h2 className="page-title">단계로 나눌 수 있는 거래라면 무엇이든</h2>
          </div>

          <div className="grid grid-3">
            {USE_CASES.map((useCase) => (
              <article key={useCase.title} className="card stack stack-8">
                <div className="row-between">
                  <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>{useCase.title}</strong>
                  {!useCase.ready && (
                    <span className="badge" data-tone="warning">
                      준비 중
                    </span>
                  )}
                </div>
                <span className="muted">{useCase.examples}</span>
                <p style={{ color: "var(--ink-2)", fontSize: 14 }}>{useCase.detail}</p>
              </article>
            ))}
          </div>

          <div className="card-soft stack stack-12">
            <span className="label">거래 종류가 달라도 흐름은 동일합니다</span>
            <div className="row wrap" style={{ gap: 8 }}>
              {FLOW_STEPS.map((step, index) => (
                <span key={step} className="row" style={{ gap: 8 }}>
                  <span className="badge" data-tone={index === FLOW_STEPS.length - 1 ? "warning" : "info"}>
                    {step}
                  </span>
                  {index < FLOW_STEPS.length - 1 && <span className="muted">→</span>}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="stack stack-16">
          <h2 className="section-title">핵심 기능</h2>
          <div className="grid grid-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className="card stack stack-8">
                <strong style={{ fontSize: 16, letterSpacing: "-0.02em" }}>{feature.title}</strong>
                <p style={{ color: "var(--ink-2)", fontSize: 14.5 }}>{feature.body}</p>
              </article>
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
