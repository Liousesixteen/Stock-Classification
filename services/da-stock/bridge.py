"""Private stdin/NDJSON adapter for the local multi-agent research engine.

No HTTP port, source-project import, or alternate research implementation.
stdout contains only protocol events; upstream diagnostics go to stderr.
"""
import json
import os
from pathlib import Path
import sys
import threading

ROOT = Path(__file__).resolve().parent / "upstream"
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)
wire = sys.stdout
sys.stdout = sys.stderr
lock = threading.Lock()


def emit(event):
    with lock:
        wire.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
        wire.flush()


def main():
    request = json.loads(sys.stdin.readline())
    # Environment comes only from the server, never from browser input.
    for name, value in request.pop("environment", {}).items():
        os.environ[name] = str(value)
    from src.config import get_config
    from src.agent.factory import build_agent_executor, get_skill_manager, get_tool_registry
    config = get_config()
    depth = request.get("depth")
    if depth in {"quick", "standard", "deep"}:
        config.agent_orchestrator_mode = {"quick": "quick", "standard": "standard", "deep": "full"}[depth]
    if isinstance(request.get("context_compression"), bool):
        config.agent_context_compression_enabled = request["context_compression"]
    if request.get("operation") == "catalog":
        from src.agent.skills.defaults import get_primary_default_skill_id
        from src.services.agent_model_service import list_agent_model_deployments
        from data_provider import DataFetcherManager
        skills = [s for s in get_skill_manager(config).list_skills() if s.user_invocable]
        manager = DataFetcherManager()
        market_providers = [{
            "provider": f.name, "kind": "行情与财务", "markets": ["A股", "港股", "美股"],
            "runtime": f"优先级 P{f.priority}", "enabled": True, "configuredKeys": [],
        } for f in manager._get_fetchers_snapshot()]
        search_specs = [("Tavily", "TAVILY_API_KEYS"), ("SerpAPI", "SERPAPI_API_KEYS"),
                        ("Brave Search", "BRAVE_API_KEYS"), ("博查", "BOCHA_API_KEYS"),
                        ("Anspire Search", "ANSPIRE_API_KEYS")]
        search_providers = [{
            "provider": name, "kind": "资讯搜索", "markets": ["全球"], "runtime": "Agent 搜索工具",
            "enabled": bool(os.getenv(key)), "configuredKeys": [key] if os.getenv(key) else [],
        } for name, key in search_specs]
        emit({"type": "done", "success": True, "skills": [{
            "id": s.name, "name": s.display_name, "description": s.description,
            "category": s.category, "aliases": s.aliases,
            "requiredData": s.required_tools, "instructions": s.instructions,
        } for s in skills], "defaultSkillId": get_primary_default_skill_id(),
            "tools": [{"id": t.name, "name": t.name, "description": t.description,
                       "category": t.category} for t in get_tool_registry()._tools.values()],
            "providers": market_providers + search_providers,
            "models": list_agent_model_deployments(config)})
        return
    if not config.is_agent_available():
        raise RuntimeError("问股引擎未配置可用模型，请检查现有模型配置")
    # Import earlier turns once; the engine store then owns its full
    # provider/tool trace and context compression, not a lossy summary adapter.
    from src.storage import get_db
    session_id = request["session_id"]
    if not get_db().get_conversation_messages(session_id, limit=1):
        for message in request.get("history", []):
            if message.get("role") in ("user", "assistant"):
                get_db().save_conversation_message(session_id, message["role"], message["content"])
    context = request.get("context") or {}
    if "skills" in request:
        context["skills"] = request["skills"]
    executor = build_agent_executor(config, skills=request.get("skills"))
    result = executor.chat(message=request["message"], session_id=session_id,
                           context=context, progress_callback=emit)
    emit({"type": "done", "success": result.success, "content": result.content,
          "error": result.error, "model": result.model, "total_steps": result.total_steps,
          "total_tokens": result.total_tokens, "tool_calls_log": result.tool_calls_log})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        # Do not serialize provider exception bodies: they may contain secrets.
        emit({"type": "error", "message": "问股引擎执行失败", "error_class": type(exc).__name__})
        sys.exit(1)
