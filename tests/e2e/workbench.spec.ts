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
