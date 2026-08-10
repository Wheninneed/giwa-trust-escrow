/**
 * Privy 설정. App ID 는 브라우저에 노출되는 공개 값이다.
 *
 * 설정하지 않으면 소셜 로그인만 꺼지고 지갑 로그인은 그대로 동작한다.
 * 데모 계약의 업체·중재자는 기존 지갑 주소라 지갑 로그인 경로가 반드시 남아야 한다.
 */
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export const isSocialLoginEnabled = Boolean(PRIVY_APP_ID);
