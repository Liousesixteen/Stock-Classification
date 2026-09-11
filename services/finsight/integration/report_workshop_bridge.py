#!/usr/bin/env python3
"""Connect the report workshop to the embedded multi-agent research pipeline."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any

import yaml


EVENT_PREFIX = "@@FINSIGHT_EVENT@@"
SERVICE_ROOT = Path(__file__).resolve().parents[1]


def emit(event_type: str, **payload: Any) -> None:
    message = {"type": event_type, **payload}
    sys.stdout.write(f"{EVENT_PREFIX}{json.dumps(message, ensure_ascii=False)}\n")
    sys.stdout.flush()


def public_message(value: str) -> str:
    """Remove implementation provenance from product-facing text and logs."""
    return re.sub(r"finsight", "星图研报引擎", value, flags=re.IGNORECASE)


def map_environment() -> None:
    """Map the host app's DeepSeek variables without ever persisting secrets."""
    aliases = {
        "DS_MODEL_NAME": ("FINSIGHT_DS_MODEL_NAME", "DEEPSEEK_MODEL"),
        "DS_API_KEY": ("FINSIGHT_DS_API_KEY", "DEEPSEEK_API_KEY"),
        "DS_BASE_URL": ("FINSIGHT_DS_BASE_URL", "DEEPSEEK_BASE_URL"),
        "VLM_MODEL_NAME": ("FINSIGHT_VLM_MODEL_NAME",),
        "VLM_API_KEY": ("FINSIGHT_VLM_API_KEY",),
        "VLM_BASE_URL": ("FINSIGHT_VLM_BASE_URL",),
        "EMBEDDING_MODEL_NAME": ("FINSIGHT_EMBEDDING_MODEL_NAME",),
        "EMBEDDING_API_KEY": ("FINSIGHT_EMBEDDING_API_KEY",),
        "EMBEDDING_BASE_URL": ("FINSIGHT_EMBEDDING_BASE_URL",),
    }
    for destination, sources in aliases.items():
        if os.getenv(destination):
            continue
        for source in sources:
            value = os.getenv(source)
            if value:
                os.environ[destination] = value
                break


def require_environment(enable_charts: bool) -> None:
    required = [
        "DS_MODEL_NAME",
        "DS_API_KEY",
        "DS_BASE_URL",
        "EMBEDDING_MODEL_NAME",
        "EMBEDDING_API_KEY",
        "EMBEDDING_BASE_URL",
    ]
    if enable_charts:
        required.extend(
            [
                "VLM_MODEL_NAME",
                "VLM_API_KEY",
                "VLM_BASE_URL",
            ]
        )
    else:
        # DataAnalyzer constructs its VLM client even in no-chart mode.  Reuse
        # the text model only for initialization; no visual call is made.
        os.environ.setdefault("VLM_MODEL_NAME", os.environ.get("DS_MODEL_NAME", ""))
        os.environ.setdefault("VLM_API_KEY", os.environ.get("DS_API_KEY", ""))
        os.environ.setdefault("VLM_BASE_URL", os.environ.get("DS_BASE_URL", ""))
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(
            "星图多智能体研报引擎缺少环境变量："
            + ", ".join(missing)
            + "。图表开启时必须配置 VLM 与 Embedding，系统不会静默降级。"
        )


def safe_target_name(value: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "-", value).strip(" .-")
    cleaned = cleaned.replace("..", "-")
    return cleaned[:50] or "研究标的"


