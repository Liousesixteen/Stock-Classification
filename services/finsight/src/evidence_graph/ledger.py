"""Append-only evidence, claim, delta, and research-trace logs."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any, Iterable

from .models import json_safe, utc_now


class JsonlLedger:
    """Small append-only ledger with process-local duplicate protection."""

    def __init__(self, path: str | Path, identity_field: str = "record_id") -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.identity_field = identity_field
        self._lock = threading.RLock()
        self._known_ids: set[str] = set()
        if self.path.exists():
            for record in self.iter_records(ignore_errors=True):
                record_id = record.get(identity_field)
                if record_id:
                    self._known_ids.add(str(record_id))

    def append(self, record: dict[str, Any], allow_duplicate: bool = False) -> bool:
        payload = json_safe(record)
        payload.setdefault("recorded_at", utc_now())
        record_id = payload.get(self.identity_field)
        with self._lock:
            if record_id and str(record_id) in self._known_ids and not allow_duplicate:
                return False
            encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n"
            with self.path.open("a", encoding="utf-8") as stream:
                stream.write(encoded)
                stream.flush()
                os.fsync(stream.fileno())
            if record_id:
                self._known_ids.add(str(record_id))
        return True

    def iter_records(self, ignore_errors: bool = False) -> Iterable[dict[str, Any]]:
        if not self.path.exists():
            return
        with self.path.open("r", encoding="utf-8") as stream:
            for line_number, line in enumerate(stream, 1):
                if not line.strip():
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    if not ignore_errors:
                        raise ValueError(f"Invalid JSONL at {self.path}:{line_number}")

    def latest(self, limit: int = 20) -> list[dict[str, Any]]:
        records = list(self.iter_records(ignore_errors=True))
        return records[-limit:]


class EvidenceLedger(JsonlLedger):
    def append_evidence(self, evidence: dict[str, Any]) -> bool:
        payload = dict(evidence)
        payload["record_id"] = payload.get("node_id") or payload.get("evidence_id")
        payload["ledger_type"] = "evidence"
        return self.append(payload)


class ClaimLedger(JsonlLedger):
    def append_claim(self, claim: dict[str, Any], event: str = "registered") -> bool:
        payload = dict(claim)
        payload["record_id"] = (
            f"{payload.get('node_id') or payload.get('claim_id')}:{event}:{payload.get('version', 1)}"
        )
        payload["claim_id"] = payload.get("node_id") or payload.get("claim_id")
        payload["ledger_type"] = "claim"
        payload["event"] = event
        return self.append(payload)


class ResearchTrace(JsonlLedger):
    def append_event(self, event: str, payload: dict[str, Any]) -> bool:
        record = {
            "record_id": f"{event}:{utc_now()}",
            "event": event,
            "payload": payload,
        }
        return self.append(record, allow_duplicate=True)
