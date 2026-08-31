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

# Compile TypeScript here, at image build time, so production never loads the
# compiler. Must run after `prisma generate`: the generated client is imported
# for its types and tsc cannot resolve them before it exists.
RUN npx tsc -p apps/api/tsconfig.json

EXPOSE 3000

# Cap the V8 heap so a memory spike produces a clean OOM exit (and an
# `unless-stopped` restart) instead of a runaway process the host OOM-kills.
#
# Must stay BELOW the container's mem_limit where one is set (business-sandbox
# sets 512m), or the cap does nothing: V8 would not feel pressure until a level
# Docker never lets it reach, so it would keep growing instead of collecting and
# be killed mid-request rather than recovering.
#
# Still 1024 deliberately, even though the compiled server needs a fraction of
# it. This value was sized for the ts-node process it is replacing, and lowering
# it in the same change as the CMD below would make any failure impossible to
# attribute. Measure the compiled server under real traffic first, then lower
# this and mem_limit together in their own commit.
#
# What the CMD change is worth, measured on this project:
#
#                        heap     rss
#     ts-node boot      481 MB   624 MB
#     compiled boot      31 MB   103 MB
#
# and the ts-node figure is not garbage awaiting collection — three forced full
# GCs freed 47 MB of it, leaving 454 MB live for the process lifetime, because
# ts-node holds the module registry, the output cache and the type-checker
# state. That is what production reported as "Ineffective mark-compacts near
# heap limit": V8 collecting and finding nothing to release. It is also why
# 192m and 384m could not boot at all, and why one GET /species (+44 MB) could
# abort the process.
#
# For contrast, the actual runtime dependencies are almost free: fastify, the
# Prisma client and sharp together come to 12 MB of heap. Essentially all of the
# 481 MB was compiler.
#
# business-sandbox/docker-compose.yml overrides this via API_NODE_OPTIONS so the
# deployed value can be retuned without a rebuild; keep the two in step.
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Plain node on compiled JavaScript — no TypeScript in the running process.
# --enable-source-maps keeps stack traces pointing at .ts lines (sourceMap is
# already on in apps/api/tsconfig.json).
#
# ts-node stays installed on purpose: run.sh drives seven maintenance scripts
# (seed-taxonomy, buy-credit, backup-posts, restore-posts, ...) through it via
# `docker compose exec`. Those are short-lived separate processes, so they never
# occupy the server's memory.
CMD ["node", "--enable-source-maps", "apps/api/dist/server.js"]
