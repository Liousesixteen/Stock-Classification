#!/bin/zsh
set -eu
SCRIPT_DIR=${0:A:h}
cd "$SCRIPT_DIR"
if [[ -z "${RICH_USER:-}" || -z "${RICH_PASSWORD:-}" ]]; then
  echo "未设置 RICH_USER/RICH_PASSWORD：服务将只信任本机回环访问。"
fi
exec /usr/bin/env python3 server.py

