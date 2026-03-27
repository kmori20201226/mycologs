# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mycologs is a mushroom identification platform. Users post photos of mushrooms, other users propose species identifications, and a weighted vote system calculates confidence scores for each identification.

## Commands

### Development

```bash
# Start PostgreSQL (required before running API)
npm run db:up

# Run database migrations
npm run migrate

# Start API (Fastify, port 3000)
npm run dev

# Start frontend (Next.js)
npm run dev:web
```

### Database

```bash
npm run do-migrate        # Run prisma migrate dev (interactive)
npm run prisma:gen        # Regenerate Prisma client after schema changes
npm run db:down           # Stop PostgreSQL container
```

### Testing

Tests hit a real database — ensure `db:up` and `migrate` have been run first.

```bash
npm run test              # Run all test suites sequentially
npm run test:users        # Run a single test suite
npm run test:posts
npm run test:identifications
npm run test:votes
# etc. for: clubs, roles, oauth-accounts, shapes, families, genera, species, events, followups, media
```

Tests use `node:test` with `app.inject()` — no mocking, no Jest runner.

### Build

```bash
npm run build             # Build all workspaces
```

## Architecture

### Monorepo Structure

```
apps/api/     - Fastify 5 REST API (TypeScript, CommonJS)
apps/web/     - Next.js 16 frontend (React 19, Tailwind CSS 4)
packages/types/ - Shared TypeScript interfaces
prisma/       - Schema and migrations
generated/prisma/ - Generated Prisma client (do not edit)
docker/postgres/ - Docker Compose for PostgreSQL 18
```

### API (`apps/api/`)

**Entry points**: `src/server.ts` starts the server; `src/app.ts` (`buildApp()`) registers all plugins and routes — also used directly in tests.

**Plugin system**: `src/plugins/db.ts` registers Prisma as `fastify.prisma` using `fastify-plugin`. All route handlers access the database via `fastify.prisma`.

**Routes**: One file per entity in `src/routes/`. Each route file exports a Fastify plugin. JSON Schema validation is defined inline or in `src/schemas/`.

**14 entities**: users, clubs, roles, oauth-accounts, shapes, families, genera, species, events, posts, followups, identifications, votes, media.

**Prisma client** is generated to `generated/prisma/` (not `node_modules`). Import path: `'../../../../generated/prisma/client'`.

### Domain Logic

**Taxonomy hierarchy**: Shape → Family → Genus → Species (each level cascades on delete)

**Identification flow**: A `Post` receives `Identification` proposals (user + species). Other users cast `Vote`s with a `probability` float. Each user can only vote once per post (`@@unique([postId, userId])`). Confidence is calculated from votes weighted by `user.voteWeight`.

**Soft deletes**: `Species` and `Media` have a `deletedAt` field — query these models with `deletedAt: null` filters.

### Database

- PostgreSQL 18 via Docker; connection string in `.env` as `DATABASE_URL`
- Prisma 7 with `@prisma/adapter-pg` (driver adapter pattern, not traditional connection pooling)
- All DB table names are `snake_case` (`@@map`); Prisma model fields are `camelCase`

### Frontend (`apps/web/`)

Next.js 16 with React 19. **This version has breaking changes** — APIs, conventions, and file structure may differ from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing frontend code.

API base URL is configured via `NEXT_PUBLIC_API_URL` env var (defaults to `http://localhost:3000`). The typed API client is at `apps/web/src/lib/api.ts`.
