# syntax=docker/dockerfile:1

# --- Base -------------------------------------------------------------------
FROM node:22-slim AS base
WORKDIR /app

# --- Dependencies -----------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# --- Build ------------------------------------------------------------------
FROM base AS build
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Production runtime -----------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
