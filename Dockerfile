FROM node:20 as base

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9.0 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile --prod

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
# Ship the SQL migrations so the entrypoint applies pending migrations before
# the app starts. drizzle-orm v1-beta migrator scans the folder directly — no
# separate _journal.json file required. It takes an advisory lock so concurrent
# containers don't race; on failure migrate exits non-zero and the container
# restart-loops with the error.
COPY --from=builder /app/drizzle ./drizzle

EXPOSE 8866
CMD ["sh", "-c", "node dist/src/scripts/migrate.js && node dist/src/index.js"]
