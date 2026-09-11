@echo off
cd /d "%~dp0"
if "%RICH_USER%"=="" echo RICH_USER/RICH_PASSWORD 未设置：服务将只信任本机回环访问。
python server.py

