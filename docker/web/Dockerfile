FROM node:22-slim AS builder
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
RUN npm ci

# NEXT_PUBLIC_* vars are baked in at build time
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG INTERNAL_API_URL=
ENV INTERNAL_API_URL=$INTERNAL_API_URL
ARG NEXT_PUBLIC_STRIPE_PRICE_PERSONAL=
ENV NEXT_PUBLIC_STRIPE_PRICE_PERSONAL=$NEXT_PUBLIC_STRIPE_PRICE_PERSONAL
ARG NEXT_PUBLIC_STRIPE_PRICE_CLUB=
ENV NEXT_PUBLIC_STRIPE_PRICE_CLUB=$NEXT_PUBLIC_STRIPE_PRICE_CLUB

ARG GIT_HASH=unknown
ARG GIT_BRANCH=unknown

COPY apps/web/ ./apps/web/
COPY packages/ ./packages/
COPY CHANGELOG.md ./CHANGELOG.md
RUN printf '%s\n%s\n' "$GIT_HASH" "$GIT_BRANCH" > /app/git-info.txt
RUN cd apps/web && npx next build

# --- Runtime image ---
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app/apps/web

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web/package.json ./
# Required at runtime, not just at build time. `next build` bakes rewrites() into
# .next/routes-manifest.json, so proxying works without this file — but
# experimental.proxyTimeout is read by `next start` when it loads the config, and
# with no config present it silently falls back to the 30s default
# (proxy-request.js: `proxyTimeout || 30000`). AI identification takes ~31-34s on
# this host, so it landed just past the cutoff and the socket was reset.
COPY --from=builder /app/apps/web/next.config.ts ./
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/CHANGELOG.md /app/CHANGELOG.md
COPY --from=builder /app/git-info.txt /app/git-info.txt

EXPOSE 3001
CMD ["/app/node_modules/.bin/next", "start", "-p", "3001"]
