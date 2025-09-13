import type { NextConfig } from "next";
import { execSync } from "child_process";

const nextConfig: NextConfig = {
  output: 'standalone',
  generateBuildId: async () => {
    // Get tag of current branch(that is HEAD) or fallback to short commit hash (7 digits)
    return execSync(`git describe --exact-match --tags 2> /dev/null || git rev-parse --short HEAD`).toString().trim()
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  }
};

export default nextConfig;
