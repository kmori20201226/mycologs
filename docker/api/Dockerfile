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
# Must stay BELOW the container's mem_limit where one is set (business-sandbox
# sets 512m), or the cap does nothing: V8 would not feel pressure until a level
# Docker never lets it reach, so it would keep growing instead of collecting and
# be killed mid-request rather than recovering.
#
# The floor is set by startup, not by request handling: the CMD below runs the
# API through ts-node, which compiles the whole project in-process before it
# serves anything. Measured cost of that compile alone:
#
#     before importing app.ts   heap 306 MB
#     after                     heap 481 MB     <- 94% of a 512 MB cap
#
# So 512 left 31 MB for actual work, and a single GET /species (+44 MB, 11,513
# rows) aborted the process — taking the API down for every user, since the
# public /taxonomy page calls it on load. 192m and 384m could not even boot.
#
# 1024 is headroom on the 2 GB host, not a fix. The fix is to stop shipping the
# TypeScript compiler into production: add outDir + a build script to apps/api,
# compile in the builder stage, and change the CMD below to `node dist/server.js`.
# That deletes 481 MB of runtime overhead outright. It is not a drop-in — the
# generated Prisma client path, __dirname-relative lookups (UPLOADS_DIR in
# ai-identify.ts) and the scripts/ entry points that run via ts-node all need
# checking — which is why it is written down here rather than done in passing.
#
# business-sandbox/docker-compose.yml overrides this via API_NODE_OPTIONS so the
# deployed value can be retuned without a rebuild; keep the two in step.
ENV NODE_OPTIONS="--max-old-space-size=1024"

CMD ["npx", "ts-node", "apps/api/src/server.ts"]
