import type { NextConfig } from "next";
import { execSync } from "child_process";

// Dev-only: hosts allowed to reach the dev server's /_next/* resources + HMR
// when the dev server is proxied through another host/domain. Set
// ALLOWED_DEV_ORIGINS to a comma-separated list, e.g.
//   ALLOWED_DEV_ORIGINS="live.example.com,*.example.com,10.0.0.5"
// Unset → Next's default (localhost only). Ignored in production builds.
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: 'standalone',
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  generateBuildId: async () => {
    // Get tag of current branch(that is HEAD) or fallback to short commit hash (7 digits)
    return execSync(`git describe --exact-match --tags 2> /dev/null || git rev-parse --short HEAD`).toString().trim()
  },

};

export default nextConfig;
