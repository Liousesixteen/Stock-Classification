"""End-to-end tests for the dynamic temporal evidence graph."""

from pathlib import Path

from src.evidence_graph import EvidenceGraphService, NodeState, NodeType, TaskSpec


def _service(tmp_path: Path, **kwargs) -> EvidenceGraphService:
    return EvidenceGraphService(
        working_dir=tmp_path,
        task_spec=TaskSpec(
            target_name="比亚迪",
            stock_code="002594",
            target_type="financial_company",
            market="A",
            as_of_date="2026-08-29",
            required_metrics=["revenue"],
        ),
        auto_extract_facts=kwargs.get("auto_extract_facts", False),
    )


def _only_prefixed(values, prefix):
    return next(value for value in values if value.startswith(prefix))


def test_multimodal_ingestion_is_deduplicated_and_locatable(tmp_path):
    service = _service(tmp_path)
    first = service.ingest_tool_result(
        name="2024 年年度报告收入表",
        description="合并利润表",
        data={"2024": {"营业收入": "7771.02亿元"}},
        source="比亚迪 2024 年年度报告",
        link="https://www.cninfo.com.cn/new/disclosure/detail?plate=szse&stockCode=002594",
        modality="table",
        locator={"page": 136, "table": "合并利润表", "cell_range": "B4:C4"},
        published_at="2025-03-25",
    )
    evidence_id = _only_prefixed(first.added_nodes, "evidence_")
    evidence = service.store.get_node(evidence_id)
    assert evidence.properties["locator"]["page"] == 136
    assert evidence.properties["authority_score"] >= 0.9

    second = service.ingest_tool_result(
        name="2024 年年度报告收入表",
        description="合并利润表",
        data={"2024": {"营业收入": "7771.02亿元"}},
        source="比亚迪 2024 年年度报告",
        link="https://www.cninfo.com.cn/new/disclosure/detail?plate=szse&stockCode=002594",
        modality="table",
        locator={"page": 136, "table": "合并利润表", "cell_range": "B4:C4"},
        published_at="2025-03-25",
    )
    assert evidence_id in second.unchanged_nodes
    assert len(service.store.find_nodes(NodeType.EVIDENCE)) == 1
    assert len(list(service.evidence_ledger.iter_records())) == 1


def test_structured_tables_create_candidate_financial_facts(tmp_path):
    service = _service(tmp_path, auto_extract_facts=True)
    delta = service.ingest_tool_result(
        name="关键财务指标",
        description="年度指标表",
        data=[{"期间": "2024", "营业收入": "7771.02亿元", "净利润": "402.54亿元", "单位": "亿元"}],
        source="深交所年报",
        link="https://www.szse.cn/disclosure/byd-2024",
        modality="structured",
    )
    fact_ids = [node_id for node_id in delta.added_nodes if node_id.startswith("fact_")]
    assert len(fact_ids) == 2
    facts = [service.store.get_node(node_id) for node_id in fact_ids]
    assert {fact.properties["metric_id"] for fact in facts} == {"revenue", "net_profit"}
    assert all(fact.state == NodeState.CANDIDATE for fact in facts)
    assert all(fact.properties["period"] == "FY2024" for fact in facts)


def test_republished_content_is_clustered_not_counted_as_independent(tmp_path):
    service = _service(tmp_path)
    first = service.ingest_tool_result(
        name="公告原文",
        description="营业收入公告",
        data="公司 2024 年营业收入为 100 亿元",
        source="交易所公告",
        link="https://www.sse.com.cn/original",
    )
    second = service.ingest_tool_result(
        name="公告转载",
        description="营业收入公告转载",
        data="公司 2024 年营业收入为 100 亿元",
        source="新闻聚合站",
        link="https://example.net/repost",
    )
    first_evidence = _only_prefixed(first.added_nodes, "evidence_")
    second_evidence = _only_prefixed(second.added_nodes, "evidence_")
    assert (
        service.store.get_node(first_evidence).properties["origin_cluster"]
        == service.store.get_node(second_evidence).properties["origin_cluster"]
    )
    same_origin_edges = service.store.edges(second_evidence, direction="out", edge_types=["SAME_ORIGIN_AS"])
    assert [edge.target_id for edge in same_origin_edges] == [first_evidence]


