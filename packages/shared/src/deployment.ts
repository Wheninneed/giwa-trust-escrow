import record from "./deployments/giwa-sepolia.json";

export interface DeploymentRecord {
  chainId: number;
  network: string;
  deployedAt: string | null;
  deployer: string | null;
  mockKRW: string | null;
  escrow: string | null;
  /** 이벤트 조회 시작 블록. 배포 스크립트가 기록한다. */
  deployBlock?: number;
}

/**
 * `pnpm deploy:giwa` 가 갱신하는 배포 기록.
 * 컨트랙트 주소는 환경변수로 덮어쓸 수 있으므로 이 값은 참고용이며,
 * 주소가 일치할 때만 deployBlock 을 신뢰해야 한다.
 */
export const giwaSepoliaDeployment = record as DeploymentRecord;
