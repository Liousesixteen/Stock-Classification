import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/rich-workbench/:path*",
        destination: `http://127.0.0.1:${process.env.RICH_WORKBENCH_PORT || "8765"}/:path*`,
      },
    ];
  },
  outputFileTracingExcludes: {
    "*": [
      "**/*.sqlite",
      "**/*.sqlite3",
      "**/*.db",
      "**/*-wal",
      "**/*-shm",
      "**/*-journal",
      "**/backups/**/*",
    ],
  },
};

export default nextConfig;
