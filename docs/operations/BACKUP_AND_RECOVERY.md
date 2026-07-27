# SQLite 备份与恢复

## 备份

应用运行时可以执行一致性在线备份：

```bash
npm run db:backup
```

脚本会先检查源数据库，再通过 SQLite Online Backup API 创建副本，复检副本，并生成同名 `.sha256` 文件。默认写入 `backups/`；可用 `STOCK_BACKUP_DIR` 指定独立磁盘。

建议：

- 每日备份，保留最近 30 天；
- 每周将至少一份备份复制到异机或对象存储；
- 备份目录不与数据库使用同一物理磁盘；
- 每月至少执行一次隔离恢复演练；
- 对象存储启用服务端加密、版本控制和最小权限。

## 恢复

恢复会替换当前数据库，执行前必须停止应用和同步调度器：

```bash
docker compose stop stock-research
npm run db:restore -- --from=/absolute/path/stock-classification-backup.sqlite --confirm
docker compose start stock-research
```

脚本会：

1. 验证待恢复备份；
2. 将当前数据库保存为带时间戳的 `pre-restore` 回滚副本；
3. 复制并再次验证恢复副本；
4. 原子替换数据库并移除旧 WAL/SHM 边车文件。

恢复后执行：

```bash
npm run ops:check
curl -u "$STOCK_APP_BASIC_AUTH_USER:$STOCK_APP_BASIC_AUTH_PASSWORD" \
  http://127.0.0.1:3001/api/health
```

再抽查公司、关系、证据、研报版本、任务队列和审计记录。若恢复验证失败，停止应用，并使用输出中的 `rollbackBackup` 按同一流程回滚。
