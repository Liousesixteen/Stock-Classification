import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A 股产业链分类工作台" })).toBeVisible();
});

test("opens the research dashboard and exposes the primary workflow", async ({ page }) => {
  const primaryNav = page.getByLabel("研究空间导航");

  await expect(page.getByRole("heading", { name: "研究工作台总览" })).toBeVisible();
  await expect(primaryNav.getByRole("button", { name: "研究工作台" })).toHaveAttribute("aria-pressed", "true");
  await expect(primaryNav.getByRole("button", { name: "产业链图谱" })).toBeVisible();
  await expect(primaryNav.getByRole("button", { name: "成果库" })).toBeVisible();
  await expect(primaryNav.getByRole("button", { name: "任务中心" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 研究" })).toBeVisible();
  await expect(page.getByRole("button", { name: "报告工坊" })).toBeVisible();
});

test("publishes minimal health status and security response metadata", async ({ page }) => {
  const response = await page.request.get("/api/health");
  expect(response.ok()).toBe(true);
  expect(response.headers()["x-request-id"]).toBeTruthy();
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  const payload = await response.json() as Record<string, unknown>;
  expect(payload).toMatchObject({ status: "ok", database: "ready" });
  expect(payload).not.toHaveProperty("metrics");
  expect(payload).not.toHaveProperty("recentAuditEvents");
});

test("returns bounded client errors for malformed write requests", async ({ page }) => {
  const malformed = await page.request.post("/api/categories", {
    data: "{",
    headers: { "Content-Type": "application/json" },
  });
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toHaveProperty("error");

  const oversized = await page.request.post("/api/relations", {
    data: "x".repeat(3 * 1024 * 1024),
    headers: { "Content-Type": "application/json" },
  });
  expect(oversized.status()).toBe(413);
});

test("moves between the results library, task center, and research dashboard", async ({ page }) => {
  const primaryNav = page.getByLabel("研究空间导航");

  await primaryNav.getByRole("button", { name: "成果库" }).click();
  await expect(page.getByTestId("research-results-library")).toBeVisible();
  await expect(page.getByRole("heading", { name: "成果库" })).toBeVisible();

  await primaryNav.getByRole("button", { name: "任务中心" }).click();
  await expect(page.getByTestId("research-queue")).toBeVisible();
  await expect(page.getByRole("heading", { name: "任务中心" })).toBeVisible();

  await primaryNav.getByRole("button", { name: "研究工作台" }).click();
  await expect(page.getByRole("heading", { name: "研究工作台总览" })).toBeVisible();
});

test("collapses workspace side panels while keeping the primary canvas available", async ({ page }) => {
  const primaryNav = page.getByLabel("研究空间导航");
  await primaryNav.getByRole("button", { name: "成果库" }).click();
  const results = page.getByTestId("research-results-library");
  await results.getByRole("button", { name: "折叠左侧栏" }).click();
  await results.getByRole("button", { name: "折叠右侧栏" }).click();
  await expect(results.locator(".results-filter-rail")).toBeHidden();
  await expect(results.locator(".results-insights")).toBeHidden();
  await expect(results.locator(".results-main")).toBeVisible();

  await primaryNav.getByRole("button", { name: "产业链图谱" }).click();
  const atlas = page.locator(".atlas-workspace-v2");
  await atlas.getByRole("button", { name: "折叠左侧栏" }).click();
  await atlas.getByRole("button", { name: "折叠右侧栏" }).click();
  await expect(atlas.locator(".atlas-layer-nav")).toBeHidden();
  await expect(atlas.locator(".atlas-focus-snapshot")).toBeHidden();
  await expect(page.getByTestId("industry-graph-canvas-host")).toBeVisible();
  await atlas.getByRole("button", { name: "展开左侧栏" }).click();
  await expect(atlas.locator(".atlas-layer-nav")).toBeVisible();
});

test("opens a persistent task at its exact company dossier target", async ({ page }) => {
  const primaryNav = page.getByLabel("研究空间导航");
  await primaryNav.getByRole("button", { name: "任务中心" }).click();
  const queue = page.getByTestId("research-queue");
  await expect(queue).toBeVisible();
  await expect(queue.locator(".task-row").first()).toBeVisible();

  await queue.locator(".task-row-main").first().click();
  await queue.locator(".task-resolution-actions").getByRole("button", { name: "打开精确位置" }).click();

  await expect(page.getByTestId("instant-company-brief")).toBeVisible();
  await expect(page.locator("[id^='company-section-'].is-task-focus")).toBeVisible();
});

test("opens the universal AI research and report writing workspaces", async ({ page }) => {
  const primaryNav = page.getByLabel("研究空间导航");

  await page.getByRole("button", { name: "AI 研究" }).click();
  await expect(page.getByLabel("AI 研究工作空间")).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 研究" })).toBeVisible();
  await expect(page.getByRole("button", { name: "快速问答" })).toBeVisible();
  await expect(page.getByRole("button", { name: "标准研究" })).toBeVisible();
  await expect(page.getByRole("button", { name: "深度研究" })).toBeVisible();
  await expect(page.getByRole("button", { name: "数据分析" })).toBeDisabled();
  await expect(page.getByText("运行后显示真实引用")).toBeVisible();

  const targetInput = page.getByPlaceholder("输入公司代码或名称");
  await targetInput.fill("半导体");
  await targetInput.press("Enter");
  await expect(page.locator(".ai-assistant-message header small")).toContainText("产业档案");

  await primaryNav.getByRole("button", { name: "研究工作台" }).click();
  await page.getByRole("button", { name: "报告工坊" }).click();
  await expect(page.getByLabel("研报写作工作台")).toBeVisible();
  await expect(page.getByRole("heading", { name: "报告大纲" })).toBeVisible();
  await expect(page.getByRole("button", { name: /公司深度/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /赛道研究/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /公司对比/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /事件点评/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Word/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /PDF/ })).toBeDisabled();
});

test("keeps the four report workflows usable on a narrow desktop", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await page.getByRole("button", { name: "报告工坊" }).click();
  const studio = page.getByLabel("研报写作工作台");
  await expect(studio).toBeVisible();
  await expect(studio.getByRole("button", { name: /公司深度/ })).toBeVisible();
  await expect(studio.getByRole("button", { name: /赛道研究/ })).toBeVisible();
  await expect(studio.getByRole("button", { name: /公司对比/ })).toBeVisible();
  await expect(studio.getByRole("button", { name: /事件点评/ })).toBeVisible();
  await expect(studio.getByText("Markdown 章节编辑")).toBeVisible();
});

test("focuses the semiconductor chain and opens a company from the atlas", async ({ page }) => {
  await page.getByLabel("研究空间导航").getByRole("button", { name: "产业链图谱" }).click();
  const canvasHost = page.getByTestId("industry-graph-canvas-host");
  await expect(canvasHost).toBeVisible();
  const canvasBox = await canvasHost.boundingBox();
  expect(canvasBox?.width).toBeGreaterThan(600);
  expect(canvasBox?.height).toBeGreaterThan(400);
  expect((await canvasHost.screenshot()).byteLength).toBeGreaterThan(10_000);
  await expect(page.getByTestId("atlas-layer-nav")).toBeVisible();

  await page.getByRole("button", { name: "半导体（全链）" }).click();
  await expect(page.getByLabel("当前图谱聚焦路径")).toContainText("半导体");

  const finder = page.getByRole("textbox", { name: "定位产业或公司" });
  await finder.fill("中信证券");
  await page.getByRole("option", { name: /中信证券/ }).click();
  const snapshot = page.getByTestId("atlas-company-snapshot");
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toContainText("中信证券");

  await page.getByRole("button", { name: "进入公司研究详情" }).click();
  await expect(page.getByText("公司研究详情", { exact: true })).toBeVisible();
  await expect(page.getByTestId("instant-company-brief")).toBeVisible();
  await expect(page.getByText(/公司做什么/).first()).toBeVisible();
  await expect(page.getByText(/处于哪个环节/).first()).toBeVisible();
  await expect(page.getByText(/为什么值得关注/).first()).toBeVisible();
  await expect(page.getByText(/证据是否可靠/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "档案质量" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /证据时间线/ })).toBeVisible();
});

test("focuses a detailed semiconductor node from the atlas search", async ({ page }) => {
  await page.getByLabel("研究空间导航").getByRole("button", { name: "产业链图谱" }).click();
  const finder = page.getByRole("textbox", { name: "定位产业或公司" });
  await finder.fill("封测");
  await page.getByRole("option", { name: /封测/ }).first().click();

  await expect(page.getByLabel("当前图谱聚焦路径")).toContainText("封测");
  const focusSnapshot = page.getByLabel("封测研究焦点");
  await expect(focusSnapshot).toBeVisible();
  await expect(focusSnapshot).toContainText("封测");
  await expect(focusSnapshot).toContainText("关联公司");
});

test("keeps atlas hover, drag, and zoom interactions stable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.getByLabel("研究空间导航").getByRole("button", { name: "产业链图谱" }).click();
  await page.getByRole("button", { name: "半导体（全链）" }).click();
  await expect(page.getByLabel("当前图谱聚焦路径")).toContainText("半导体");

  const canvas = page.getByTestId("industry-graph-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  let hovered = false;
  const projectedLabels = page.locator(".atlas-node-label:not(.is-quiet):not(.is-colliding)");
  for (let index = 0; index < Math.min(await projectedLabels.count(), 14) && !hovered; index += 1) {
    const labelBox = await projectedLabels.nth(index).boundingBox();
    if (!labelBox) continue;
    for (const offset of [4, 10, 18, 26]) {
      await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height + offset);
      hovered = await page.locator(".atlas-hover-card.is-visible").count() > 0;
      if (hovered) break;
    }
  }
  expect(hovered).toBe(true);

  await page.mouse.down();
  await page.mouse.move(centerX + 72, centerY + 34, { steps: 5 });
  await page.mouse.up();
  await page.mouse.wheel(0, -180);
  await page.getByTitle("放大").click();
  await page.getByTitle("适应画布").click();
  await expect(canvas).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("filters relationship direction and opens a source-backed evidence node", async ({ page }) => {
  const created = await page.request.post("/api/companies/600030/graph-relations", {
    data: {
      entityType: "事件/政策",
      entityName: "资本市场政策支持",
      entitySummary: "用于验证方向筛选与证据节点交互。",
      relationType: "政策催化",
      confidence: "高",
      rationale: "政策支持由外部事件向公司经营传导。",
      isWatchlist: true,
      direction: "inbound",
      strength: 85,
      observedAt: "2026-07-26",
      evidence: {
        sourceType: "公告",
        title: "政策支持测试证据",
        sourceDate: "2026-07-26",
        url: "https://example.com/policy-evidence",
        excerpt: "该证据用于验证星图中的证据节点与原文入口。",
      },
    },
  });
  expect(created.ok()).toBe(true);

  await page.getByLabel("研究空间导航").getByRole("button", { name: "产业链图谱" }).click();
  const directionFilter = page.getByLabel("证据信号筛选").first();
  await directionFilter.selectOption("upstream");
  await expect(directionFilter).toHaveValue("upstream");

  const evidenceLayer = page.getByRole("switch", { name: "显示证据节点" });
  await expect(evidenceLayer).toHaveAttribute("aria-checked", "true");

  const finder = page.getByRole("textbox", { name: "定位产业或公司" });
  await finder.fill("政策支持测试证据");
  await page.getByRole("option", { name: /政策支持测试证据/ }).click();
  const snapshot = page.getByTestId("atlas-evidence-snapshot");
  await expect(snapshot).toBeVisible();
  await expect(snapshot).toContainText("公告");
  await expect(snapshot).toContainText("该证据用于验证星图中的证据节点");
  await expect(snapshot.getByRole("link", { name: "查看原文" })).toHaveAttribute("href", "https://example.com/policy-evidence");
});

test("exports a portable CSV relationship matrix", async ({ page }) => {
  const response = await page.request.get("/api/export?format=csv");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(await response.text()).toContain("股票代码,公司简称,当前分类");

  const health = await page.request.get("/api/health?details=1");
  const details = await health.json() as { recentAuditEvents: Array<{ action: string; statusCode: number }> };
  expect(details.recentAuditEvents).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: "workspace.export", statusCode: 200 }),
  ]));
});
