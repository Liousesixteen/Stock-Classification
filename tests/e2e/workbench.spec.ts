import { expect, test } from "@playwright/test";

test("loads the stock classification workbench", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A 股产业链分类工作台" })).toBeVisible();
  await expect(page.getByText("行业 / 产业链")).toBeVisible();
  await expect(page.getByText("公司研究详情")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ArF 干法/浸没式光刻胶" })).toBeVisible();
});

test("creates renames and deletes a custom category group", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const groupName = `自定义材料组-${suffix}`;
  const renamedGroupName = `自定义材料组已改名-${suffix}`;

  await page.goto("/");

  await page.getByRole("button", { name: "为 材料 新增子分组" }).click();
  await page.getByPlaceholder("新分组名称").fill(groupName);
  await page.getByRole("button", { name: "保存分类" }).click();
  await expect(page.getByRole("button", { name: groupName, exact: true })).toBeVisible();

  await page.getByRole("button", { name: `重命名 ${groupName}` }).click();
  await page.getByPlaceholder("分组名称").fill(renamedGroupName);
  await page.getByRole("button", { name: "保存分类" }).click();
  await expect(page.getByRole("button", { name: renamedGroupName, exact: true })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `删除 ${renamedGroupName}` }).click();
  await expect(page.getByRole("button", { name: renamedGroupName, exact: true })).toHaveCount(0);
});

test("adds edits and removes a stock relation manually", async ({ page }) => {
  const stockCode = `30${String(Date.now() % 10000).padStart(4, "0")}`;
  const shortName = `测试标的${stockCode.slice(-2)}`;
  const updatedName = `已编辑标的${stockCode.slice(-2)}`;

  await page.goto("/");

  await page.getByRole("button", { name: "添加标的" }).click();
  await page.getByLabel("股票代码").fill(stockCode);
  await page.getByLabel("公司简称").fill(shortName);
  await page.getByLabel("归类说明").fill("手动加入当前细分方向");
  await page.getByRole("button", { name: "保存标的" }).click();

  const rowButton = page.getByRole("button", { name: `查看 ${shortName}` });
  await expect(rowButton).toBeVisible();
  await rowButton.click();
  await page.getByRole("button", { name: "编辑公司资料" }).click();
  await page.getByLabel("公司简称").fill(updatedName);
  await page.getByLabel("公司简介").fill("这是手动编辑后的公司简介。");
  await page.getByLabel("主营业务").fill("这是手动编辑后的主营业务。");
  await page.getByRole("button", { name: "保存公司资料" }).click();

  await expect(page.getByRole("heading", { name: updatedName })).toBeVisible();
  await expect(page.getByText("这是手动编辑后的公司简介。")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `移除 ${stockCode} 与当前分类的关系` }).click();
  await expect(page.getByText(stockCode)).toHaveCount(0);
});
