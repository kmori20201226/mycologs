FROM node:22-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json tsconfig.base.json tsconfig.json prisma.config.ts ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
RUN npm ci

# Copy source and generate Prisma client
COPY prisma/ ./prisma/
COPY scripts/ ./scripts/
COPY apps/api/ ./apps/api/
COPY packages/ ./packages/
RUN npx prisma generate

EXPOSE 3000

# Cap the V8 heap so a memory spike produces a clean OOM exit (and an
# `unless-stopped` restart) instead of a runaway process the host OOM-kills.
#
# Must stay BELOW the container's mem_limit (320m in business-sandbox), or the
# cap does nothing: V8 would not feel pressure until 512 MB — a level Docker
# never lets it reach — so it would keep growing instead of collecting, and be
# killed mid-request rather than recovering. 192m leaves room for the rest of
# RSS: the Node baseline plus sharp/libvips, which allocates natively and is
# not counted against this cap.
ENV NODE_OPTIONS="--max-old-space-size=192"

CMD ["npx", "ts-node", "apps/api/src/server.ts"]
