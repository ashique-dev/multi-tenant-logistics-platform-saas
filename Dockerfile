# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=22

# ---- deps: full dependency tree (dev + build) --------------------------------
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---- dev: used by docker-compose.dev.yml (watch mode, source bind-mounted) ---
FROM deps AS dev
ENV NODE_ENV=development
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
RUN chown -R node:node /app/dist
USER node
# Compose overrides the command per process type (api | worker | relay).
CMD ["sh", "-c", "npx tsc -p tsconfig.build.json --watch --preserveWatchOutput & exec node --watch dist/entrypoints/${APP_ENTRY:-api}.js"]

# ---- build: compile TypeScript ----------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- prod-deps: production dependencies only --------------------------------
FROM node:${NODE_VERSION}-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev && npm cache clean --force

# ---- runtime: minimal, non-root ---------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production \
    HEALTH_PORT=3000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
# Liveness only: never depends on Postgres/Redis/Kafka/RabbitMQ.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.HEALTH_PORT+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run with `init: true` (compose) so signals are forwarded and zombies reaped.
CMD ["node", "dist/entrypoints/api.js"]