def report_outline(report_type: str, focus: str) -> list[tuple[str, str]]:
    shared = f"写作重点：{focus}" if focus else "遵循事实、判断与待验证事项分离原则。"
    if report_type == "macro":
        return [
            ("宏观摘要", shared),
            ("问题定义与口径", "界定经济体、时间范围、指标口径与研究假设。"),
            ("核心指标与周期位置", "分析增长、通胀、就业、信用及其周期位置。"),
            ("政策与流动性", "梳理货币、财政、监管政策和流动性环境。"),
            ("传导机制", "解释政策与指标如何传导至需求、价格、盈利和估值。"),
            ("资产与行业影响", "比较权益、利率、汇率、商品及重点行业的差异化影响。"),
            ("情景推演", "设置基准、乐观和压力情景，明确触发条件。"),
            ("风险与反证", "列出相反数据、替代解释、尾部风险和判断失效条件。"),
            ("跟踪框架与结论", "形成有边界的结论与可持续更新的指标清单。"),
        ]
    if report_type == "industry":
        return [
            ("研究摘要", shared),
            ("赛道定义与边界", "界定统计口径、产业范围、关键术语与研究边界。"),
            ("产业链结构", "拆解上中下游环节、价值分配、关键资源与代表企业。"),
            ("供需与景气", "分析需求、供给、价格、产能与景气驱动，并标注数据时间。"),
            ("竞争格局与公司映射", "比较主要参与者、份额、壁垒与产业链位置。"),
            ("催化因素", "列出可观测的政策、技术、订单、产能与需求催化。"),
            ("风险与反证", "给出与主判断冲突的证据、失效条件和数据缺口。"),
            ("跟踪指标与结论", "形成结论、监测指标、触发条件与后续核验计划。"),
        ]
    if report_type == "comparison":
        return [
            ("对比摘要", shared),
            ("公司与业务口径", "统一公司、业务、会计期间与市场口径。"),
            ("产业链位置对比", "比较各公司所在环节、议价权与上下游依赖。"),
            ("经营与财务对比", "同口径比较收入、利润、现金流、效率与成长。"),
            ("竞争优势对比", "比较技术、产品、客户、产能、渠道和治理能力。"),
            ("催化因素对比", "列出各自可验证的近期与中期催化。"),
            ("风险与反证", "比较公司特定风险、共同风险与主判断失效条件。"),
            ("结论与待验证事项", "总结相对优劣，不足部分明确列入待验证清单。"),
        ]
    if report_type == "event":
        return [
            ("事件摘要", shared),
            ("事实与证据", "还原时间线、原始公告、政策或权威报道，区分已证实与传闻。"),
            ("影响传导路径", "拆解事件如何影响供需、价格、成本、盈利与估值。"),
            ("公司与产业链影响", "分析直接和间接影响、受益与受损环节。"),
            ("情景分析", "设置基准、乐观与压力情景，明确假设和可观测变量。"),
            ("后续跟踪节点", "列出时间节点、数据发布、政策落地和公司验证事项。"),
            ("风险与反证", "展示替代解释、反方证据与事件不及预期风险。"),
            ("结论", "给出有边界的研究判断，不构成投资建议。"),
        ]
    if report_type == "general":
        return [
            ("研究摘要", shared),
            ("问题与研究边界", "拆解用户问题、定义对象、时间范围、口径与不回答事项。"),
            ("背景与关键概念", "补齐理解问题所需的背景、术语和制度环境。"),
            ("证据与方法", "说明数据来源、检索策略、分析方法和证据限制。"),
            ("核心发现", "按重要性组织经交叉验证的事实与研究发现。"),
            ("机制与影响", "解释发现背后的机制、传导链路与影响范围。"),
            ("情景与争议", "呈现不同情景、主流分歧和关键争议。"),
            ("风险与反证", "主动搜索反例、替代解释和结论失效条件。"),
            ("结论与后续研究", "回答原问题，并列出待验证事项和跟踪指标。"),
        ]
    return [
        ("投资摘要", shared),
        ("公司概览", "梳理发展历程、管理层、股权结构、商业模式与核心业务。"),
        ("主营业务与收入构成", "拆解产品服务、收入结构、客户与区域，并说明口径。"),
        ("产业链位置", "分析上游依赖、下游客户、价值链位置与议价能力。"),
        ("竞争优势", "评估技术、产品、产能、客户、品牌、渠道与治理壁垒。"),
        ("财务与估值", "覆盖营收、利润率、现金流、资产负债、预测与估值假设。"),
        ("催化因素", "列出具备时间与验证条件的经营、行业和政策催化。"),
        ("风险与反证", "覆盖经营、财务、竞争、政策、预测及估值风险。"),
        ("结论与待验证事项", "总结核心判断并列出证据缺口和后续核验清单。"),
    ]


def write_outline(path: Path, report_type: str, target_name: str, focus: str) -> None:
    sections = report_outline(report_type, focus)
    content = [f"# {target_name}研究报告"]
    for title, description in sections:
        content.extend(["", f"## {title}", description])
    path.write_text("\n".join(content) + "\n", encoding="utf-8")


