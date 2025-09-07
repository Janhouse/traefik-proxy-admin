FROM node:23-alpine AS base
RUN apk add --update --no-cache git wget postgresql15-client \
  && rm -rf /var/cache/apk/*

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm i --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/public

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm && \
    pnpm build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/.next/standalone/server.js ./
COPY --from=builder /app/.next/standalone/node_modules ./node_modules
COPY --from=builder /app/.next/standalone/.next ./.next
COPY --from=builder /app/.next/static ./.next/static

COPY --from=builder /app/.next/BUILD_ID ./.next/BUILD_ID

COPY ./drizzle/migrations/*.sql ./drizzle/
COPY ./entrypoint.sh ./

RUN mkdir -p /app/.next/cache && chown nextjs:nodejs /app/.next/cache

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK  --interval=10s --timeout=5s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]

CMD ["node", "server.js"]
