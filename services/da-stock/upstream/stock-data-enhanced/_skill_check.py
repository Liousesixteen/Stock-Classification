"""
a-stock-data skill 运行时环境校验。
在 skill 相关脚本/模块中调用 ensure_venv() 确保使用正确的虚拟环境。
"""

import sys
import os
from pathlib import Path

_SKILL_ROOT = Path(__file__).resolve().parent
_VENV_PATH = _SKILL_ROOT / ".venv"


def ensure_venv():
    """确保当前 Python 解释器在项目的 .venv 中，否则报错退出。"""
    exe = os.path.abspath(sys.executable)
    venv = str(_VENV_PATH.resolve())
    if not exe.startswith(venv) and not os.environ.get("VIRTUAL_ENV", "").startswith(venv):
        sys.stderr.write(
            f"❌ venv 校验失败！\n"
            f"   当前解释器: {exe}\n"
            f"   期望路径前缀: {venv}\n"
            f"   请使用: {_SKILL_ROOT / '.venv' / 'bin' / 'python'}\n"
            f"   或启动器: {_SKILL_ROOT / 'bin' / 'run_skill'}\n"
        )
        sys.exit(3)
    return True