def test_claim_audit_and_restatement_propagate_staleness(tmp_path):
    service = _service(tmp_path)
    evidence_2023_delta = service.ingest_tool_result(
        name="2023 年报",
        description="营业收入原始披露",
        data="2023 年营业收入 6023.15 亿元",
        source="比亚迪 2023 年年度报告",
        link="https://www.cninfo.com.cn/byd/2023-report",
        modality="pdf_text",
        locator={"page": 132, "paragraph": 4},
        published_at="2024-03-27",
    )
    evidence_2024_delta = service.ingest_tool_result(
        name="2024 年报",
        description="营业收入原始披露",
        data="2024 年营业收入 7771.02 亿元",
        source="比亚迪 2024 年年度报告",
        link="https://www.szse.cn/byd/2024-report",
        modality="pdf_text",
        locator={"page": 136, "paragraph": 3},
        published_at="2025-03-25",
    )
    evidence_2023 = _only_prefixed(evidence_2023_delta.added_nodes, "evidence_")
    evidence_2024 = _only_prefixed(evidence_2024_delta.added_nodes, "evidence_")

    fact_2023_delta = service.register_financial_fact(
        metric_name="营业收入",
        value=6023.15,
        period="2023",
        unit="亿元",
        currency="CNY",
        evidence_ids=[evidence_2023],
        status=NodeState.VERIFIED,
    )
    fact_2024_delta = service.register_financial_fact(
        metric_name="营业收入",
        value=7771.02,
        period="2024",
        unit="亿元",
        currency="CNY",
        evidence_ids=[evidence_2024],
        status=NodeState.VERIFIED,
    )
    fact_2023 = _only_prefixed(fact_2023_delta.added_nodes, "fact_")
    fact_2024 = _only_prefixed(fact_2024_delta.added_nodes, "fact_")
    hypotheses = service.mine_implicit_relationships("营业收入")
    assert len(hypotheses) == 1
    assert hypotheses[0]["properties"]["analysis_type"] == "trend_hypothesis"
    assert hypotheses[0]["state"] == "candidate"
    calculation_id = service.register_calculation(
        name="营业收入同比增长率",
        formula="revenue_2024 / revenue_2023 - 1",
        value=7771.02 / 6023.15 - 1,
        input_fact_ids=[fact_2023, fact_2024],
        unit="ratio",
        code="growth = revenue_2024 / revenue_2023 - 1",
    )
    chart_id = service.register_chart(
        name="2023—2024 年营业收入及增速",
        path="images/revenue-growth.png",
        data_node_ids=[fact_2023, fact_2024, calculation_id],
        code="plot(revenue)",
        review_status="vlm_passed",
    )
    claim_id = service.register_claim(
        text="比亚迪 2024 年营业收入较 2023 年显著增长。",
        section="经营表现",
        evidence_ids=[evidence_2023, evidence_2024],
        fact_ids=[fact_2023, fact_2024],
        calculation_ids=[calculation_id],
        chart_ids=[chart_id],
        materiality="high",
    )
    first_audit = service.audit_claim(claim_id)
    assert first_audit.status == "verified"
    assert first_audit.score >= 0.65
    assert service.coverage_report()["ready_for_report"] is True

    correction_delta = service.ingest_tool_result(
        name="2023 年报更正公告",
        description="营业收入口径更正",
        data="更正后 2023 年营业收入为 6000.00 亿元",
        source="深交所更正公告",
        link="https://www.szse.cn/byd/2023-restatement",
        modality="pdf_text",
        locator={"page": 2, "paragraph": 1},
        published_at="2026-01-10",
    )
    correction_evidence = _only_prefixed(correction_delta.added_nodes, "evidence_")
    restatement_delta = service.register_financial_fact(
        metric_name="营业收入",
        value=6000.0,
        period="2023",
        unit="亿元",
        currency="CNY",
        evidence_ids=[correction_evidence],
        status=NodeState.VERIFIED,
        supersedes_fact_id=fact_2023,
        restatement=True,
    )
    assert fact_2023 in restatement_delta.superseded_nodes
    assert calculation_id in restatement_delta.stale_nodes
    assert chart_id in restatement_delta.stale_nodes
    assert claim_id in restatement_delta.stale_nodes
    assert service.store.get_node(fact_2024).state == NodeState.VERIFIED
    repair_plan = service.build_repair_plan()
    actions = {item["action"] for item in repair_plan}
    assert {"recompute", "redraw_and_vlm_review", "rebind_and_reaudit"}.issubset(actions)

    second_audit = service.audit_claim(claim_id)
    assert second_audit.status == "needs_review"
    assert "dependency_is_stale_or_superseded" in second_audit.reasons
    assert service.store.get_node(claim_id).state == NodeState.STALE
    assert service.coverage_report()["ready_for_report"] is False
    exported = service.export_snapshot()
    assert exported["node_count"] > 0
    assert Path(exported["path"]).exists()


def test_task_conditioned_query_respects_as_of_date_and_authority(tmp_path):
    service = _service(tmp_path)
    service.ingest_tool_result(
        name="收入公告",
        description="官方营业收入",
        data="营业收入 100 亿元",
        source="交易所公告",
        link="https://www.sse.com.cn/revenue",
        published_at="2025-01-01",
    )
    service.ingest_tool_result(
        name="收入传闻",
        description="博客营业收入",
        data="营业收入 120 亿元",
        source="个人博客",
        link="https://example.net/revenue",
        published_at="2025-01-02",
    )
    service.ingest_tool_result(
        name="未来收入",
        description="截止日之后发布",
        data="营业收入 130 亿元",
        source="交易所公告",
        link="https://www.sse.com.cn/future-revenue",
        published_at="2027-01-01",
    )
    bundle = service.query("营业收入", node_types=[NodeType.EVIDENCE], limit=10)
    assert len(bundle["results"]) == 2
    assert "sse.com.cn" in bundle["results"][0]["properties"]["source_uri"]


def test_graph_health_and_version_history(tmp_path):
    service = _service(tmp_path)
    delta = service.ingest_tool_result(name="公告", description="测试", data="事实", source="公告")
    evidence_id = _only_prefixed(delta.added_nodes, "evidence_")
    service.store.update_state(evidence_id, NodeState.STALE, "test")
    assert service.store.node_history(evidence_id)
    health = service.health()
    assert health["node_count"] >= 4
    assert health["stale_node_count"] == 1
