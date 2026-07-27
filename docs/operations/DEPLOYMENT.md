# 生产部署与发布清单

## 安全前置条件

1. 在 DeepSeek 控制台吊销所有曾暴露的 Key，创建用途单一、额度受限的新 Key。
2. 将新 Key 只写入服务器密钥管理或未纳入 Git 的 `.env.production`。
3. 生成强随机的 `STOCK_APP_BASIC_AUTH_PASSWORD` 和 `STOCK_OPERATIONS_TOKEN`。
4. 在正式域名和 HTTPS 反向代理后设置 `STOCK_FORCE_HTTPS=true`。
5. 执行 `npm run security:check`，确认 Git 跟踪文件没有疑似密钥。

如果 `STOCK_APP_BASIC_AUTH_USER` 与密码同时为空，系统保持本地开发模式；生产环境必须同时配置。只配置其中一项时，服务会返回 503，避免误以为已经受保护。

## Docker 部署

```bash
cp .env.example .env.production
# 编辑 .env.production，填入生产密钥与访问控制
docker compose build
docker compose up -d
curl -u "$STOCK_APP_BASIC_AUTH_USER:$STOCK_APP_BASIC_AUTH_PASSWORD" \
  http://127.0.0.1:3001/api/health
```

容器仅绑定宿主机 `127.0.0.1:3001`。公网访问应通过带 TLS 的 Nginx、Caddy 或受控内网网关转发，不要直接暴露该端口。

## 非容器部署

```bash
npm ci
npm run security:check
NODE_ENV=production npm run ops:check
npm run build
HOSTNAME=127.0.0.1 PORT=3001 npm run start
```

项目使用 Next.js standalone 产物；`postbuild` 会自动把静态资源和可选的 `public/` 目录装配到可运行目录。建议以专用非特权系统用户运行，并将 `data/` 与 `backups/` 置于只有该用户可读写的持久磁盘。

## 健康、指标与审计

- `GET /api/health`：公开最小存活/就绪状态，不返回路径或敏感配置。
- `GET /api/health?details=1`：携带 `Authorization: Bearer $STOCK_OPERATIONS_TOKEN` 后返回队列、指标和最近审计事件。
- `GET /api/metrics`：携带同一运维令牌返回进程内 API 指标。
- `operation_audit_events`：保存 AI 研究、研报、导入、同步、关系、分类、任务与成果状态等关键操作；不保存请求正文、Cookie、密钥或 Authorization。
- 所有响应带 `X-Request-Id`；问题排查时应以该 ID 串联反向代理日志和审计记录。

进程内限流适合当前单实例 SQLite 部署。扩展到多实例前，必须将限流和指标迁移到共享网关/Redis，并确保 SQLite 只由单写实例持有。

## 发布检查

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run security:check
NODE_ENV=production npm run ops:check
npm run db:backup
```

发布后确认：

- `/api/health` 返回 200；
- 错误率和 AI 接口耗时没有异常跃升；
- 同步队列不存在持续增长的 `failed`/`partial`；
- 最新备份能够通过 `quick_check`；
- Basic Auth 未被反向代理绕过；
- 数据展示范围符合数据源授权矩阵。
