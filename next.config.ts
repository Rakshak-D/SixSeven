import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit reads its font files from disk at runtime; bundling breaks that.
  serverExternalPackages: ["pdfkit"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && process.env.NEXT_PUBLIC_USE_MOCKS === "1") {
    throw new Error("Prototype mocks can only be enabled in a development build");
  }
  return nextConfig;
}
