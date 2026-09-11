"""SQLite-backed property graph and bitemporal state store."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Iterator, Optional

from .models import EdgeRecord, EdgeType, NodeRecord, NodeState, NodeType, canonical_json, utc_now


class SQLiteGraphStore:
    """Durable graph store using only the Python standard library."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(str(self.path), check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.execute("PRAGMA foreign_keys=ON")
        self._create_schema()

    def _create_schema(self) -> None:
        with self.transaction() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS nodes (
                    node_id TEXT PRIMARY KEY,
                    node_type TEXT NOT NULL,
                    properties_json TEXT NOT NULL,
                    state TEXT NOT NULL,
                    valid_from TEXT,
                    valid_to TEXT,
                    transaction_from TEXT NOT NULL,
                    transaction_to TEXT,
                    version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    content_hash TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_nodes_type_state ON nodes(node_type, state);
                CREATE INDEX IF NOT EXISTS idx_nodes_hash ON nodes(content_hash);

                CREATE TABLE IF NOT EXISTS node_history (
                    node_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    archived_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    PRIMARY KEY(node_id, version)
                );

                CREATE TABLE IF NOT EXISTS edges (
                    edge_id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    edge_type TEXT NOT NULL,
                    properties_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    valid_from TEXT,
                    valid_to TEXT,
                    FOREIGN KEY(source_id) REFERENCES nodes(node_id),
                    FOREIGN KEY(target_id) REFERENCES nodes(node_id)
                );
                CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id, edge_type);
                CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id, edge_type);

                CREATE TABLE IF NOT EXISTS snapshots (
                    snapshot_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    node_count INTEGER NOT NULL,
                    edge_count INTEGER NOT NULL,
                    metadata_json TEXT NOT NULL
                );
                """
            )

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            try:
                yield self._connection
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise

    @staticmethod
    def _row_to_node(row: sqlite3.Row) -> NodeRecord:
        return NodeRecord(
            node_id=row["node_id"],
            node_type=row["node_type"],
            properties=json.loads(row["properties_json"]),
            state=row["state"],
            valid_from=row["valid_from"],
            valid_to=row["valid_to"],
            transaction_from=row["transaction_from"],
            transaction_to=row["transaction_to"],
            version=row["version"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            content_hash=row["content_hash"],
        )

    @staticmethod
    def _row_to_edge(row: sqlite3.Row) -> EdgeRecord:
        return EdgeRecord(
            edge_id=row["edge_id"],
            source_id=row["source_id"],
            target_id=row["target_id"],
            edge_type=row["edge_type"],
            properties=json.loads(row["properties_json"]),
            created_at=row["created_at"],
            valid_from=row["valid_from"],
            valid_to=row["valid_to"],
        )

    def upsert_node(self, node: NodeRecord) -> str:
        existing = self.get_node(node.node_id)
        if existing and existing.content_hash == node.content_hash and existing.state == node.state:
            return "unchanged"
        if existing:
            with self.transaction() as connection:
                connection.execute(
                    "INSERT OR IGNORE INTO node_history VALUES (?, ?, ?, ?)",
                    (existing.node_id, existing.version, utc_now(), canonical_json(existing.to_dict())),
                )
            node.version = max(node.version, existing.version + 1)
            node.created_at = existing.created_at
            node.transaction_from = existing.transaction_from
            node.updated_at = utc_now()
            action = "updated"
        else:
            action = "added"
        with self.transaction() as connection:
            connection.execute(
                """
                INSERT INTO nodes (
                    node_id, node_type, properties_json, state, valid_from, valid_to,
                    transaction_from, transaction_to, version, created_at, updated_at, content_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(node_id) DO UPDATE SET
                    node_type=excluded.node_type,
                    properties_json=excluded.properties_json,
                    state=excluded.state,
                    valid_from=excluded.valid_from,
                    valid_to=excluded.valid_to,
                    transaction_to=excluded.transaction_to,
                    version=excluded.version,
                    updated_at=excluded.updated_at,
                    content_hash=excluded.content_hash
                """,
                (
                    node.node_id,
                    node.node_type.value,
                    canonical_json(node.properties),
                    node.state.value,
                    node.valid_from,
                    node.valid_to,
                    node.transaction_from,
                    node.transaction_to,
                    node.version,
                    node.created_at,
                    node.updated_at,
                    node.content_hash,
                ),
            )
        return action

    def add_edge(self, edge: EdgeRecord) -> bool:
        with self.transaction() as connection:
            cursor = connection.execute(
                """
                INSERT OR IGNORE INTO edges (
                    edge_id, source_id, target_id, edge_type, properties_json,
                    created_at, valid_from, valid_to
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    edge.edge_id,
                    edge.source_id,
                    edge.target_id,
                    edge.edge_type.value,
                    canonical_json(edge.properties),
                    edge.created_at,
                    edge.valid_from,
                    edge.valid_to,
                ),
            )
        return cursor.rowcount > 0

    def get_node(self, node_id: str) -> Optional[NodeRecord]:
        row = self._connection.execute("SELECT * FROM nodes WHERE node_id = ?", (node_id,)).fetchone()
        return self._row_to_node(row) if row else None

    def get_edge(self, edge_id: str) -> Optional[EdgeRecord]:
        row = self._connection.execute("SELECT * FROM edges WHERE edge_id = ?", (edge_id,)).fetchone()
        return self._row_to_edge(row) if row else None

    def find_nodes(
        self,
        node_type: NodeType | str | None = None,
        states: Optional[Iterable[NodeState | str]] = None,
        property_filters: Optional[dict[str, Any]] = None,
        limit: Optional[int] = None,
    ) -> list[NodeRecord]:
        clauses: list[str] = []
        params: list[Any] = []
        if node_type:
            clauses.append("node_type = ?")
            params.append(NodeType(node_type).value)
        if states:
            values = [NodeState(state).value for state in states]
            clauses.append(f"state IN ({','.join('?' for _ in values)})")
            params.extend(values)
        sql = "SELECT * FROM nodes"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY updated_at DESC"
        if limit:
            sql += " LIMIT ?"
            params.append(limit)
        rows = self._connection.execute(sql, params).fetchall()
        nodes = [self._row_to_node(row) for row in rows]
        if property_filters:
            nodes = [
                node
                for node in nodes
                if all(node.properties.get(key) == value for key, value in property_filters.items())
            ]
        return nodes[:limit] if limit else nodes

    def find_by_content_hash(self, digest: str, node_type: NodeType | str | None = None) -> list[NodeRecord]:
        params: list[Any] = [digest]
        sql = "SELECT * FROM nodes WHERE content_hash = ?"
        if node_type:
            sql += " AND node_type = ?"
            params.append(NodeType(node_type).value)
        return [self._row_to_node(row) for row in self._connection.execute(sql, params).fetchall()]

    def edges(
        self,
        node_id: Optional[str] = None,
        direction: str = "both",
        edge_types: Optional[Iterable[EdgeType | str]] = None,
    ) -> list[EdgeRecord]:
        clauses: list[str] = []
        params: list[Any] = []
        if node_id:
            if direction == "out":
                clauses.append("source_id = ?")
                params.append(node_id)
            elif direction == "in":
                clauses.append("target_id = ?")
                params.append(node_id)
            else:
                clauses.append("(source_id = ? OR target_id = ?)")
                params.extend([node_id, node_id])
        if edge_types:
            values = [EdgeType(edge_type).value for edge_type in edge_types]
            clauses.append(f"edge_type IN ({','.join('?' for _ in values)})")
            params.extend(values)
        sql = "SELECT * FROM edges"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at"
        return [self._row_to_edge(row) for row in self._connection.execute(sql, params).fetchall()]

    def update_state(self, node_id: str, state: NodeState | str, reason: str = "") -> bool:
        node = self.get_node(node_id)
        if not node:
            return False
        state = NodeState(state)
        if node.state == state and (not reason or node.properties.get("state_reason") == reason):
            return False
        node.state = state
        if reason:
            node.properties["state_reason"] = reason
        node.updated_at = utc_now()
        node.content_hash = ""
        node.__post_init__()
        self.upsert_node(node)
        return True

    def dependency_closure(
        self,
        root_ids: Iterable[str],
        edge_types: Optional[Iterable[EdgeType | str]] = None,
        max_depth: int = 12,
    ) -> list[str]:
        allowed = edge_types or (
            EdgeType.CALCULATED_FROM,
            EdgeType.USES_DATA,
            EdgeType.VISUALIZED_BY,
            EdgeType.PRODUCES,
            EdgeType.SUPPORTS_CANDIDATE,
            EdgeType.SUPPORTS_VERIFIED,
            EdgeType.DEPENDS_ON,
            EdgeType.USED_IN_SECTION,
        )
        visited = set(root_ids)
        frontier = list(root_ids)
        result: list[str] = []
        for _ in range(max_depth):
            next_frontier: list[str] = []
            for node_id in frontier:
                for edge in self.edges(node_id=node_id, direction="out", edge_types=allowed):
                    if edge.target_id not in visited:
                        visited.add(edge.target_id)
                        result.append(edge.target_id)
                        next_frontier.append(edge.target_id)
            if not next_frontier:
                break
            frontier = next_frontier
        return result

    def ancestor_closure(self, root_ids: Iterable[str], max_depth: int = 8) -> list[str]:
        visited = set(root_ids)
        frontier = list(root_ids)
        result: list[str] = []
        for _ in range(max_depth):
            next_frontier: list[str] = []
            for node_id in frontier:
                for edge in self.edges(node_id=node_id, direction="in"):
                    if edge.source_id not in visited:
                        visited.add(edge.source_id)
                        result.append(edge.source_id)
                        next_frontier.append(edge.source_id)
            if not next_frontier:
                break
            frontier = next_frontier
        return result

    def counts(self) -> tuple[int, int]:
        node_count = self._connection.execute("SELECT COUNT(*) FROM nodes").fetchone()[0]
        edge_count = self._connection.execute("SELECT COUNT(*) FROM edges").fetchone()[0]
        return int(node_count), int(edge_count)

    def create_snapshot(self, snapshot_id: str, metadata: Optional[dict[str, Any]] = None) -> None:
        node_count, edge_count = self.counts()
        with self.transaction() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO snapshots VALUES (?, ?, ?, ?, ?)",
                (snapshot_id, utc_now(), node_count, edge_count, canonical_json(metadata or {})),
            )

    def latest_snapshot_id(self) -> Optional[str]:
        row = self._connection.execute("SELECT snapshot_id FROM snapshots ORDER BY created_at DESC LIMIT 1").fetchone()
        return str(row[0]) if row else None

    def all_nodes(self) -> list[NodeRecord]:
        return [self._row_to_node(row) for row in self._connection.execute("SELECT * FROM nodes ORDER BY node_id")]

    def all_edges(self) -> list[EdgeRecord]:
        return [self._row_to_edge(row) for row in self._connection.execute("SELECT * FROM edges ORDER BY edge_id")]

    def node_history(self, node_id: str) -> list[dict[str, Any]]:
        rows = self._connection.execute(
            "SELECT payload_json FROM node_history WHERE node_id = ? ORDER BY version",
            (node_id,),
        ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def close(self) -> None:
        with self._lock:
            self._connection.close()
