FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update \
  && apt-get install --yes --no-install-recommends g++ make python3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV STOCK_CLASSIFICATION_DB_PATH=/app/data/stock-classification.sqlite
ENV STOCK_BACKUP_DIR=/app/data/backups
ENV STRATEGY_ENGINE_BACKTEST_DB=/app/data/da-stock/stock_analysis.db
ENV REPORT_ENGINE_RUNS_DIR=/app/data/report-runs
ENV STOCK_BOOTSTRAP_MODE=empty
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates gosu python3 \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/data /app/backups \
  && chown -R nextjs:nodejs /app
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --chown=nextjs:nodejs --chmod=755 scripts/container-entrypoint.sh ./scripts/container-entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["./scripts/container-entrypoint.sh"]
CMD ["node", "scripts/run-workbench.mjs", "start"]
