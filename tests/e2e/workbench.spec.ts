import { expect, test } from "@playwright/test";

test("loads the stock classification workbench", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A 股产业链分类工作台" })).toBeVisible();
  await expect(page.getByText("行业 / 产业链")).toBeVisible();
  await expect(page.getByText("公司研究详情")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ArF 干法/浸没式光刻胶" })).toBeVisible();
});
