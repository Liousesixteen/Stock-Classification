# Railway 小规模公测部署

本方案面向少量受邀用户：Railway 自动构建根目录 `Dockerfile`、签发 HTTPS
证书并提供公网地址，应用使用 Basic Auth 限制访问，SQLite 数据保存在持久卷中。

## 1. 创建服务

1. 登录 Railway，创建新项目并选择 **Deploy from GitHub repo**。
2. 授权并选择 `Liousesixteen/Stock-Classification` 仓库。
3. 保持根目录不变；Railway 会自动识别 `Dockerfile`。
4. 部署保持 **1 个副本**，不要开启横向扩容。

## 2. 挂载持久卷

在服务画布中添加 Volume，并把挂载路径设置为：

```text
/app/data
```

数据库、备份和运行结果都使用这个持久卷。不要把数据库文件提交到 Git。

## 3. 配置生产变量

在服务的 Variables 中至少配置：

```env
DEEPSEEK_API_KEY=<新创建、额度受限的生产 Key>
STOCK_APP_BASIC_AUTH_USER=<公测用户名>
STOCK_APP_BASIC_AUTH_PASSWORD=<至少 20 位随机密码>
STOCK_OPERATIONS_TOKEN=<至少 32 位随机令牌>
STOCK_FORCE_HTTPS=true
STOCK_BOOTSTRAP_MODE=empty
STOCK_CLASSIFICATION_DB_PATH=/app/data/stock-classification.sqlite
STOCK_BACKUP_DIR=/app/data/backups
STRATEGY_ENGINE_BACKTEST_DB=/app/data/strategy/stock_analysis.db
REPORT_ENGINE_RUNS_DIR=/app/data/report-runs
STOCK_PROFILE_SOURCE_PRIORITY=disabled
```

公测用户名和密码可以分享给受邀用户；运维令牌与 API Key 只能由管理员保管。
外部数据源应在确认授权范围后再逐项开启。

## 4. 健康检查和公网地址

在服务 Settings 中设置：

```text
Healthcheck Path: /api/health
Restart Policy: Always
```

部署成功后，在 **Networking → Public Networking** 点击 **Generate Domain**。
Railway 会生成 `https://<name>.up.railway.app` 地址并自动配置 HTTPS。首轮公测可先
使用这个地址，不必购买独立域名。

## 5. 发布验收

- 打开公网地址时出现用户名和密码提示；
- 未授权访问返回 401，授权后主页返回 200；
- `/api/health` 返回 200；
- 市场工作台可以打开且数据源时间可见；
- 重启服务后原有分类、公司、笔记和任务仍然存在；
- Railway 中只运行一个应用副本；
- 记录首批用户反馈，并定期下载 `/app/data/backups` 中的备份。

## 公测边界

Basic Auth 会阻止搜索引擎收录，这是小范围公测的预期行为。用户可以直接在浏览器
中输入或收藏网址访问。等访问控制、数据授权与依赖升级全部稳定后，再单独开放公开
页面用于搜索引擎收录。
