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
ARG NEXT_PUBLIC_STRIPE_PRICE_PERSONAL=
ENV NEXT_PUBLIC_STRIPE_PRICE_PERSONAL=$NEXT_PUBLIC_STRIPE_PRICE_PERSONAL
ARG NEXT_PUBLIC_STRIPE_PRICE_CLUB=
ENV NEXT_PUBLIC_STRIPE_PRICE_CLUB=$NEXT_PUBLIC_STRIPE_PRICE_CLUB

COPY apps/web/ ./apps/web/
COPY packages/ ./packages/
COPY version.txt ./version.txt
RUN cd apps/web && npx next build

# --- Runtime image ---
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app/apps/web

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web/package.json ./
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/version.txt /app/version.txt

EXPOSE 3001
CMD ["/app/node_modules/.bin/next", "start", "-p", "3001"]
