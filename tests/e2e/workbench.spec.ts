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

  await page.route("**/api/stocks/lookup?query=*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get("query") !== stockCode) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          stockCode,
          shortName,
          board: "创业板",
          industry: "测试行业",
          region: "",
          marketCapBand: "50-100亿",
          intro: `${shortName} 自动补全简介。`,
          mainBusiness: "测试主营业务",
          source: "eastmoney",
          sourceDetail: "测试股票索引",
        },
      }),
    });
  });

  await page.goto("/");

  await page.getByRole("button", { name: "添加标的" }).click();
  await page.getByLabel("股票代码或名称").fill(stockCode);
  await expect(page.getByLabel("归类说明")).toHaveValue(/纳入/);
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

test("auto fills stock profile from a stock name while adding a relation", async ({ page }) => {
  await page.route("**/api/stocks/lookup?query=*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.searchParams.get("query") !== "百济神州") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        profile: {
          stockCode: "688235",
          shortName: "百济神州",
          board: "科创板",
          industry: "化学制药",
          region: "",
          marketCapBand: "1000亿以上",
          intro: "东财基础资料显示，百济神州属于化学制药行业，上市板块为科创板。",
          mainBusiness: "化学制药",
          source: "eastmoney",
          sourceDetail: "东方财富 push2 基础资料",
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "添加标的" }).click();
  await page.getByLabel("股票代码或名称").fill("百济神州");

  await expect(page.getByText("688235", { exact: true })).toBeVisible();
  await expect(page.getByText("百济神州", { exact: true })).toBeVisible();
  await expect(page.getByText("科创板", { exact: true })).toBeVisible();
  await expect(page.getByText("化学制药", { exact: true })).toBeVisible();
  await expect(page.getByLabel("归类说明")).toHaveValue(/百济神州/);
});
