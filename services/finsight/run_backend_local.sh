#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

export PATH="$PROJECT_DIR/.tools/bin:$PROJECT_DIR/.venv/bin:$PATH"
export PLAYWRIGHT_BROWSERS_PATH="$PROJECT_DIR/.playwright-browsers"
export CRAWL4_AI_BASE_DIRECTORY="$PROJECT_DIR"
export XDG_CACHE_HOME="$PROJECT_DIR/.cache"
export MPLCONFIGDIR="$PROJECT_DIR/.cache/matplotlib"
export HF_HOME="$PROJECT_DIR/.cache/huggingface"
export NLTK_DATA="$PROJECT_DIR/.cache/nltk_data"

cd "$PROJECT_DIR/demo/backend"
exec "$PROJECT_DIR/.venv/bin/python" -m uvicorn app:app --host 127.0.0.1 --port 8000 "$@"
