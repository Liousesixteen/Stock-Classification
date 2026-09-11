import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { middleware } from "@/middleware";

const originalUser = process.env.STOCK_APP_BASIC_AUTH_USER;
const originalPassword = process.env.STOCK_APP_BASIC_AUTH_PASSWORD;

afterEach(() => {
  restore("STOCK_APP_BASIC_AUTH_USER", originalUser);
  restore("STOCK_APP_BASIC_AUTH_PASSWORD", originalPassword);
});

describe("security middleware", () => {
  it("allows the integrated workbench only as a same-origin iframe surface", () => {
    const response = middleware(new NextRequest("http://localhost/rich-workbench/"));
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(response.headers.get("content-security-policy")).toContain("frame-src 'self'");
  });

  it("challenges protected routes when production credentials are configured", () => {
    process.env.STOCK_APP_BASIC_AUTH_USER = "analyst";
    process.env.STOCK_APP_BASIC_AUTH_PASSWORD = "secret";
    const response = middleware(new NextRequest("http://localhost/api/workbench"));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("accepts valid credentials while leaving the minimal health probe public", () => {
    process.env.STOCK_APP_BASIC_AUTH_USER = "analyst";
    process.env.STOCK_APP_BASIC_AUTH_PASSWORD = "secret";
    const authorized = middleware(new NextRequest("http://localhost/api/workbench", {
      headers: { authorization: `Basic ${btoa("analyst:secret")}` },
    }));
    expect(authorized.status).toBe(200);
    expect(authorized.headers.get("x-frame-options")).toBe("DENY");

    const health = middleware(new NextRequest("http://localhost/api/health"));
    expect(health.status).toBe(200);
  });

  it("rejects oversized API bodies before route parsing", async () => {
    delete process.env.STOCK_APP_BASIC_AUTH_USER;
    delete process.env.STOCK_APP_BASIC_AUTH_PASSWORD;
    const response = middleware(new NextRequest("http://localhost/api/relations", {
      method: "POST",
      headers: { "content-length": String(3 * 1024 * 1024) },
    }));
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "请求正文超过允许大小" });
  });
});

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
