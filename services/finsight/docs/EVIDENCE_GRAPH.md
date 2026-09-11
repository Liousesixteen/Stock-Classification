# 动态多模态时序证据知识图谱

这是 FinSight 第一创新点的可运行实现。它不是单独的静态知识库，而是贯穿“采集—分析—图表—写作—审核”的共享证据内存。

## 已实现闭环

1. **任务条件化**：`TaskSpec` 保存研究对象、股票代码、市场、截止日期、必需指标、允许模态和子图预算。查询只返回当前任务需要且未超过 `as_of_date` 的最小证据子图。
2. **多模态证据账本**：网页、PDF 文本、表格、结构化 API、图片描述和 Python 产物统一转为 `Source → Document → Evidence`，保存 URL/文件、内容哈希、页码、bbox、单元格、发布时间、获取时间和来源权威等级。
3. **金融事实规范化**：将实体、指标同义词、币种、单位、期间和会计范围拆为显式节点；结构化表格可自动生成候选 `FinancialFact`，重要事实也可由分析代码显式登记。
4. **完整计算与图表血缘**：事实、计算、代码、图表、声明和报告章节通过确定关系连接，能够从任一结论反查到原始证据。
5. **双账本**：`evidence_nodes.jsonl` 记录系统获得过什么；`claims.jsonl` 记录报告说了什么、绑定了哪些证据以及审核状态。运行轨迹单独写入 `research_trace.jsonl`，不作为第三个业务账本。
6. **权威排序与交叉验证**：查询综合关键词相关性、来源权威性、事实置信度、新鲜度和验证状态；同指标、同期间、同范围但数值不同的事实自动建立 `CONTRADICTS`。
7. **隐式关系挖掘**：对实体、指标、币种、单位和范围一致的时序事实生成可解释趋势假设；假设始终保持 `candidate`，只作为分析线索，不会冒充已验证结论。
8. **动态更新**：新版本文档建立 `SUPERSEDES`；财务重述建立 `RESTATES`；旧节点保留在版本历史表，不被覆盖删除。
9. **局部失效传播**：更正或重述只沿依赖边标记相关 `Calculation / Chart / Claim / ReportSection` 为 `stale`，无关节点保持有效，并输出 `GraphDelta`。
10. **逐声明审核**：审核检查可追溯证据、来源权威性、独立来源数量、过期依赖和未解决冲突；通过后建立 `SUPPORTS_VERIFIED`，失败则创建 `AuditIssue`。
11. **增量修复计划**：失效传播后按依赖顺序输出“重算—重分析—重绘与多模态复核—重新绑定并审核—局部改写章节”，避免整篇报告从头重做。
12. **完备性门禁**：最终覆盖报告检查必需指标、可用模态、未验证 Claim、陈旧节点和冲突事实，并给出 `ready_for_report`。
13. **持久化与迁移边界**：当前后端为 SQLite + JSONL，无外部服务依赖；所有模型都是 JSON 属性图记录，后续可迁移至 PostgreSQL/Neo4j。

## FinSight 接入点

- `DataCollector`：任何 `Memory.add_data(ToolResult)` 都会自动去重、版本识别并写入证据图。
- `DataAnalyzer`：提示词先注入 `Evidence Graph Material Pack`；代码环境提供 `query_analysis_bundle`、`register_financial_fact`、`register_calculation`、`register_chart`、`mine_implicit_relationships`。
- `ReportGenerator`：大纲和章节写作都读取任务相关材料包；代码环境提供 `build_claim_material_pack`、`register_claim`、`bind_evidence`、`audit_claim`；每个完成的章节自动拆成 Claim。
- `run_report.py`：全部阶段成功后执行逐 Claim 审核并导出最终图谱快照。

## 运行产物

每次任务的 `<working_dir>/evidence_graph/` 包含：

- `evidence_graph.sqlite3`：当前属性图、节点历史和快照元数据；
- `evidence_nodes.jsonl`、`claims.jsonl`：两个追加式业务账本；
- `graph_delta.jsonl`：每次增量更新；
- `research_trace.jsonl`：研究过程事件；
- `graph_snapshot.json`：完整可迁移快照；
- `documents.jsonl`、`financial_facts.jsonl`、`calculations.jsonl`、`charts.jsonl`、`report_sections.jsonl`、`audit_records.jsonl`、`evidence_edges.jsonl`：按用途拆分的物化视图。

## 配置

```yaml
evidence_graph:
  enabled: true
  strict: false
  authority_threshold: 0.65
  auto_extract_facts: true
  max_auto_facts: 500
  max_nodes: 500
  as_of_date: null
  required_metrics: []
  modalities: [text, table, image, timeseries, code]
```

`strict: false` 表示图谱异常会记录日志但不终止旧流水线；研究实验和正式评测建议改为 `true`。

## 验证与查看

```bash
pytest tests/test_evidence_graph.py -q

python -m src.evidence_graph.cli demo \
  --working-dir ./outputs/evidence-graph-demo \
  --target-name 比亚迪 --stock-code 002594

python -m src.evidence_graph.cli health \
  --working-dir ./outputs/evidence-graph-demo \
  --target-name 比亚迪 --stock-code 002594

python -m src.evidence_graph.cli query \
  --working-dir ./outputs/evidence-graph-demo \
  --target-name 比亚迪 --stock-code 002594 \
  --query "营业收入增长"
```

端到端测试覆盖：证据定位与去重、表格事实抽取、来源排序、截止日期、Claim 审核、财务重述、依赖闭包、局部失效、版本历史和快照导出。
