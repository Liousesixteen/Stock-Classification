#!/usr/bin/env python3
"""Create immutable candidate/stable source snapshots without private/runtime data."""

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {"private", "rich-state", ".runtime", "releases", "__pycache__", ".dash_state.json"}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 128), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("channel", choices=["candidate", "stable"])
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = ROOT / "releases" / args.channel / stamp
    if target.exists():
        raise SystemExit("snapshot already exists")
    target.mkdir(parents=True)
    copied = []
    for source in sorted(ROOT.rglob("*")):
        if not source.is_file() or any(part in EXCLUDED for part in source.relative_to(ROOT).parts):
            continue
        rel = source.relative_to(ROOT)
        destination = target / rel
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        copied.append(rel)
    checksums = {str(rel): digest(target / rel) for rel in copied if rel.name != "SHA256SUMS.json"}
    (target / "SHA256SUMS.json").write_text(json.dumps(checksums, indent=2, ensure_ascii=False), encoding="utf-8")
    verification = {
        "channel": args.channel,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "files": len(checksums),
        "private_data_included": False,
        "program_only_rollback": True,
    }
    (target / "VERIFICATION.json").write_text(json.dumps(verification, indent=2, ensure_ascii=False), encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()

