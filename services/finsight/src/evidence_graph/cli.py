"""Command-line inspection and acceptance demo for the evidence graph."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .models import NodeState, TaskSpec
from .service import EvidenceGraphService


def _service(args: argparse.Namespace) -> EvidenceGraphService:
    return EvidenceGraphService(
        working_dir=args.working_dir,
        task_spec=TaskSpec(
            target_name=args.target_name,
            stock_code=args.stock_code,
            target_type="financial_company",
            market=args.market,
            as_of_date=args.as_of_date,
        ),
    )


def run_demo(service: EvidenceGraphService) -> dict:
    def node_id(delta, prefix: str) -> str:
        return next(
            value
            for value in delta.added_nodes + delta.updated_nodes + delta.unchanged_nodes
            if value.startswith(prefix)
        )

    old_delta = service.ingest_tool_result(
        name="FY2023 annual report",
        description="Revenue table",
        data={"period": "2023", "revenue": 6023.15, "unit": "亿元"},
        source="official annual filing",
        link="https://www.cninfo.com.cn/demo/fy2023",
        modality="table",
        locator={"page": 132, "cell_range": "B4:C4"},
        published_at="2024-03-27",
    )
    new_delta = service.ingest_tool_result(
        name="FY2024 annual report",
        description="Revenue table",
        data={"period": "2024", "revenue": 7771.02, "unit": "亿元"},
        source="official annual filing",
        link="https://www.szse.cn/demo/fy2024",
        modality="table",
        locator={"page": 136, "cell_range": "B4:C4"},
        published_at="2025-03-25",
    )
    evidence_2023 = node_id(old_delta, "evidence_")
    evidence_2024 = node_id(new_delta, "evidence_")
    fact_2023_delta = service.register_financial_fact(
        "revenue",
        6023.15,
        "2023",
        "亿元",
        "CNY",
        [evidence_2023],
        status=NodeState.VERIFIED,
    )
    fact_2024_delta = service.register_financial_fact(
        "revenue",
        7771.02,
        "2024",
        "亿元",
        "CNY",
        [evidence_2024],
        status=NodeState.VERIFIED,
    )
    fact_2023 = node_id(fact_2023_delta, "fact_")
    fact_2024 = node_id(fact_2024_delta, "fact_")
    calculation_id = service.register_calculation(
        "revenue_yoy",
        "revenue_2024 / revenue_2023 - 1",
        7771.02 / 6023.15 - 1,
        [fact_2023, fact_2024],
        unit="ratio",
    )
    claim_id = service.register_claim(
        "FY2024 revenue increased substantially year over year.",
        section="Operating performance",
        evidence_ids=[evidence_2023, evidence_2024],
        fact_ids=[fact_2023, fact_2024],
        calculation_ids=[calculation_id],
        materiality="high",
    )
    audit = service.audit_claim(claim_id)
    snapshot = service.export_snapshot()
    return {"claim_id": claim_id, "audit": audit.to_dict(), "snapshot": snapshot, "health": service.health()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect FinSight's dynamic evidence graph")
    parser.add_argument("command", choices=["health", "query", "audit", "export", "demo"])
    parser.add_argument("--working-dir", required=True, type=Path)
    parser.add_argument("--target-name", default="unknown")
    parser.add_argument("--stock-code", default="")
    parser.add_argument("--market", default="A")
    parser.add_argument("--as-of-date", default=None)
    parser.add_argument("--query", default="")
    parser.add_argument("--claim-id", default="")
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()
    service = _service(args)
    if args.command == "health":
        result = service.health()
    elif args.command == "query":
        result = service.query(args.query, limit=args.limit)
    elif args.command == "audit":
        if not args.claim_id:
            parser.error("--claim-id is required for audit")
        result = service.audit_claim(args.claim_id).to_dict()
    elif args.command == "export":
        result = service.export_snapshot()
    else:
        result = run_demo(service)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
