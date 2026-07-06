# A 股产业链分类工作台

本项目是一个本地网页应用，用于维护 A 股产业链细分分类、公司关系、证据来源和研究备注。

## 本地启动

```bash
npm install
npm run dev
```

打开 http://localhost:3000。

## 验证

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## 数据

本地 SQLite 文件保存在 `data/stock-classification.sqlite`。数据库文件不会提交到 git。
