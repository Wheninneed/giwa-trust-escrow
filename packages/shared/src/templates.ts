export interface MilestoneTemplateItem {
  title: string;
  description: string;
  /** 총 계약금 대비 비율(%) */
  ratio: number;
  evidence: string;
  isRetention?: boolean;
  /** 하자보증 잠금 일수 */
  retentionDays?: number;
}

export interface MilestoneTemplate {
  id: string;
  name: string;
  summary: string;
  defaultTotal: string;
  items: MilestoneTemplateItem[];
}

/** 명세서 11.4 의 기본 인테리어 템플릿 */
export const INTERIOR_TEMPLATE: MilestoneTemplate = {
  id: "interior",
  name: "주거 인테리어",
  summary: "자재 발주부터 하자보증까지 5단계",
  defaultTotal: "50000000",
  items: [
    {
      title: "자재 발주 및 작업 착수",
      description: "자재 발주와 현장 착수를 확인합니다.",
      ratio: 20,
      evidence: "발주서, 자재 목록",
    },
    {
      title: "철거·설비·전기 기초공사",
      description: "철거와 설비·전기 기초공사를 확인합니다.",
      ratio: 20,
      evidence: "전후 사진, 배선 사진",
    },
    {
      title: "목공·타일·주요 시공",
      description: "목공과 타일 등 주요 시공을 확인합니다.",
      ratio: 30,
      evidence: "공정별 사진",
    },
    {
      title: "준공 및 최종검수",
      description: "준공 상태와 최종 검수 결과를 확인합니다.",
      ratio: 20,
      evidence: "완료 사진, 검수 목록",
    },
    {
      title: "하자보증금",
      description: "하자보수 기간이 끝난 뒤 지급합니다.",
      ratio: 10,
      evidence: "하자보수 완료 확인",
      isRetention: true,
      retentionDays: 30,
    },
  ],
};

export const DEV_OUTSOURCING_TEMPLATE: MilestoneTemplate = {
  id: "dev",
  name: "개발 외주",
  summary: "기획부터 검수까지 4단계",
  defaultTotal: "20000000",
  items: [
    { title: "요구사항 확정 및 착수", description: "요구사항 문서 확정", ratio: 20, evidence: "요구사항 문서" },
    { title: "1차 개발 완료", description: "핵심 기능 구현", ratio: 35, evidence: "데모 링크, 저장소 커밋" },
    { title: "2차 개발 및 QA", description: "잔여 기능과 버그 수정", ratio: 30, evidence: "QA 결과서" },
    {
      title: "하자보증금",
      description: "인수 후 결함 대응 기간",
      ratio: 15,
      evidence: "결함 대응 완료 확인",
      isRetention: true,
      retentionDays: 30,
    },
  ],
};

/** 테스트넷 데모용 — 하자보증 잠금이 5분이라 심사 중에 전체 흐름을 볼 수 있다 */
export const DEMO_TEMPLATE: MilestoneTemplate = {
  id: "demo",
  name: "데모 (하자보증 5분)",
  summary: "심사·시연용. 하자보증 잠금이 5분으로 짧습니다",
  defaultTotal: "50000000",
  items: INTERIOR_TEMPLATE.items.map((item) =>
    item.isRetention ? { ...item, retentionDays: 0, description: "시연용으로 5분 뒤 지급됩니다." } : item,
  ),
};

export const TEMPLATES = [INTERIOR_TEMPLATE, DEV_OUTSOURCING_TEMPLATE, DEMO_TEMPLATE];

/** 데모 잠금기간(초). 템플릿 retentionDays 가 0이면 이 값을 쓴다. */
export const DEMO_RETENTION_SECONDS = 5 * 60;
