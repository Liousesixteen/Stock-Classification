import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/runtime-config/route";

const originalKey = process.env.DEEPSEEK_API_KEY;
const originalModel = process.env.DEEPSEEK_MODEL;

describe("runtime config endpoint", () => {
  afterEach(() => {
    process.env.DEEPSEEK_API_KEY = originalKey;
    process.env.DEEPSEEK_MODEL = originalModel;
  });

  it("returns configuration status without exposing the secret", async () => {
    process.env.DEEPSEEK_API_KEY = "test-secret-that-must-not-leak";
    process.env.DEEPSEEK_MODEL = "deepseek-test";

    const response = await GET();
    const body = await response.json();

    expect(body).toMatchObject({ deepseekConfigured: true, model: "deepseek-test" });
    expect(JSON.stringify(body)).not.toContain("test-secret-that-must-not-leak");
    expect(body).not.toHaveProperty("apiKey");
  });
});
