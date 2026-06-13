# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-bookworm AS build
WORKDIR /app
RUN corepack enable

# Install deps (cached on lockfile) — native modules (better-sqlite3/argon2/sharp) compile here.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN pnpm -F @akpoker/shared build \
 && pnpm -F @akpoker/engine build \
 && pnpm -F @akpoker/server build \
 && pnpm -F @akpoker/web build

# ── Runtime stage ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    SERVE_WEB=true \
    WEB_DIST=/app/packages/web/dist \
    DB_PATH=/data/akpoker.sqlite \
    DATA_DIR=/data \
    AVATAR_DIR=/data/avatars \
    HOST=0.0.0.0 \
    PORT=3001

# Copy installed deps + built artifacts (native .node binaries are glibc-compatible).
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/engine/dist ./packages/engine/dist
COPY --from=build /app/packages/engine/package.json ./packages/engine/package.json
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/web/dist ./packages/web/dist

VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3001/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "packages/server/dist/index.js"]
