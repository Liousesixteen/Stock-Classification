import { describe, expect, it } from "vitest";
import {
  consumeRateLimit,
  getMaxRequestBytes,
  getRateLimitPolicy,
  parseBasicAuthorization,
  safeEqual,
} from "@/lib/security/requestPolicy";

describe("request policy", () => {
  it("assigns stricter limits to costly AI routes", () => {
    const env = {
      STOCK_RATE_LIMIT_AI_PER_MINUTE: "7",
      STOCK_RATE_LIMIT_WRITE_PER_MINUTE: "30",
      STOCK_RATE_LIMIT_READ_PER_MINUTE: "90",
    };
    expect(getRateLimitPolicy("/api/ai/research", "POST", env)).toMatchObject({ bucket: "ai", limit: 7 });
    expect(getRateLimitPolicy("/api/relations", "POST", env)).toMatchObject({ bucket: "write", limit: 30 });
    expect(getRateLimitPolicy("/api/workbench", "GET", env)).toMatchObject({ bucket: "read", limit: 90 });
  });

  it("rejects a request after the configured sliding window bucket is exhausted", () => {
    const store = new Map();
    const policy = { bucket: "write" as const, limit: 2, windowMs: 1_000 };
    expect(consumeRateLimit(store, "client:write", policy, 100).allowed).toBe(true);
    expect(consumeRateLimit(store, "client:write", policy, 200).allowed).toBe(true);
    expect(consumeRateLimit(store, "client:write", policy, 300)).toMatchObject({ allowed: false, remaining: 0 });
    expect(consumeRateLimit(store, "client:write", policy, 1_101).allowed).toBe(true);
  });

  it("parses basic credentials and compares secrets without early length exit", () => {
    expect(parseBasicAuthorization(`Basic ${btoa("analyst:secret")}`)).toEqual({ username: "analyst", password: "secret" });
    expect(parseBasicAuthorization("Bearer secret")).toBeNull();
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secrex")).toBe(false);
    expect(safeEqual("secret", "short")).toBe(false);
  });

  it("allows a larger bounded body only for workbook previews", () => {
    expect(getMaxRequestBytes("/api/relations", {})).toBe(2 * 1024 * 1024);
    expect(getMaxRequestBytes("/api/import/preview", {})).toBe(12 * 1024 * 1024);
    expect(getMaxRequestBytes("/api/import/preview", { STOCK_IMPORT_MAX_BYTES: "4096" })).toBe(4096);
  });
});
