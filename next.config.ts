import type { NextConfig } from "next";

const isProdLikeBuild =
  process.env.NODE_ENV === 'production' ||
  process.env.NEXT_PHASE === 'phase-production-build' ||
  process.env.NEXT_PHASE === 'phase-export';

if (isProdLikeBuild) {
  ['NEXTAUTH_URL', 'NEXTAUTH_SECRET'].forEach((key) => {
    const value = process.env[key];
    if (!value || !value.trim()) {
      throw new Error(
        `[env] ${key} is required for production builds so NextAuth does not fall back to http://localhost:3000.`
      );
    }
  });
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
