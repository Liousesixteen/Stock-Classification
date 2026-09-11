# ── a-stock-data skill Makefile ──
# 所有命令都通过 .venv/bin/python 执行，不依赖系统 Python 环境

ROOT := $(dir $(realpath $(lastword $(MAKEFILE_LIST))))
PY   := $(ROOT).venv/bin/python
PIP  := $(ROOT).venv/bin/pip
REQ  := $(ROOT)requirements.txt

.PHONY: help venv install clean test-imports shell

help: ## 显示帮助
	@echo "用法: make <目标>"
	@echo ""
	@echo "环境管理:"
	@echo "  make venv          创建 .venv 虚拟环境"
	@echo "  make install       安装/更新依赖"
	@echo "  make clean         删除 .venv"
	@echo ""
	@echo "验证:"
	@echo "  make test-imports  验证所有依赖可导入"
	@echo "  make shell         进入 venv 的 Python REPL"
	@echo ""
	@echo "注意: 所有 Python 执行都经过 .venv/bin/python，不依赖系统 Python"

venv: ## 创建虚拟环境
	python3 -m venv .venv
	$(PIP) install --upgrade pip

install: venv ## 安装/更新依赖
	$(PIP) install -r $(REQ)

clean: ## 删除虚拟环境
	rm -rf .venv

test-imports: ## 验证依赖可导入
	@echo "验证依赖导入..."
	@$(PY) -c "import mootdx; print('✅ mootdx:', mootdx.__version__)" || echo "❌ mootdx"
	@$(PY) -c "import requests; print('✅ requests')" || echo "❌ requests"
	@$(PY) -c "import pandas; print('✅ pandas:', pandas.__version__)" || echo "❌ pandas"
	@$(PY) -c "import stockstats; print('✅ stockstats')" || echo "❌ stockstats"
	@$(PY) -c "import yfinance; print('✅ yfinance:', yfinance.__version__)" || echo "❌ yfinance"
	@$(PY) -c "import akshare; print('✅ akshare:', akshare.__version__)" || echo "❌ akshare"
	@$(PY) -c "import efinance; print('✅ efinance')" || echo "❌ efinance"
	@$(PY) -c "import tushare; print('✅ tushare:', tushare.__version__)" || echo "❌ tushare"
	@$(PY) -c "import baostock; print('✅ baostock')" || echo "❌ baostock"
	@$(PY) -c "import pytdx; print('✅ pytdx')" || echo "❌ pytdx"
	@$(PY) -c "import longport; print('✅ longport')" || echo "❌ longport"
	@echo "── 全部验证完成 ──"

shell: ## 进入 Python REPL
	$(PY)
