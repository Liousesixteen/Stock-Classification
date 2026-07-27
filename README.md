# A 股产业链分类工作台

本地优先的 A 股产业链研究工具。它把分类树、标的关系、证据、研究档案、待办清单和产业链星图放在同一条工作流中。

## 首次启动

使用 Node 24。复制环境变量示例后启动：

```bash
cp .env.example .env.local
npm install
npm run dev -- --port 3001
```

打开 [http://localhost:3001](http://localhost:3001)。首次启动会创建空的 `data/stock-classification.sqlite`，不会自动写入演示公司或关系。

如需本地体验内置的半导体、创新药、机器人、商业航天和证券样板，可在 `.env.local` 设置 `STOCK_BOOTSTRAP_MODE=sample` 后启动。样板导入只补充数据库中不存在的记录；重复启动不会覆盖已有分类、公司、关系或它们的更新时间。生产和真实研究环境应保持默认的 `STOCK_BOOTSTRAP_MODE=empty`。

## 每日研究流程

1. 在“研究工作台”搜索股票代码或简称，自动补全基础资料后纳入分类。
2. 在公司详情中同步资料，补充业务、竞争优势、客户、催化、风险和证据来源。
3. 在“AI 研究”输入公司、行业或开放问题，选择快速、标准或深度模式完成联合研判。
4. 研究结果会自动进入公司档案和成果库；公司研究还可以继续进入报告工坊。
5. 在“任务中心”处理缺证据、资料过期、同步失败、低置信度、待建档和报告质检事项；任务会精确定位到公司字段、关系或报告。
6. 在“产业链图谱”发现上下游关系与跨链标的，用右上角“导出”保存 JSON 备份或 CSV 关系矩阵。

## 数据与模型

- 本地 SQLite 是唯一写入源，数据库文件默认在 `data/stock-classification.sqlite`，不会提交到 Git。
- 股票基础资料通过配置的数据源按优先级补全；其中失败的可选源会自动降级，不阻断保存标的。
- 同步任务先写入 SQLite，再由独立调度器按并发上限执行；服务重启后会自动扫描排队任务和过期租约。
- 完全失败按指数退避重试；部分成功会保留已有结果，延迟补偿失败 Provider，并在补偿时绕过聚合缓存。
- 分类 Agent 默认使用规则整理。若需要启用 DeepSeek 分类，在 `.env.local` 设置 `DEEPSEEK_API_KEY` 并将 `CLASSIFICATION_AGENT_PROVIDER=deepseek`；分类调用失败时会回退到本地规则。
- AI 研究使用同一个 `DEEPSEEK_API_KEY`。快速模式最多调用 1 次；标准与深度模式并行运行基本面、产业链、情报和风险 Agent，再由主审 Agent 汇总，最多调用 5 次。
- AI 研究只接受本地 Provider、公司档案、图谱关系和证据目录中的引用 ID。没有合法引用的事实性陈述会被丢弃并计入“拦截无引用”，不会作为研究结论展示。
- 行业和开放问题研究写入通用研究记录；公司研究同时回写公司档案，并与其他研究一起进入成果库。
- 报告工坊支持公司深度、赛道研究、公司对比和事件点评四种类型。报告按段落绑定引用 ID，无依据的事实性段落会在服务端被丢弃。
- 手动编辑、AI 章节改写和历史版本恢复都会生成新的不可变版本；质量评分由章节覆盖、引用覆盖、证据质量和风险披露计算。
- 每份报告可导出 Markdown、带标题层级和页码的 DOCX，以及嵌入中文字体、可检索文本的 PDF；结构化主营数据可生成来源可追溯的图表。
- 任务中心由持久化自动任务驱动。同一缺口使用稳定幂等键，问题解除后自动完成；同步失败可直接重试，人工核验关系会写回独立验证状态，并立即影响图谱筛选。
- 成果库自动汇总研报、AI 结论、图谱快照和公司对比，归档状态保存在 SQLite，不再依赖浏览器本地存储。
- 导出 JSON 包含分类、公司、关系、证据、研究档案、报告版本、任务和成果状态，可用于本地归档与后续迁移。

## 验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run security:check
npm run ops:check
```

### 真实数据源验收

项目内置 24 家跨行业、跨上市板样本公司，覆盖沪深主板、创业板、科创板和北交所。该验收会访问真实公开数据源，默认不随单元测试运行：

```bash
npm run validate:providers
```

验收报告会展示每家公司耗时、可用 Provider 数、失败来源和核心字段缺口；默认要求总体通过率不低于 80%。连续失败的数据源会在 3 次后熔断 60 秒，冷却后仅放行一次探测请求。

## 部署与运维

- 当前发布候选版本说明见 [`docs/releases/0.1.0-rc.2.md`](docs/releases/0.1.0-rc.2.md)。
- 生产部署、访问控制、健康检查和发布清单见 [`docs/operations/DEPLOYMENT.md`](docs/operations/DEPLOYMENT.md)。
- SQLite 备份、验证和回滚恢复见 [`docs/operations/BACKUP_AND_RECOVERY.md`](docs/operations/BACKUP_AND_RECOVERY.md)。
- 数据源商用授权与展示边界见 [`docs/operations/DATA_SOURCE_COMPLIANCE.md`](docs/operations/DATA_SOURCE_COMPLIANCE.md)。
- 曾暴露的 DeepSeek Key 必须在供应商控制台完成吊销并创建新 Key；本仓库只能验证新密钥未被写入 Git，不能代替供应商侧轮换。