def default_tasks(report_type: str, target_name: str, stock_code: str, focus: str) -> tuple[list[str], list[str]]:
    identity = f"{target_name}（{stock_code}）" if stock_code else target_name
    if report_type == "macro":
        collect = [
            f"{identity}相关的国家统计、央行、财政和监管机构原始数据",
            f"{identity}相关的增长、通胀、就业、信用、利率和汇率时间序列",
            f"{identity}相关政策文件、会议纪要、权威解读与政策时间线",
            f"{identity}对权益、债券、商品、汇率和重点行业的历史影响",
            f"{identity}相关的一致预期、分歧观点、领先指标与反方证据",
        ]
        analyze = [
            "统一指标频率、季节性、名义与实际口径并判断周期位置",
            "分析货币、财政、信用和流动性的政策组合",
            "建立宏观变量到资产与行业盈利的传导机制",
            "构建基准、乐观与压力情景及其触发条件",
            "形成结论、反证、风险与持续跟踪指标",
        ]
    elif report_type == "industry":
        collect = [
            f"{identity}的权威定义、统计口径、政策文件与监管要求",
            f"{identity}近五年市场规模、增速、供需、价格、产能及未来预测",
            f"{identity}上中下游产业链结构、价值量分布与关键资源",
            f"{identity}主要厂商、竞争格局、市场份额、产品与商业模式",
            f"{identity}近期招投标、订单、融资、技术进展和落地案例",
            f"{identity}风险事件、技术瓶颈、替代路线与合规约束",
        ]
        analyze = [
            "界定赛道边界并判断生命周期与景气阶段",
            "量化供需、市场空间、增速和关键敏感变量",
            "构建产业链与竞争格局，比较主要参与者的资源禀赋",
            "分析商业模式、盈利路径和规模化落地难点",
            "形成催化、风险、反证、跟踪指标与情景推演",
        ]
    elif report_type == "comparison":
        collect = [
            f"{identity}涉及各公司的完整三大财务报表与关键经营指标",
            f"{identity}涉及各公司的业务结构、产品、客户、产能与区域分布",
            f"{identity}涉及各公司的产业链位置、上下游依赖与竞争对手",
            f"{identity}涉及各公司的估值、股价、机构观点与可比公司数据",
            f"{identity}涉及各公司的公告、催化、风险与争议事项",
        ]
        analyze = [
            "统一会计期、币种、业务与估值口径后比较经营质量",
            "比较产业链位置、竞争壁垒、成长驱动与议价能力",
            "比较盈利能力、现金流、资本效率、偿债能力和估值",
            "比较催化、风险、反证并形成相对结论",
        ]
    elif report_type == "event":
        collect = [
            f"{identity}相关事件的原始公告、政策全文与权威信息时间线",
            f"{identity}相关事件涉及的公司、产品、订单、产能与财务数据",
            f"{identity}相关事件的行业供需、价格、竞争和产业链数据",
            f"{identity}相关事件的市场反应、历史可比事件与后续日程",
            f"{identity}相关事件的反方证据、澄清公告、争议与风险",
        ]
        analyze = [
            "核验事实与时间线，区分已证实信息、推断和传闻",
            "建立事件到产业链、经营、财务和估值的传导路径",
            "构建基准、乐观与压力情景及其触发条件",
            "评估反证与失效条件并制定后续跟踪计划",
        ]
    elif report_type == "general":
        collect = [
            f"围绕用户问题检索一手文件、权威数据库与可追溯原始资料：{focus or identity}",
            f"围绕用户问题搜集关键主体、时间线、数据口径与背景材料：{focus or identity}",
            f"围绕用户问题搜集支持证据、反方证据、争议观点与替代解释：{focus or identity}",
            f"围绕用户问题搜集历史类比、相关案例与后续可验证节点：{focus or identity}",
        ]
        analyze = [
            "拆解用户问题并定义可回答的研究边界",
            "对来源、时间、口径与关键事实进行交叉验证",
            "识别核心机制、因果链条、影响对象与关键变量",
            "比较不同观点和情景，主动寻找反证与失效条件",
            "直接回答原问题并建立后续研究和跟踪框架",
        ]
    else:
        collect = [
            f"{identity}的资产负债表、利润表、现金流量表及最新财报",
            f"{identity}的股票基本信息、历史股价、估值和主要指数数据",
            f"{identity}的发展历程、管理层、融资和股权结构",
            f"{identity}的产品服务、收入构成、客户、供应商与商业模式",
            f"{identity}的行业空间、竞争对手、市场地位与产业链位置",
            f"{identity}的公告、机构评级、催化因素、风险与争议事项",
        ]
        analyze = [
            "梳理发展历程、治理、股权结构与主营业务",
            "分析行业空间、产业链位置、竞争格局与核心壁垒",
            "分析收入、利润率、费用、现金流、资本效率与偿债能力",
            "复盘股价与关键事件，进行同行比较、盈利预测与估值分析",
            "识别催化因素、风险、反证和待验证事项",
        ]
    if focus:
        collect.append(f"围绕本次写作重点补充一手数据与权威资料：{focus}")
        analyze.append(f"围绕本次写作重点进行专项分析并给出反证：{focus}")
    return collect, analyze


