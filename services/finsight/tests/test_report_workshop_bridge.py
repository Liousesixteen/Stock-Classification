import importlib.util
from pathlib import Path


BRIDGE_PATH = Path(__file__).resolve().parents[1] / "integration" / "report_workshop_bridge.py"
SPEC = importlib.util.spec_from_file_location("report_workshop_bridge", BRIDGE_PATH)
bridge = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(bridge)


def test_report_outline_matches_report_workshop_sections():
    company = bridge.report_outline("company", "关注现金流")
    industry = bridge.report_outline("industry", "关注景气")
    macro = bridge.report_outline("macro", "关注利率传导")
    general = bridge.report_outline("general", "研究开放问题")
    assert len(company) == 9
    assert len(industry) == 8
    assert len(macro) == 9
    assert len(general) == 9
    assert [title for title, _ in company][:2] == ["投资摘要", "公司概览"]
    assert [title for title, _ in company][-2:] == ["风险与反证", "结论与待验证事项"]


def test_build_config_keeps_all_three_model_roles_and_full_task_sets(tmp_path, monkeypatch):
    monkeypatch.setenv("DS_MODEL_NAME", "chat-model")
    monkeypatch.setenv("DS_API_KEY", "secret")
    monkeypatch.setenv("DS_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("VLM_MODEL_NAME", "vision-model")
    monkeypatch.setenv("VLM_API_KEY", "secret")
    monkeypatch.setenv("VLM_BASE_URL", "https://example.com/v1")
    monkeypatch.setenv("EMBEDDING_MODEL_NAME", "embedding-model")
    monkeypatch.setenv("EMBEDDING_API_KEY", "secret")
    monkeypatch.setenv("EMBEDDING_BASE_URL", "https://example.com/v1")

    config_path = bridge.build_config(
        {
            "reportType": "company",
            "targetName": "示例/公司",
            "stockCode": "000001",
            "focus": "现金流与估值",
            "enableCharts": True,
        },
        tmp_path,
    )
    content = config_path.read_text(encoding="utf-8")
    assert "financial_company" in content
    assert content.count("model_name:") == 3
    assert "现金流与估值" in content
    assert (tmp_path / "report_outline.md").exists()


def test_build_config_maps_all_question_routes_to_upstream_target_types(tmp_path):
    expected = {
        "company": "financial_company",
        "industry": "financial_industry",
        "macro": "financial_macro",
        "comparison": "general",
        "event": "general",
        "general": "general",
    }
    for report_type, target_type in expected.items():
        run_dir = tmp_path / report_type
        run_dir.mkdir()
        config_path = bridge.build_config(
            {
                "reportType": report_type,
                "targetName": "用户研究问题",
                "focus": "围绕用户问题动态规划证据与分析任务",
            },
            run_dir,
        )
        config = bridge.yaml.safe_load(config_path.read_text(encoding="utf-8"))
        assert config["target_type"] == target_type
        assert any("用户问题" in task for task in config["custom_collect_tasks"])


def test_find_artifacts_returns_generated_report_but_not_input_outline(tmp_path):
    (tmp_path / "report_outline.md").write_text("# outline", encoding="utf-8")
    (tmp_path / "完整报告.md").write_text("# report", encoding="utf-8")
    (tmp_path / "完整报告.docx").write_bytes(b"PK")
    artifacts = bridge.find_artifacts(tmp_path)
    assert {item["format"] for item in artifacts} == {"markdown", "docx"}
    assert all("report_outline.md" not in item["path"] for item in artifacts)
