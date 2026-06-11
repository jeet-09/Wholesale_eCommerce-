# syntax=docker/dockerfile:1

# --- Base -------------------------------------------------------------------
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
WORKDIR /app
# OpenSSL is required by Prisma engines.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# --- Dependencies (cached) --------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# --- Build ------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Production runtime -----------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# `prisma/seed.ts` runs via tsx and imports from ../src, so the seed needs the
# TypeScript sources + tsconfig present at runtime (the API itself uses ./dist).
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY package.json ./
# Re-generate the Prisma client for the runtime platform.
RUN npx prisma generate

EXPOSE 4000
# Apply migrations + raw SQL constraints (idempotent), then start the API.
# Seeding is intentionally NOT run here (do it explicitly: `npm run db:seed`).
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db execute --file ./prisma/sql/constraints.sql --schema ./prisma/schema.prisma && node dist/server.js"]
