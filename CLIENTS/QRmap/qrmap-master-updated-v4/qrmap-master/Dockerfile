# Multi-stage build. Exists from day one per docs/03-ARCHITECTURE.md §C9: every
# realistic free/cheap hosting option carries a ToS or capacity risk (Vercel
# Hobby bans commercial use, Supabase free auto-pauses), so the app must be
# able to redeploy to a plain VPS or container host in a day. This image has
# zero host-proprietary dependencies.

FROM node:22-slim AS base
# sharp needs these at runtime on slim/glibc images; libvips is what sharp
# actually links against.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time env: only PUBLIC_QR_ORIGIN and NEXT_PUBLIC_* vars are actually
# baked into client output (there is none, on the public page — see
# docs/12-KNOWN-ISSUES.md). Runtime secrets are NOT needed at build time and
# must never be passed as build args (they would end up in image layers).
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone output keeps the image small and self-contained (no node_modules
# copy needed) - see next.config.ts `output: 'standalone'`.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/src/modules/db/sql ./src/modules/db/sql

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
