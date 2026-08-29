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
# serves anything. 192m aborted there ("Reached heap limit" ~4s in). Leave room
# above that for sharp/libvips too, which allocates natively and is not counted
# against this cap.
#
# business-sandbox/docker-compose.yml overrides this via API_NODE_OPTIONS so the
# deployed value can be retuned without a rebuild; keep the two in step.
ENV NODE_OPTIONS="--max-old-space-size=384"

CMD ["npx", "ts-node", "apps/api/src/server.ts"]