def build_config(request: dict[str, Any], run_dir: Path) -> Path:
    target_name = safe_target_name(str(request.get("targetName") or "研究标的"))
    report_type = str(request.get("reportType") or "company")
    focus = str(request.get("focus") or "").strip()
    stock_code = str(request.get("stockCode") or "").strip()
    collect_tasks, analysis_tasks = default_tasks(report_type, target_name, stock_code, focus)
    outline_path = run_dir / "report_outline.md"
    write_outline(outline_path, report_type, target_name, focus)
    inferred_target_type = {
        "company": "financial_company",
        "industry": "financial_industry",
        "macro": "financial_macro",
        "comparison": "general",
        "event": "general",
        "general": "general",
    }.get(report_type, "general")
    requested_target_type = str(request.get("targetType") or "")
    target_type = requested_target_type if requested_target_type in {
        "financial_company", "financial_industry", "financial_macro", "general"
    } else inferred_target_type
    llm_configs = [
        {
            "model_name": "${DS_MODEL_NAME}",
            "api_key": "${DS_API_KEY}",
            "base_url": "${DS_BASE_URL}",
            "generation_params": {"temperature": 0.4, "max_tokens": 32768, "top_p": 0.95},
        },
        {
            "model_name": "${EMBEDDING_MODEL_NAME}",
            "api_key": "${EMBEDDING_API_KEY}",
            "base_url": "${EMBEDDING_BASE_URL}",
        },
        {
            "model_name": "${VLM_MODEL_NAME}",
            "api_key": "${VLM_API_KEY}",
            "base_url": "${VLM_BASE_URL}",
        },
    ]
    config = {
        "target_name": target_name,
        "stock_code": stock_code,
        "target_type": target_type,
        "output_dir": str(run_dir),
        "language": "zh",
        "reference_doc_path": str(SERVICE_ROOT / "src/template/report_template.docx"),
        "outline_template_path": str(outline_path),
        "custom_collect_tasks": collect_tasks,
        "custom_analysis_tasks": analysis_tasks,
        "use_collect_data_cache": True,
        "use_analysis_cache": True,
        "use_report_outline_cache": True,
        "use_full_report_cache": True,
        "use_post_process_cache": True,
        "llm_config_list": llm_configs,
    }
    config_path = run_dir / "finsight.config.yaml"
    config_path.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return config_path


class ProgressHandler(logging.Handler):
    """Translate stable upstream log milestones into workshop progress."""

    def emit(self, record: logging.LogRecord) -> None:
        message = record.getMessage()
        detail = public_message(message)
        progress: dict[str, Any] | None = None
        if "Generating collect tasks" in message or "Executing priority 1" in message:
            progress = dict(phase="evidence", step=2, message="数据采集智能体正在工作", detail=detail)
        elif "Executing priority 2" in message:
            progress = dict(phase="analysis", step=3, message="分析智能体正在交叉研判", detail=detail)
        elif "Executing priority 3" in message or "[Phase1]" in message and "outline" in message.lower():
            progress = dict(phase="outline", step=4, message="星图研报引擎正在构建报告大纲", detail=detail)
        elif "[Phase1] Section" in message:
            match = re.search(r"Section\s+(\d+)", message)
            completed = int(match.group(1)) if match else 0
            progress = dict(
                phase="drafting",
                step=5,
                message="星图研报引擎正在分章节撰写长报告",
                detail=detail,
                completedSections=completed,
            )
        elif "[Phase2] Step" in message and "render" not in message.lower():
            progress = dict(phase="quality", step=6, message="星图研报引擎正在补充封面、引用与图表", detail=detail)
        elif "render report" in message.lower() or "rendered files" in message.lower():
            progress = dict(phase="rendering", step=7, message="星图研报引擎正在渲染 Markdown、Word 与 PDF", detail=detail)
        if progress:
            emit("progress", event=progress)


