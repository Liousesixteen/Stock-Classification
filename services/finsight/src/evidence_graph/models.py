"""Core records used by the evidence graph.

The graph is deliberately property-graph shaped instead of depending on a
specific graph database.  Every record is JSON serialisable and can therefore
be persisted in SQLite/JSONL today and migrated to Neo4j/PostgreSQL later.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Iterable, Optional

UTC = dt.timezone.utc


def utc_now() -> str:
    return dt.datetime.now(UTC).isoformat()


def json_safe(value: Any) -> Any:
    """Convert common runtime values to deterministic JSON-compatible data."""
    if dataclasses.is_dataclass(value):
        return {k: json_safe(v) for k, v in dataclasses.asdict(value).items()}
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(v) for v in value]
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def canonical_json(value: Any) -> str:
    return json.dumps(json_safe(value), ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def stable_id(prefix: str, *parts: Any) -> str:
    digest = hashlib.sha256("\x1f".join(canonical_json(part) for part in parts).encode("utf-8")).hexdigest()[:24]
    return f"{prefix}_{digest}"


def content_hash(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


class NodeType(str, Enum):
    SOURCE = "Source"
    DOCUMENT = "Document"
    EVIDENCE = "Evidence"
    ENTITY = "Entity"
    EVENT = "Event"
    METRIC_DEFINITION = "MetricDefinition"
    FINANCIAL_FACT = "FinancialFact"
    PERIOD = "Period"
    CALCULATION = "Calculation"
    ANALYSIS_FRAGMENT = "AnalysisFragment"
    CHART = "Chart"
    CLAIM = "Claim"
    REPORT_SECTION = "ReportSection"
    AUDIT_ISSUE = "AuditIssue"


class EdgeType(str, Enum):
    PUBLISHED_BY = "PUBLISHED_BY"
    EXTRACTED_FROM = "EXTRACTED_FROM"
    LOCATED_IN = "LOCATED_IN"
    SAME_ORIGIN_AS = "SAME_ORIGIN_AS"
    ABOUT_ENTITY = "ABOUT_ENTITY"
    MEASURES = "MEASURES"
    VALID_DURING = "VALID_DURING"
    MENTIONS_EVENT = "MENTIONS_EVENT"
    CALCULATED_FROM = "CALCULATED_FROM"
    PRODUCES = "PRODUCES"
    USES_DATA = "USES_DATA"
    GENERATED_BY_CODE = "GENERATED_BY_CODE"
    VISUALIZED_BY = "VISUALIZED_BY"
    SUPPORTS_CANDIDATE = "SUPPORTS_CANDIDATE"
    SUPPORTS_VERIFIED = "SUPPORTS_VERIFIED"
    CONTRADICTS = "CONTRADICTS"
    QUALIFIES = "QUALIFIES"
    DEPENDS_ON = "DEPENDS_ON"
    USED_IN_SECTION = "USED_IN_SECTION"
    SUPERSEDES = "SUPERSEDES"
    RESTATES = "RESTATES"
    CORRECTS = "CORRECTS"
    INVALIDATES = "INVALIDATES"


class NodeState(str, Enum):
    ACTIVE = "active"
    CANDIDATE = "candidate"
    VERIFIED = "verified"
    STALE = "stale"
    SUPERSEDED = "superseded"
    INVALID = "invalid"


@dataclass(slots=True)
class TaskSpec:
    target_name: str
    stock_code: str = ""
    target_type: str = "general"
    market: str = ""
    as_of_date: Optional[str] = None
    required_metrics: list[str] = field(default_factory=list)
    modalities: list[str] = field(default_factory=lambda: ["text", "table", "image", "timeseries", "code"])
    max_nodes: int = 500

    def to_dict(self) -> dict[str, Any]:
        return json_safe(self)


@dataclass(slots=True)
class NodeRecord:
    node_id: str
    node_type: NodeType | str
    properties: dict[str, Any] = field(default_factory=dict)
    state: NodeState | str = NodeState.ACTIVE
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    transaction_from: str = field(default_factory=utc_now)
    transaction_to: Optional[str] = None
    version: int = 1
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)
    content_hash: str = ""

    def __post_init__(self) -> None:
        self.node_type = NodeType(self.node_type)
        self.state = NodeState(self.state)
        self.properties = json_safe(self.properties)
        if not self.content_hash:
            self.content_hash = content_hash({"type": self.node_type.value, "properties": self.properties})

    def to_dict(self) -> dict[str, Any]:
        result = json_safe(self)
        result["node_type"] = self.node_type.value
        result["state"] = self.state.value
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "NodeRecord":
        return cls(**data)


@dataclass(slots=True)
class EdgeRecord:
    edge_id: str
    source_id: str
    target_id: str
    edge_type: EdgeType | str
    properties: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=utc_now)
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None

    def __post_init__(self) -> None:
        self.edge_type = EdgeType(self.edge_type)
        self.properties = json_safe(self.properties)

    def to_dict(self) -> dict[str, Any]:
        result = json_safe(self)
        result["edge_type"] = self.edge_type.value
        return result

    @classmethod
    def create(
        cls,
        source_id: str,
        target_id: str,
        edge_type: EdgeType | str,
        properties: Optional[dict[str, Any]] = None,
    ) -> "EdgeRecord":
        edge_type = EdgeType(edge_type)
        properties = properties or {}
        return cls(
            edge_id=stable_id("edge", source_id, target_id, edge_type.value, properties),
            source_id=source_id,
            target_id=target_id,
            edge_type=edge_type,
            properties=properties,
        )


@dataclass
class GraphDelta:
    delta_id: str = field(default_factory=lambda: stable_id("delta", utc_now()))
    created_at: str = field(default_factory=utc_now)
    added_nodes: list[str] = field(default_factory=list)
    updated_nodes: list[str] = field(default_factory=list)
    added_edges: list[str] = field(default_factory=list)
    superseded_nodes: list[str] = field(default_factory=list)
    invalidated_nodes: list[str] = field(default_factory=list)
    stale_nodes: list[str] = field(default_factory=list)
    unchanged_nodes: list[str] = field(default_factory=list)
    snapshot_from: Optional[str] = None
    snapshot_to: Optional[str] = None

    def add_unique(self, field_name: str, values: str | Iterable[str]) -> None:
        target = getattr(self, field_name)
        values = [values] if isinstance(values, str) else list(values)
        target.extend(value for value in values if value not in target)

    def merge(self, other: "GraphDelta") -> "GraphDelta":
        for name in (
            "added_nodes",
            "updated_nodes",
            "added_edges",
            "superseded_nodes",
            "invalidated_nodes",
            "stale_nodes",
            "unchanged_nodes",
        ):
            self.add_unique(name, getattr(other, name))
        return self

    def to_dict(self) -> dict[str, Any]:
        return json_safe(self)


@dataclass(slots=True)
class AuditResult:
    claim_id: str
    status: str
    score: float
    reasons: list[str] = field(default_factory=list)
    evidence_ids: list[str] = field(default_factory=list)
    stale_dependencies: list[str] = field(default_factory=list)
    conflicting_nodes: list[str] = field(default_factory=list)
    audit_issue_ids: list[str] = field(default_factory=list)
    audited_at: str = field(default_factory=utc_now)

    def to_dict(self) -> dict[str, Any]:
        return json_safe(self)
