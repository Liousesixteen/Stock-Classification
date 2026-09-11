"""High-level dynamic multimodal temporal evidence-graph service."""

from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
from pathlib import Path
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

from .ledger import ClaimLedger, EvidenceLedger, JsonlLedger, ResearchTrace
from .models import (
    AuditResult,
    EdgeRecord,
    EdgeType,
    GraphDelta,
    NodeRecord,
    NodeState,
    NodeType,
    TaskSpec,
    canonical_json,
    content_hash,
    json_safe,
    stable_id,
    utc_now,
)
from .normalizer import (
    canonical_metric,
    infer_period,
    normalize_numeric,
    normalize_period,
    source_authority,
)
from .store import SQLiteGraphStore


class EvidenceGraphService:
    """Orchestrates ingestion, provenance, querying, updates, and auditing.

    The service has no LLM dependency.  It accepts already collected tool data,
    creates deterministic records, and exposes safe functions that agents may
    call from their code execution environment.
    """

    def __init__(
        self,
        working_dir: str | Path,
        task_spec: TaskSpec,
        authority_threshold: float = 0.65,
        auto_extract_facts: bool = True,
        max_auto_facts: int = 500,
    ) -> None:
        self.task_spec = task_spec
        self.root = Path(working_dir) / "evidence_graph"
        self.root.mkdir(parents=True, exist_ok=True)
        self.store = SQLiteGraphStore(self.root / "evidence_graph.sqlite3")
        self.evidence_ledger = EvidenceLedger(self.root / "evidence_nodes.jsonl")
        self.claim_ledger = ClaimLedger(self.root / "claims.jsonl")
        self.delta_ledger = JsonlLedger(self.root / "graph_delta.jsonl", identity_field="delta_id")
        self.trace = ResearchTrace(self.root / "research_trace.jsonl")
        self.authority_threshold = float(authority_threshold)
        self.auto_extract_facts = bool(auto_extract_facts)
        self.max_auto_facts = int(max_auto_facts)
        self.entity_id = self._ensure_entity(task_spec.target_name, task_spec.stock_code)
        self.trace.append_event("service_started", {"task_spec": task_spec.to_dict()})

    # ------------------------------------------------------------------
    # Low-level graph mutations
    # ------------------------------------------------------------------
    def _ensure_entity(self, name: str, stock_code: str = "") -> str:
        node_id = stable_id("entity", name.strip().lower(), stock_code.strip().upper())
        self.store.upsert_node(
            NodeRecord(
                node_id=node_id,
                node_type=NodeType.ENTITY,
                properties={
                    "name": name,
                    "stock_code": stock_code,
                    "market": self.task_spec.market,
                    "target_type": self.task_spec.target_type,
                },
            )
        )
        return node_id

    def _put_node(self, node: NodeRecord, delta: GraphDelta) -> str:
        action = self.store.upsert_node(node)
        delta.add_unique(f"{action}_nodes", node.node_id)
        return node.node_id

    def _put_edge(
        self, source_id: str, target_id: str, edge_type: EdgeType, delta: GraphDelta, **properties: Any
    ) -> str:
        edge = EdgeRecord.create(source_id, target_id, edge_type, properties)
        if self.store.add_edge(edge):
            delta.add_unique("added_edges", edge.edge_id)
        return edge.edge_id

    def _persist_delta(self, delta: GraphDelta, event: str, payload: Optional[dict[str, Any]] = None) -> GraphDelta:
        if not any(
            (
                delta.added_nodes,
                delta.updated_nodes,
                delta.added_edges,
                delta.superseded_nodes,
                delta.invalidated_nodes,
                delta.stale_nodes,
            )
        ):
            return delta
        delta.snapshot_from = self.store.latest_snapshot_id()
        snapshot_id = stable_id("snapshot", delta.delta_id, utc_now())
        delta.snapshot_to = snapshot_id
        self.store.create_snapshot(snapshot_id, {"delta_id": delta.delta_id, "event": event})
        self.delta_ledger.append(delta.to_dict())
        self.trace.append_event(event, {"delta": delta.to_dict(), **(payload or {})})
        return delta

    # ------------------------------------------------------------------
    # Multimodal evidence ingestion
    # ------------------------------------------------------------------
    def ingest_runtime_object(self, item: Any, task: str = "") -> GraphDelta:
        """Ingest ToolResult/SearchResult/ClickResult/AnalysisResult by duck typing."""
        if item is None:
            return GraphDelta()
        class_name = item.__class__.__name__
        if class_name == "AnalysisResult" or (hasattr(item, "chart_code_mapping") and hasattr(item, "content")):
            return self.register_analysis_result(item)
        return self.ingest_tool_result(
            name=getattr(item, "name", class_name),
            description=getattr(item, "description", ""),
            data=getattr(item, "data", item),
            source=getattr(item, "source", ""),
            link=getattr(item, "link", ""),
            query=getattr(item, "query", task),
            modality=self._infer_modality(item, getattr(item, "data", item)),
        )

    @staticmethod
    def _infer_modality(item: Any, data: Any) -> str:
        name = item.__class__.__name__.lower()
        if "image" in name:
            return "image"
        if hasattr(data, "columns") and hasattr(data, "to_dict"):
            return "table"
        if isinstance(data, (dict, list, tuple)):
            return "structured"
        source = str(getattr(item, "source", "")).lower()
        if ".pdf" in source:
            return "pdf_text"
        return "text"

    def ingest_tool_result(
        self,
        name: str,
        description: str,
        data: Any,
        source: str = "",
        link: str = "",
        query: str = "",
        modality: str = "text",
        locator: Optional[dict[str, Any]] = None,
        published_at: Optional[str] = None,
        valid_from: Optional[str] = None,
        valid_to: Optional[str] = None,
        license_info: str = "",
    ) -> GraphDelta:
        delta = GraphDelta()
        serialised = self._serialise_data(data)
        digest = content_hash(serialised)
        source_uri = (link or self._extract_url(source) or source or f"runtime:{name}").strip()
        authority_score, authority_class = source_authority(source_uri, source)

        source_id = stable_id("source", self._source_identity(source_uri))
        self._put_node(
            NodeRecord(
                node_id=source_id,
                node_type=NodeType.SOURCE,
                properties={
                    "name": source or self._source_identity(source_uri),
                    "uri": source_uri,
                    "authority_score": authority_score,
                    "authority_class": authority_class,
                },
            ),
            delta,
        )

        document_id = stable_id("document", source_uri, digest)
        family_id = stable_id("document_family", source_uri)
        existing_versions = self.store.find_nodes(
            NodeType.DOCUMENT,
            states=[NodeState.ACTIVE],
            property_filters={"family_id": family_id},
        )
        document = NodeRecord(
            node_id=document_id,
            node_type=NodeType.DOCUMENT,
            properties={
                "title": name,
                "description": description,
                "source_uri": source_uri,
                "family_id": family_id,
                "query": query,
                "modality": modality,
                "published_at": published_at,
                "retrieved_at": utc_now(),
                "license": license_info,
                "content_hash": digest,
            },
            valid_from=valid_from,
            valid_to=valid_to,
            content_hash=digest,
        )
        self._put_node(document, delta)
        self._put_edge(document_id, source_id, EdgeType.PUBLISHED_BY, delta)
        self._put_edge(document_id, self.entity_id, EdgeType.ABOUT_ENTITY, delta)

        for old in existing_versions:
            if old.node_id == document_id:
                continue
            self._put_edge(document_id, old.node_id, EdgeType.SUPERSEDES, delta, reason="new_document_version")
            if self.store.update_state(old.node_id, NodeState.SUPERSEDED, "new_document_version"):
                delta.add_unique("superseded_nodes", old.node_id)
            self._mark_dependency_closure_stale([old.node_id], delta, reason=f"superseded_by:{document_id}")

        evidence_id = stable_id("evidence", document_id, locator or {}, digest)
        same_content_evidence = self.store.find_by_content_hash(digest, NodeType.EVIDENCE)
        preview = self._content_preview(serialised)
        evidence = NodeRecord(
            node_id=evidence_id,
            node_type=NodeType.EVIDENCE,
            properties={
                "document_id": document_id,
                "name": name,
                "description": description,
                "source_uri": source_uri,
                "modality": modality,
                "locator": locator or {},
                "content_preview": preview,
                "content_hash": digest,
                "authority_score": authority_score,
                "authority_class": authority_class,
                "query": query,
                "published_at": published_at,
                "retrieved_at": utc_now(),
                "origin_cluster": self._origin_cluster(source_uri, digest),
            },
            valid_from=valid_from,
            valid_to=valid_to,
            content_hash=digest,
        )
        self._put_node(evidence, delta)
        self._put_edge(evidence_id, document_id, EdgeType.EXTRACTED_FROM, delta, locator=locator or {})
        self._put_edge(evidence_id, self.entity_id, EdgeType.ABOUT_ENTITY, delta)
        for peer in same_content_evidence:
            if peer.node_id != evidence_id:
                self._put_edge(evidence_id, peer.node_id, EdgeType.SAME_ORIGIN_AS, delta)
                self._put_edge(peer.node_id, evidence_id, EdgeType.SAME_ORIGIN_AS, delta)
        self.evidence_ledger.append_evidence(
            {
                **evidence.to_dict(),
                "raw_content": serialised,
                "source_id": source_id,
                "document_id": document_id,
            }
        )

        if self.auto_extract_facts and modality in {"table", "structured"}:
            fact_delta = self._extract_structured_facts(serialised, evidence_id, authority_score)
            delta.merge(fact_delta)
        return self._persist_delta(delta, "evidence_ingested", {"evidence_id": evidence_id})

    @staticmethod
    def _serialise_data(data: Any) -> Any:
        if hasattr(data, "to_dict") and hasattr(data, "columns"):
            try:
                return {
                    "kind": "dataframe",
                    "columns": [str(column) for column in data.columns],
                    "index": [str(index) for index in data.index],
                    "records": json_safe(data.reset_index().to_dict(orient="records")),
                }
            except Exception:
                pass
        return json_safe(data)

    @staticmethod
    def _content_preview(data: Any, max_chars: int = 12000) -> str:
        text = canonical_json(data)
        return text if len(text) <= max_chars else text[:max_chars] + "…"

    @staticmethod
    def _extract_url(source: str) -> str:
        match = re.search(r"https?://[^\s]+", str(source or ""))
        return match.group(0).rstrip(").,;]}") if match else ""

    @staticmethod
    def _source_identity(source_uri: str) -> str:
        parsed = urlparse(source_uri)
        return parsed.netloc.lower() or source_uri.strip().lower()

    @staticmethod
    def _origin_cluster(source_uri: str, digest: str) -> str:
        del source_uri
        return stable_id("origin", digest)

    def _extract_structured_facts(self, data: Any, evidence_id: str, authority_score: float) -> GraphDelta:
        delta = GraphDelta()
        extracted = 0
        records: list[dict[str, Any]] = []
        if isinstance(data, dict) and data.get("kind") == "dataframe":
            records = [record for record in data.get("records", []) if isinstance(record, dict)]
        elif isinstance(data, list):
            records = [record for record in data if isinstance(record, dict)]
        elif isinstance(data, dict):
            records = [data]
        for row_index, record in enumerate(records):
            period = infer_period([*record.keys(), *record.values()]) or ""
            currency = record.get("currency") or record.get("币种")
            unit = record.get("unit") or record.get("单位") or ""
            for metric, value in record.items():
                if extracted >= self.max_auto_facts:
                    return delta
                if re.search(
                    r"(^|_)(id|code|ticker|index|year|date|time)$|序号|代码|日期|年份|期间|单位|币种", str(metric), re.I
                ):
                    continue
                normalised = normalize_numeric(value, str(unit), currency)
                if not normalised:
                    continue
                fact_delta = self.register_financial_fact(
                    metric_name=str(metric),
                    value=value,
                    period=period,
                    unit=str(unit),
                    currency=currency,
                    evidence_ids=[evidence_id],
                    confidence=min(0.8, 0.45 + authority_score * 0.35),
                    status=NodeState.CANDIDATE,
                    scope={"row_index": row_index, "auto_extracted": True},
                    persist=False,
                )
                delta.merge(fact_delta)
                extracted += 1
        return delta

    # ------------------------------------------------------------------
    # Structured analytical assets
    # ------------------------------------------------------------------
    def register_financial_fact(
        self,
        metric_name: str,
        value: Any,
        period: str,
        unit: str = "",
        currency: Any = None,
        evidence_ids: Optional[Iterable[str]] = None,
        entity_name: Optional[str] = None,
        stock_code: str = "",
        confidence: float = 0.8,
        status: NodeState | str = NodeState.CANDIDATE,
        scope: Optional[dict[str, Any]] = None,
        supersedes_fact_id: Optional[str] = None,
        restatement: bool = False,
        persist: bool = True,
    ) -> GraphDelta:
        delta = GraphDelta()
        normalised = normalize_numeric(value, unit, currency)
        if not normalised:
            raise ValueError(f"Financial fact value is not numeric: {value!r}")
        metric_id_value = canonical_metric(metric_name)
        metric_id = stable_id("metric", metric_id_value)
        self._put_node(
            NodeRecord(
                node_id=metric_id,
                node_type=NodeType.METRIC_DEFINITION,
                properties={"metric_id": metric_id_value, "display_name": metric_name},
            ),
            delta,
        )
        period_info = normalize_period(period)
        period_id = stable_id("period", period_info)
        self._put_node(
            NodeRecord(
                node_id=period_id,
                node_type=NodeType.PERIOD,
                properties=period_info,
                valid_from=period_info.get("start"),
                valid_to=period_info.get("end"),
            ),
            delta,
        )
        entity_id = self.entity_id if not entity_name else self._ensure_entity(entity_name, stock_code)
        signature = stable_id("fact_signature", entity_id, metric_id_value, period_info["label"], scope or {})
        fact_id = stable_id("fact", signature, normalised.value, normalised.currency, normalised.canonical_unit)
        fact = NodeRecord(
            node_id=fact_id,
            node_type=NodeType.FINANCIAL_FACT,
            properties={
                "signature": signature,
                "entity_id": entity_id,
                "metric_id": metric_id_value,
                "metric_name": metric_name,
                "period": period_info["label"],
                "value": normalised.value,
                "raw_value": normalised.raw_value,
                "unit": normalised.unit,
                "canonical_unit": normalised.canonical_unit,
                "multiplier": normalised.multiplier,
                "currency": normalised.currency,
                "confidence": max(0.0, min(float(confidence), 1.0)),
                "scope": scope or {},
            },
            state=status,
            valid_from=period_info.get("start"),
            valid_to=period_info.get("end"),
        )
        self._put_node(fact, delta)
        self._put_edge(fact_id, entity_id, EdgeType.ABOUT_ENTITY, delta)
        self._put_edge(fact_id, metric_id, EdgeType.MEASURES, delta)
        self._put_edge(fact_id, period_id, EdgeType.VALID_DURING, delta)
        for evidence_id in evidence_ids or []:
            if self.store.get_node(evidence_id):
                self._put_edge(evidence_id, fact_id, EdgeType.SUPPORTS_CANDIDATE, delta)

        competing = [
            node
            for node in self.store.find_nodes(NodeType.FINANCIAL_FACT)
            if node.properties.get("signature") == signature and node.node_id != fact_id
        ]
        for old in competing:
            if supersedes_fact_id == old.node_id or restatement:
                self._put_edge(fact_id, old.node_id, EdgeType.RESTATES, delta)
                if self.store.update_state(old.node_id, NodeState.SUPERSEDED, f"restated_by:{fact_id}"):
                    delta.add_unique("superseded_nodes", old.node_id)
                self._mark_dependency_closure_stale([old.node_id], delta, reason=f"restated_by:{fact_id}")
            elif old.state not in {NodeState.SUPERSEDED, NodeState.INVALID}:
                self._put_edge(
                    fact_id, old.node_id, EdgeType.CONTRADICTS, delta, reason="same_metric_period_different_value"
                )
                self._put_edge(
                    old.node_id, fact_id, EdgeType.CONTRADICTS, delta, reason="same_metric_period_different_value"
                )
        if persist:
            self._persist_delta(delta, "financial_fact_registered", {"fact_id": fact_id})
        return delta

    def register_calculation(
        self,
        name: str,
        formula: str,
        value: Any,
        input_fact_ids: Iterable[str],
        unit: str = "",
        code: str = "",
        parameters: Optional[dict[str, Any]] = None,
    ) -> str:
        input_fact_ids = list(input_fact_ids)
        if not input_fact_ids:
            raise ValueError("A calculation must reference at least one input fact")
        missing = [node_id for node_id in input_fact_ids if not self.store.get_node(node_id)]
        if missing:
            raise KeyError(f"Unknown calculation inputs: {missing}")
        unusable = [
            node_id
            for node_id in input_fact_ids
            if self.store.get_node(node_id).state in {NodeState.STALE, NodeState.SUPERSEDED, NodeState.INVALID}
        ]
        if unusable:
            raise ValueError(f"Calculation inputs are stale or invalid: {unusable}")
        delta = GraphDelta()
        calculation_id = stable_id("calculation", name, formula, input_fact_ids, parameters or {}, value)
        self._put_node(
            NodeRecord(
                node_id=calculation_id,
                node_type=NodeType.CALCULATION,
                properties={
                    "name": name,
                    "formula": formula,
                    "value": json_safe(value),
                    "unit": unit,
                    "parameters": parameters or {},
                    "code": code,
                    "code_hash": content_hash(code) if code else "",
                    "input_fact_ids": input_fact_ids,
                },
            ),
            delta,
        )
        for fact_id in input_fact_ids:
            self._put_edge(fact_id, calculation_id, EdgeType.CALCULATED_FROM, delta)
        self._persist_delta(delta, "calculation_registered", {"calculation_id": calculation_id})
        return calculation_id

    def register_chart(
        self,
        name: str,
        path: str,
        data_node_ids: Iterable[str],
        code: str = "",
        description: str = "",
        review_status: str = "unreviewed",
    ) -> str:
        data_node_ids = [node_id for node_id in data_node_ids if self.store.get_node(node_id)]
        delta = GraphDelta()
        chart_id = stable_id("chart", name, path, data_node_ids, content_hash(code) if code else "")
        self._put_node(
            NodeRecord(
                node_id=chart_id,
                node_type=NodeType.CHART,
                properties={
                    "name": name,
                    "path": path,
                    "description": description,
                    "code": code,
                    "code_hash": content_hash(code) if code else "",
                    "review_status": review_status,
                    "data_node_ids": data_node_ids,
                },
            ),
            delta,
        )
        for node_id in data_node_ids:
            self._put_edge(node_id, chart_id, EdgeType.VISUALIZED_BY, delta)
        self._persist_delta(delta, "chart_registered", {"chart_id": chart_id})
        return chart_id

    def register_analysis_result(self, result: Any) -> GraphDelta:
        title = str(getattr(result, "title", "Analysis"))
        content = str(getattr(result, "content", result))
        delta = GraphDelta()
        analysis_id = stable_id("analysis", title, content_hash(content))
        self._put_node(
            NodeRecord(
                node_id=analysis_id,
                node_type=NodeType.ANALYSIS_FRAGMENT,
                properties={"title": title, "content": content, "content_hash": content_hash(content)},
            ),
            delta,
        )
        chart_names = getattr(result, "chart_name_mapping", {}) or {}
        chart_codes = getattr(result, "chart_code_mapping", {}) or {}
        chart_descriptions = getattr(result, "chart_name_description_mapping", {}) or {}
        image_dir = str(getattr(result, "image_save_dir", ""))
        for logical_name, file_name in chart_names.items():
            chart_path = str(Path(image_dir) / str(file_name)) if image_dir else str(file_name)
            chart_id = self.register_chart(
                name=str(logical_name),
                path=chart_path,
                data_node_ids=[],
                code=str(chart_codes.get(logical_name, "")),
                description=str(chart_descriptions.get(logical_name, "")),
            )
            self._put_edge(analysis_id, chart_id, EdgeType.PRODUCES, delta)
        return self._persist_delta(delta, "analysis_registered", {"analysis_id": analysis_id})

    def mine_implicit_relationships(self, metric_id: Optional[str] = None) -> list[dict[str, Any]]:
        """Materialise explainable trend hypotheses from comparable facts.

        These nodes remain ``candidate`` and are never treated as verified
        report claims.  The purpose is to give the analyzer useful graph-mined
        leads while preserving the distinction between fact and inference.
        """
        facts = self.store.find_nodes(
            NodeType.FINANCIAL_FACT,
            states=[NodeState.ACTIVE, NodeState.CANDIDATE, NodeState.VERIFIED],
        )
        groups: dict[tuple[Any, ...], list[NodeRecord]] = {}
        for fact in facts:
            if metric_id and fact.properties.get("metric_id") != canonical_metric(metric_id):
                continue
            key = (
                fact.properties.get("entity_id"),
                fact.properties.get("metric_id"),
                fact.properties.get("currency"),
                fact.properties.get("canonical_unit"),
                canonical_json(fact.properties.get("scope", {})),
            )
            groups.setdefault(key, []).append(fact)
        delta = GraphDelta()
        hypotheses: list[dict[str, Any]] = []
        for group in groups.values():
            group.sort(key=lambda item: str(item.properties.get("period", "")))
            for previous, current in zip(group, group[1:]):
                previous_value = float(previous.properties["value"])
                current_value = float(current.properties["value"])
                if previous_value == 0:
                    continue
                change_ratio = current_value / previous_value - 1
                hypothesis_id = stable_id("hypothesis", previous.node_id, current.node_id, "period_change")
                hypothesis = NodeRecord(
                    node_id=hypothesis_id,
                    node_type=NodeType.ANALYSIS_FRAGMENT,
                    properties={
                        "analysis_type": "trend_hypothesis",
                        "hypothesis": True,
                        "metric_id": current.properties.get("metric_id"),
                        "from_period": previous.properties.get("period"),
                        "to_period": current.properties.get("period"),
                        "from_value": previous_value,
                        "to_value": current_value,
                        "change_ratio": change_ratio,
                        "direction": "increase" if change_ratio > 0 else "decrease" if change_ratio < 0 else "flat",
                        "explanation": "Derived only from two comparable graph facts; causal interpretation requires additional evidence.",
                    },
                    state=NodeState.CANDIDATE,
                )
                self._put_node(hypothesis, delta)
                self._put_edge(previous.node_id, hypothesis_id, EdgeType.DEPENDS_ON, delta, role="baseline")
                self._put_edge(current.node_id, hypothesis_id, EdgeType.DEPENDS_ON, delta, role="current")
                hypotheses.append(hypothesis.to_dict())
        self._persist_delta(delta, "implicit_relationships_mined", {"hypothesis_count": len(hypotheses)})
        return hypotheses

    # ------------------------------------------------------------------
    # Claims, sections, and audit
    # ------------------------------------------------------------------
    def register_claim(
        self,
        text: str,
        section: str = "",
        evidence_ids: Optional[Iterable[str]] = None,
        fact_ids: Optional[Iterable[str]] = None,
        calculation_ids: Optional[Iterable[str]] = None,
        chart_ids: Optional[Iterable[str]] = None,
        claim_type: str = "analytical",
        materiality: str = "medium",
        risk_level: str = "medium",
    ) -> str:
        if not text.strip():
            raise ValueError("Claim text cannot be empty")
        delta = GraphDelta()
        section_id = ""
        if section:
            section_id = stable_id("section", section)
            self._put_node(NodeRecord(section_id, NodeType.REPORT_SECTION, {"title": section}), delta)
        claim_id = stable_id("claim", text.strip(), section)
        support_ids = list(
            dict.fromkeys([*(evidence_ids or []), *(fact_ids or []), *(calculation_ids or []), *(chart_ids or [])])
        )
        claim = NodeRecord(
            node_id=claim_id,
            node_type=NodeType.CLAIM,
            properties={
                "text": text.strip(),
                "section": section,
                "claim_type": claim_type,
                "materiality": materiality,
                "risk_level": risk_level,
                "evidence_ids": list(evidence_ids or []),
                "fact_ids": list(fact_ids or []),
                "calculation_ids": list(calculation_ids or []),
                "chart_ids": list(chart_ids or []),
                "audit_status": "pending",
            },
            state=NodeState.CANDIDATE,
        )
        self._put_node(claim, delta)
        for support_id in support_ids:
            if self.store.get_node(support_id):
                self._put_edge(support_id, claim_id, EdgeType.SUPPORTS_CANDIDATE, delta)
        if section_id:
            self._put_edge(claim_id, section_id, EdgeType.USED_IN_SECTION, delta)
        self.claim_ledger.append_claim(claim.to_dict())
        self._persist_delta(delta, "claim_registered", {"claim_id": claim_id})
        return claim_id

    def bind_evidence(self, claim_id: str, evidence_ids: Iterable[str]) -> GraphDelta:
        claim = self.store.get_node(claim_id)
        if not claim or claim.node_type != NodeType.CLAIM:
            raise KeyError(f"Unknown claim: {claim_id}")
        delta = GraphDelta()
        current = list(claim.properties.get("evidence_ids", []))
        for evidence_id in evidence_ids:
            evidence = self.store.get_node(evidence_id)
            if not evidence:
                continue
            if evidence_id not in current:
                current.append(evidence_id)
            self._put_edge(evidence_id, claim_id, EdgeType.SUPPORTS_CANDIDATE, delta)
        claim.properties["evidence_ids"] = current
        claim.content_hash = ""
        claim.__post_init__()
        self._put_node(claim, delta)
        self.claim_ledger.append_claim(claim.to_dict(), event="evidence_bound")
        return self._persist_delta(delta, "claim_evidence_bound", {"claim_id": claim_id})

    def register_report_section(self, title: str, content: str, auto_bind: bool = True) -> list[str]:
        claim_ids: list[str] = []
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", content) if part.strip()]
        for paragraph in paragraphs:
            plain = re.sub(r"^#+\s*", "", paragraph).strip()
            if len(plain) < 20 or plain.startswith("@import"):
                continue
            evidence_ids: list[str] = []
            fact_ids: list[str] = []
            if auto_bind:
                pack = self.query(plain, node_types=[NodeType.EVIDENCE, NodeType.FINANCIAL_FACT], limit=3)
                for item in pack["results"]:
                    if item["score"] < 0.45:
                        continue
                    if item["node_type"] == NodeType.EVIDENCE.value:
                        evidence_ids.append(item["node_id"])
                    elif item["node_type"] == NodeType.FINANCIAL_FACT.value:
                        fact_ids.append(item["node_id"])
            claim_ids.append(self.register_claim(plain, section=title, evidence_ids=evidence_ids, fact_ids=fact_ids))
        return claim_ids

    def audit_claim(self, claim_id: str) -> AuditResult:
        claim = self.store.get_node(claim_id)
        if not claim or claim.node_type != NodeType.CLAIM:
            raise KeyError(f"Unknown claim: {claim_id}")
        support_edges = self.store.edges(
            claim_id, direction="in", edge_types=[EdgeType.SUPPORTS_CANDIDATE, EdgeType.SUPPORTS_VERIFIED]
        )
        support_ids = list(dict.fromkeys(edge.source_id for edge in support_edges))
        ancestor_ids = self.store.ancestor_closure(support_ids)
        all_dependency_ids = list(dict.fromkeys([*support_ids, *ancestor_ids]))
        dependencies = [self.store.get_node(node_id) for node_id in all_dependency_ids]
        dependencies = [node for node in dependencies if node]
        evidences = [node for node in dependencies if node.node_type == NodeType.EVIDENCE]
        stale = [
            node.node_id
            for node in dependencies
            if node.state in {NodeState.STALE, NodeState.SUPERSEDED, NodeState.INVALID}
        ]
        conflicts: set[str] = set()
        for node in dependencies:
            for edge in self.store.edges(node.node_id, direction="both", edge_types=[EdgeType.CONTRADICTS]):
                other_id = edge.target_id if edge.source_id == node.node_id else edge.source_id
                other = self.store.get_node(other_id)
                if other and other.state not in {NodeState.SUPERSEDED, NodeState.INVALID}:
                    conflicts.add(other_id)
        reasons: list[str] = []
        if not support_ids:
            reasons.append("claim_has_no_bound_support")
        if not evidences:
            reasons.append("support_has_no_traceable_evidence")
        if stale:
            reasons.append("dependency_is_stale_or_superseded")
        if conflicts:
            reasons.append("unresolved_conflicting_fact")
        authority_scores = [float(node.properties.get("authority_score", 0.5)) for node in evidences]
        authority = sum(authority_scores) / len(authority_scores) if authority_scores else 0.0
        source_clusters = {
            node.properties.get("origin_cluster") for node in evidences if node.properties.get("origin_cluster")
        }
        diversity = min(1.0, len(source_clusters) / 2.0)
        traceability = 1.0 if evidences else 0.0
        score = round(0.5 * authority + 0.3 * traceability + 0.2 * diversity, 4)
        passed = bool(support_ids and evidences and not stale and not conflicts and score >= self.authority_threshold)
        status = "verified" if passed else "needs_review"
        issue_ids: list[str] = []
        delta = GraphDelta()
        for reason in reasons:
            issue_id = stable_id("audit_issue", claim_id, reason, claim.version)
            issue_ids.append(issue_id)
            self._put_node(
                NodeRecord(
                    node_id=issue_id,
                    node_type=NodeType.AUDIT_ISSUE,
                    properties={
                        "claim_id": claim_id,
                        "reason": reason,
                        "severity": "high" if reason != "unresolved_conflicting_fact" else "critical",
                    },
                    state=NodeState.ACTIVE,
                ),
                delta,
            )
            self._put_edge(issue_id, claim_id, EdgeType.QUALIFIES, delta)
        claim.properties["audit_status"] = status
        claim.properties["audit_score"] = score
        claim.properties["last_audited_at"] = utc_now()
        claim.state = NodeState.VERIFIED if passed else NodeState.STALE if stale else NodeState.CANDIDATE
        claim.content_hash = ""
        claim.__post_init__()
        self._put_node(claim, delta)
        if passed:
            for support_id in support_ids:
                self._put_edge(support_id, claim_id, EdgeType.SUPPORTS_VERIFIED, delta, audit_score=score)
        result = AuditResult(
            claim_id=claim_id,
            status=status,
            score=score,
            reasons=reasons,
            evidence_ids=[node.node_id for node in evidences],
            stale_dependencies=stale,
            conflicting_nodes=sorted(conflicts),
            audit_issue_ids=issue_ids,
        )
        self.claim_ledger.append_claim({**claim.to_dict(), "audit": result.to_dict()}, event="audited")
        self._persist_delta(delta, "claim_audited", {"audit": result.to_dict()})
        return result

    def audit_all_claims(self) -> list[AuditResult]:
        return [self.audit_claim(node.node_id) for node in self.store.find_nodes(NodeType.CLAIM)]

    # ------------------------------------------------------------------
    # Incremental update and invalidation
    # ------------------------------------------------------------------
    def supersede_node(
        self,
        old_node_id: str,
        new_node_id: str,
        relation: EdgeType = EdgeType.SUPERSEDES,
        reason: str = "manual_update",
    ) -> GraphDelta:
        old = self.store.get_node(old_node_id)
        new = self.store.get_node(new_node_id)
        if not old or not new:
            raise KeyError("Both old and new graph nodes must exist")
        delta = GraphDelta()
        self._put_edge(new_node_id, old_node_id, relation, delta, reason=reason)
        if self.store.update_state(old_node_id, NodeState.SUPERSEDED, reason):
            delta.add_unique("superseded_nodes", old_node_id)
        self._mark_dependency_closure_stale([old_node_id], delta, reason=f"{relation.value}:{new_node_id}")
        return self._persist_delta(delta, "node_superseded", {"old_node_id": old_node_id, "new_node_id": new_node_id})

    def invalidate_node(self, node_id: str, reason: str) -> GraphDelta:
        if not self.store.get_node(node_id):
            raise KeyError(f"Unknown node: {node_id}")
        delta = GraphDelta()
        if self.store.update_state(node_id, NodeState.INVALID, reason):
            delta.add_unique("invalidated_nodes", node_id)
        self._mark_dependency_closure_stale([node_id], delta, reason=reason)
        return self._persist_delta(delta, "node_invalidated", {"node_id": node_id, "reason": reason})

    def _mark_dependency_closure_stale(self, root_ids: Iterable[str], delta: GraphDelta, reason: str) -> list[str]:
        affected = self.store.dependency_closure(root_ids)
        for node_id in affected:
            node = self.store.get_node(node_id)
            if not node or node.state in {NodeState.SUPERSEDED, NodeState.INVALID}:
                continue
            if self.store.update_state(node_id, NodeState.STALE, reason):
                delta.add_unique("stale_nodes", node_id)
            for root_id in root_ids:
                if self.store.get_node(root_id):
                    self._put_edge(root_id, node_id, EdgeType.INVALIDATES, delta, reason=reason)
        return affected

    def build_repair_plan(self, node_ids: Optional[Iterable[str]] = None) -> list[dict[str, Any]]:
        """Return an executable-stage repair plan for stale downstream assets."""
        selected = (
            [self.store.get_node(node_id) for node_id in node_ids]
            if node_ids is not None
            else self.store.find_nodes(states=[NodeState.STALE])
        )
        selected = [node for node in selected if node and node.state == NodeState.STALE]
        action_map = {
            NodeType.CALCULATION: (10, "recompute", "Re-run stored formula/code with active replacement facts"),
            NodeType.ANALYSIS_FRAGMENT: (
                20,
                "remine_or_reanalyse",
                "Refresh graph-mined hypothesis or analytical fragment",
            ),
            NodeType.CHART: (30, "redraw_and_vlm_review", "Regenerate chart from refreshed data lineage and review it"),
            NodeType.CLAIM: (40, "rebind_and_reaudit", "Replace stale support, then execute claim audit"),
            NodeType.REPORT_SECTION: (50, "rewrite_section", "Rewrite only the affected report section"),
        }
        plan: list[dict[str, Any]] = []
        for node in selected:
            if node.node_type not in action_map:
                continue
            priority, action, instruction = action_map[node.node_type]
            stale_inputs = []
            for edge in self.store.edges(node.node_id, direction="in"):
                dependency = self.store.get_node(edge.source_id)
                if dependency and dependency.state in {NodeState.STALE, NodeState.SUPERSEDED, NodeState.INVALID}:
                    stale_inputs.append(dependency.node_id)
            plan.append(
                {
                    "priority": priority,
                    "node_id": node.node_id,
                    "node_type": node.node_type.value,
                    "action": action,
                    "instruction": instruction,
                    "stale_input_ids": sorted(set(stale_inputs)),
                    "reason": node.properties.get("state_reason", "dependency_changed"),
                }
            )
        return sorted(plan, key=lambda item: (item["priority"], item["node_id"]))

    # ------------------------------------------------------------------
    # Task-conditioned retrieval and materialisation
    # ------------------------------------------------------------------
    def query(
        self,
        query: str,
        node_types: Optional[Iterable[NodeType | str]] = None,
        limit: int = 12,
        include_stale: bool = False,
    ) -> dict[str, Any]:
        types = [
            NodeType(node_type)
            for node_type in (
                node_types
                or [NodeType.EVIDENCE, NodeType.FINANCIAL_FACT, NodeType.CALCULATION, NodeType.ANALYSIS_FRAGMENT]
            )
        ]
        states = None if include_stale else [NodeState.ACTIVE, NodeState.CANDIDATE, NodeState.VERIFIED]
        tokens = self._tokens(query)
        candidates: list[tuple[float, NodeRecord]] = []
        for node_type in types:
            for node in self.store.find_nodes(node_type=node_type, states=states):
                if not self._within_as_of_date(node):
                    continue
                if node.node_type == NodeType.EVIDENCE and not self._modality_allowed(
                    str(node.properties.get("modality", "text"))
                ):
                    continue
                text = canonical_json(node.properties).lower()
                matched = sum(1 for token in tokens if token in text)
                relevance = matched / max(1, len(tokens))
                authority = self._node_authority(node)
                confidence = float(node.properties.get("confidence", 0.5))
                state_bonus = 1.0 if node.state == NodeState.VERIFIED else 0.7
                freshness = self._freshness(node.updated_at)
                score = 0.42 * relevance + 0.23 * authority + 0.18 * confidence + 0.1 * freshness + 0.07 * state_bonus
                if not tokens or matched or node.node_type in {NodeType.CALCULATION, NodeType.ANALYSIS_FRAGMENT}:
                    candidates.append((round(score, 4), node))
        candidates.sort(key=lambda item: (item[0], item[1].updated_at), reverse=True)
        selected = candidates[: max(1, min(limit, self.task_spec.max_nodes))]
        selected_ids = [node.node_id for _, node in selected]
        context_ids = list(dict.fromkeys([*selected_ids, *self.store.ancestor_closure(selected_ids, max_depth=4)]))[
            : self.task_spec.max_nodes
        ]
        context_set = set(context_ids)
        context_edges = [
            edge.to_dict()
            for edge in self.store.all_edges()
            if edge.source_id in context_set and edge.target_id in context_set
        ]
        return {
            "task_spec": self.task_spec.to_dict(),
            "query": query,
            "results": [{"score": score, **node.to_dict()} for score, node in selected],
            "context_node_ids": context_ids,
            "context_edges": context_edges,
        }

    def _node_authority(self, node: NodeRecord) -> float:
        if "authority_score" in node.properties:
            return float(node.properties["authority_score"])
        scores: list[float] = []
        for ancestor_id in self.store.ancestor_closure([node.node_id], max_depth=4):
            ancestor = self.store.get_node(ancestor_id)
            if ancestor and ancestor.node_type == NodeType.EVIDENCE:
                scores.append(float(ancestor.properties.get("authority_score", 0.5)))
        return sum(scores) / len(scores) if scores else 0.5

    def build_material_pack(self, query: str, limit: int = 12, max_chars: int = 12000) -> str:
        bundle = self.query(query, limit=limit)
        lines = ["## Evidence Graph Material Pack", f"Query: {query}"]
        for index, item in enumerate(bundle["results"], 1):
            props = item["properties"]
            label = props.get("name") or props.get("metric_name") or props.get("title") or item["node_type"]
            value = props.get("value")
            period = props.get("period") or ""
            source = props.get("source_uri") or ""
            preview = props.get("content_preview") or props.get("content") or props.get("description") or ""
            detail = f"value={value} period={period}" if value is not None else str(preview)[:500]
            lines.append(
                f"[{index}] {item['node_id']} | {item['node_type']} | score={item['score']} | {label} | {detail} | source={source}"
            )
        text = "\n".join(lines)
        return text if len(text) <= max_chars else text[:max_chars] + "\n…(material pack truncated)"

    @staticmethod
    def _tokens(text: str) -> list[str]:
        latin = re.findall(r"[a-zA-Z0-9_]{2,}", text.lower())
        chinese = re.findall(r"[\u4e00-\u9fff]{2,}", text)
        bigrams = [token[i : i + 2] for token in chinese for i in range(max(0, len(token) - 1))]
        return list(dict.fromkeys([*latin, *chinese, *bigrams]))

    def _within_as_of_date(self, node: NodeRecord) -> bool:
        if not self.task_spec.as_of_date:
            return True
        as_of = str(self.task_spec.as_of_date)[:10]
        published = str(node.properties.get("published_at") or node.valid_from or "")[:10]
        return not published or published <= as_of

    def _modality_allowed(self, modality: str) -> bool:
        if not self.task_spec.modalities:
            return True
        family = {
            "pdf_text": "text",
            "structured": "table",
            "api": "timeseries",
            "dataframe": "table",
        }.get(modality, modality)
        return family in self.task_spec.modalities or modality in self.task_spec.modalities

    @staticmethod
    def _freshness(updated_at: str) -> float:
        try:
            updated = dt.datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            if updated.tzinfo is None:
                updated = updated.replace(tzinfo=dt.timezone.utc)
            age_days = max(0.0, (dt.datetime.now(dt.timezone.utc) - updated).total_seconds() / 86400)
            return math.exp(-age_days / 365.0)
        except Exception:
            return 0.5

    # ------------------------------------------------------------------
    # Durable export and observability
    # ------------------------------------------------------------------
    def export_snapshot(self) -> dict[str, Any]:
        nodes = [node.to_dict() for node in self.store.all_nodes()]
        edges = [edge.to_dict() for edge in self.store.all_edges()]
        snapshot = {
            "exported_at": utc_now(),
            "task_spec": self.task_spec.to_dict(),
            "nodes": nodes,
            "edges": edges,
        }
        snapshot_id = stable_id("snapshot", content_hash(snapshot))
        snapshot["snapshot_id"] = snapshot_id
        target = self.root / "graph_snapshot.json"
        temporary = target.with_suffix(".json.tmp")
        with temporary.open("w", encoding="utf-8") as stream:
            json.dump(snapshot, stream, ensure_ascii=False, indent=2, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
        export_mapping = {
            "documents.jsonl": {NodeType.SOURCE.value, NodeType.DOCUMENT.value},
            "financial_facts.jsonl": {
                NodeType.METRIC_DEFINITION.value,
                NodeType.PERIOD.value,
                NodeType.FINANCIAL_FACT.value,
            },
            "calculations.jsonl": {NodeType.CALCULATION.value, NodeType.ANALYSIS_FRAGMENT.value},
            "charts.jsonl": {NodeType.CHART.value},
            "audit_records.jsonl": {NodeType.AUDIT_ISSUE.value},
            "report_sections.jsonl": {NodeType.REPORT_SECTION.value},
        }
        for file_name, node_types in export_mapping.items():
            self._write_jsonl_atomic(self.root / file_name, [node for node in nodes if node["node_type"] in node_types])
        self._write_jsonl_atomic(self.root / "evidence_edges.jsonl", edges)
        self.store.create_snapshot(snapshot_id, {"path": str(target)})
        return {
            "snapshot_id": snapshot_id,
            "path": str(target),
            "node_count": len(snapshot["nodes"]),
            "edge_count": len(snapshot["edges"]),
        }

    @staticmethod
    def _write_jsonl_atomic(path: Path, records: Iterable[dict[str, Any]]) -> None:
        temporary = path.with_suffix(path.suffix + ".tmp")
        with temporary.open("w", encoding="utf-8") as stream:
            for record in records:
                stream.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)

    def health(self) -> dict[str, Any]:
        node_count, edge_count = self.store.counts()
        claims = self.store.find_nodes(NodeType.CLAIM)
        verified = sum(node.state == NodeState.VERIFIED for node in claims)
        stale = len(self.store.find_nodes(states=[NodeState.STALE]))
        conflicts = len(self._unresolved_conflict_pairs())
        return {
            "enabled": True,
            "database": str(self.store.path),
            "node_count": node_count,
            "edge_count": edge_count,
            "claim_count": len(claims),
            "verified_claim_count": verified,
            "stale_node_count": stale,
            "unresolved_conflict_pairs": conflicts,
            "latest_snapshot_id": self.store.latest_snapshot_id(),
        }

    def coverage_report(self) -> dict[str, Any]:
        active_states = [NodeState.ACTIVE, NodeState.CANDIDATE, NodeState.VERIFIED]
        facts = self.store.find_nodes(NodeType.FINANCIAL_FACT, states=active_states)
        available_metrics = sorted(
            {str(node.properties.get("metric_id")) for node in facts if node.properties.get("metric_id")}
        )
        required_metrics = sorted({canonical_metric(metric) for metric in self.task_spec.required_metrics})
        missing_metrics = sorted(set(required_metrics) - set(available_metrics))
        evidences = self.store.find_nodes(NodeType.EVIDENCE, states=active_states)
        available_modalities = sorted(
            {str(node.properties.get("modality")) for node in evidences if node.properties.get("modality")}
        )
        claims = self.store.find_nodes(NodeType.CLAIM)
        unverified_claim_ids = sorted(node.node_id for node in claims if node.state != NodeState.VERIFIED)
        stale_node_ids = sorted(node.node_id for node in self.store.find_nodes(states=[NodeState.STALE]))
        unresolved_conflicts = self._unresolved_conflict_pairs()
        return {
            "required_metrics": required_metrics,
            "available_metrics": available_metrics,
            "missing_metrics": missing_metrics,
            "available_modalities": available_modalities,
            "unverified_claim_ids": unverified_claim_ids,
            "stale_node_ids": stale_node_ids,
            "unresolved_conflict_pairs": [list(pair) for pair in unresolved_conflicts],
            "ready_for_report": not missing_metrics
            and not unverified_claim_ids
            and not stale_node_ids
            and not unresolved_conflicts,
        }

    def _unresolved_conflict_pairs(self) -> list[tuple[str, str]]:
        pairs: set[tuple[str, str]] = set()
        for edge in self.store.edges(edge_types=[EdgeType.CONTRADICTS]):
            source = self.store.get_node(edge.source_id)
            target = self.store.get_node(edge.target_id)
            if not source or not target:
                continue
            if source.state in {NodeState.SUPERSEDED, NodeState.INVALID} or target.state in {
                NodeState.SUPERSEDED,
                NodeState.INVALID,
            }:
                continue
            pairs.add(tuple(sorted((source.node_id, target.node_id))))
        return sorted(pairs)

    def close(self) -> None:
        self.export_snapshot()
        self.store.close()