def find_artifacts(run_dir: Path) -> list[dict[str, Any]]:
    candidates: dict[str, Path] = {}
    for suffix, artifact_format in ((".md", "markdown"), (".docx", "docx"), (".pdf", "pdf")):
        files = [path for path in run_dir.rglob(f"*{suffix}") if path.is_file()]
        if suffix == ".md":
            files = [path for path in files if path.name != "report_outline.md"]
        if files:
            candidates[artifact_format] = max(files, key=lambda path: path.stat().st_mtime_ns)
    media_types = {
        "markdown": "text/markdown; charset=utf-8",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
    }
    return [
        {
            "format": artifact_format,
            "path": str(path.resolve()),
            "bytes": path.stat().st_size,
            "mediaType": media_types[artifact_format],
        }
        for artifact_format, path in candidates.items()
    ]


def report_metadata(markdown: str, fallback_title: str) -> tuple[str, str]:
    title_match = re.search(r"^#\s+(.+)$", markdown, re.MULTILINE)
    title = title_match.group(1).strip() if title_match else f"{fallback_title}研究报告"
    body = re.sub(r"^#.*$", "", markdown, count=1, flags=re.MULTILINE)
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", body) if part.strip() and not part.lstrip().startswith("#")]
    summary = re.sub(r"\s+", " ", paragraphs[0])[:240] if paragraphs else "星图深度研报流水线已完成。"
    return public_message(title), public_message(summary)


async def execute(request: dict[str, Any]) -> None:
    map_environment()
    enable_charts = bool(request.get("enableCharts", True))
    require_environment(enable_charts)
    run_dir = Path(str(request["runDir"])).expanduser().resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    config_path = build_config(request, run_dir)

    sys.path.insert(0, str(SERVICE_ROOT))
    from run_report import run_report
    from src.utils import get_logger

    get_logger().addHandler(ProgressHandler())
    total_sections = len(report_outline(str(request.get("reportType") or "company"), str(request.get("focus") or "")))
    emit(
        "progress",
        event={
            "phase": "preparing",
            "step": 1,
            "message": "星图多智能体研报引擎已启动",
            "detail": "正在初始化多 Agent、工具注册表、记忆与检查点",
            "completedSections": 0,
            "totalSections": total_sections,
        },
    )
    await run_report(
        config_file_path=str(config_path),
        resume=bool(request.get("resume", True)),
        max_concurrent=max(1, int(request.get("maxConcurrent", 3))),
        max_iterations=max(1, int(request.get("maxIterations", 20))),
        generate_tasks=bool(request.get("generateTasks", True)),
        enable_chart=enable_charts,
        add_reference_section=bool(request.get("addReferences", True)),
        echo=bool(request.get("echo", False)),
    )
    artifacts = find_artifacts(run_dir)
    markdown_artifact = next((item for item in artifacts if item["format"] == "markdown"), None)
    if not markdown_artifact:
        raise RuntimeError("研报流水线已完成，但没有生成 Markdown 报告")
    markdown = Path(markdown_artifact["path"]).read_text(encoding="utf-8")
    if not markdown.strip():
        raise RuntimeError("研报引擎生成的 Markdown 报告为空")
    title, summary = report_metadata(markdown, safe_target_name(str(request.get("targetName") or "研究标的")))
    emit(
        "result",
        result={
            "title": title,
            "executiveSummary": summary,
            "markdown": public_message(markdown),
            "model": public_message(os.environ["DS_MODEL_NAME"]),
            "artifacts": artifacts,
            "runDir": str(run_dir),
        },
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the embedded multi-agent report engine")
    parser.add_argument("--request", required=True, help="Path to the bridge request JSON")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    request_path = Path(args.request).expanduser().resolve()
    try:
        request = json.loads(request_path.read_text(encoding="utf-8"))
        asyncio.run(execute(request))
    except KeyboardInterrupt:
        emit("error", error="研报生成任务已取消")
        raise SystemExit(130)
    except Exception as error:
        emit("error", error=public_message(str(error)), errorType=type(error).__name__)
        raise


if __name__ == "__main__":
    main()
