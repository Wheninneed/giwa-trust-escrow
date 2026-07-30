import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // shared 패키지는 빌드 없이 TypeScript 원본을 그대로 쓴다
  transpilePackages: ["shared"],
  reactStrictMode: true,
};

export default nextConfig;
