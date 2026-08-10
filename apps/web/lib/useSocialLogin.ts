"use client";

import { usePrivy } from "@privy-io/react-auth";
import { isSocialLoginEnabled } from "./privy";

export interface SocialLogin {
  isAuthenticated: boolean;
  isPending: boolean;
  /** 화면에 보여줄 이름. 구글 이메일이 있으면 그것을 쓴다. */
  label: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Privy 소셜 로그인을 감싼다.
 *
 * Privy 를 설정하지 않은 환경에서도 화면이 깨지지 않도록, 훅은 항상 같은
 * 모양을 돌려주고 기능만 꺼진다.
 */
export function useSocialLogin(): SocialLogin {
  // Privy 프로바이더가 없으면 훅이 던지므로, 설정 여부로 먼저 갈라낸다
  if (!isSocialLoginEnabled) return disabled;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useEnabledSocialLogin();
}

const disabled: SocialLogin = {
  isAuthenticated: false,
  isPending: false,
  label: null,
  login: async () => {},
  logout: async () => {},
};

function useEnabledSocialLogin(): SocialLogin {
  const { ready, authenticated, user, login, logout } = usePrivy();

  const label =
    user?.google?.email ??
    user?.email?.address ??
    (user?.wallet?.address ? null : null);

  return {
    isAuthenticated: authenticated,
    isPending: !ready,
    label,
    login: async () => {
      login();
    },
    logout: async () => {
      await logout();
    },
  };
}
