import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
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
