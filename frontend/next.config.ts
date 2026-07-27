import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces the slim `.next/standalone` + `.next/static` output consumed by
  // the production Dockerfile (see frontend/Dockerfile). Confirmed against
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  output: "standalone",
};

export default nextConfig;
