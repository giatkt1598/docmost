# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Docmost is an open-source collaborative wiki (real-time editing, spaces, permissions, comments, page history, search). It is a pnpm + Nx monorepo:

- `apps/server` — NestJS (Fastify adapter) API, WebSocket gateway, and Yjs/Hocuspocus collaboration server
- `apps/client` — React + Vite SPA (Mantine UI, TanStack Query, Jotai, Tiptap editor)
- `packages/editor-ext` — shared Tiptap extensions/node schemas used by **both** client and server (server needs the same schema to load, transform, export, and import ProseMirror/Yjs documents)
- `packages/base-formula` — formula engine for the "bases" (database/table) feature, with separate `./client` and `./server` entry points
- Enterprise code lives in `apps/server/src/ee` (a git submodule — may be empty in a checkout), `apps/client/src/ee`, and `packages/ee`. These are under the Docmost Enterprise license, not AGPL.

## Commands

Run from the repo root unless noted. Config is read from the root `.env` (copy `.env.example`; requires Postgres and Redis).

```bash
pnpm install
pnpm dev                 # client (vite) + server (nest --watch) concurrently
pnpm client:dev
pnpm server:dev          # nx builds dependent packages (editor-ext etc.) first
pnpm build               # nx run-many -t build
pnpm editor-ext:build    # rebuild shared editor package (server consumes its dist/)
pnpm collab:dev          # standalone collab process (runs built dist/; optional)
pnpm email:dev           # preview transactional emails (react-email) on :5019
```

Server (`cd apps/server`):

```bash
pnpm test                                   # jest, *.spec.ts under src/
pnpm test -- src/core/page/services/page.service.spec.ts   # single file
pnpm test -- -t "test name"                 # single test by name
pnpm test:e2e
pnpm lint                                   # eslint --fix
pnpm migration:create <name>                # new Kysely migration in src/database/migrations
pnpm migration:latest | migration:up | migration:down
pnpm migration:codegen                      # regenerate src/database/types/db.d.ts from the live DB
```

Client (`cd apps/client`):

```bash
pnpm test                       # vitest run
pnpm vitest run path/to/file    # single file
pnpm lint
pnpm build                      # tsc && vite build (type errors fail the build)
```

## Server architecture

- **Entry points**: `src/main.ts` boots the main app with global prefix `/api` (a few public routes like `share/...`, `docs/...`, `mcp` are excluded). `src/collaboration/server/collab-main.ts` can run collaboration as a separate process; otherwise `CollaborationModule` attaches the Hocuspocus WebSocket handler at `/collab` on the main HTTP server.
- **Layout**: `src/core/*` are domain modules (page, space, workspace, auth, comment, share, group, …), each with controller/service/dto. `src/integrations/*` are infrastructure (storage drivers local/s3/azure, mail, BullMQ queues, Redis, export/import, environment config, telemetry). `src/ws` is the Socket.IO gateway (Redis adapter) for non-document realtime events such as tree updates. `src/collaboration` holds Hocuspocus extensions (authentication, persistence to Postgres, Redis sync) and history processing.
- **API style**: controllers are almost entirely `@Post(...)` RPC-style endpoints with DTO bodies validated by `class-validator`. A global `TransformHttpResponseInterceptor` wraps responses as `{ data, success, status }` (opt out with the skip-transform decorator); the client's axios interceptor unwraps `response.data`.
- **Database**: Postgres via **Kysely** (no ORM). Data access goes through repositories in `src/database/repos/*` (`@InjectKysely()`), using `dbOrTx`/`executeTx` from `database/utils.ts` to optionally participate in a transaction passed in as `trx`. Entity types (`Page`, `InsertablePage`, `UpdatablePage`, …) come from `@docmost/db/types/entity.types`, derived from the generated `db.d.ts` — after adding a migration, run codegen and add entity types. Migrations are timestamped TS files (`YYYYMMDDTHHMMSS-name.ts`). Pagination helpers live in `database/pagination` (cursor-based).
- **Authorization**: CASL abilities in `src/core/casl/abilities` — `WorkspaceAbilityFactory` and `SpaceAbilityFactory` (space roles via space membership, including group membership). Page-level access is in `core/page/page-access`. Check abilities in controllers before calling services.
- **Path aliases**: `@docmost/db/*` → `src/database/*`, `@docmost/transactional/*` → `src/integrations/transactional/*`, `@docmost/ee/*` → `src/ee/*`.
- Domain events go through `EventEmitter2` (`common/events/event.contants.ts`); background work (backlinks, exports, etc.) uses BullMQ queues defined in `integrations/queue`.

## Client architecture

- Code is organized by `src/features/<domain>/` with a consistent split: `services/` (axios calls via `@/lib/api-client`), `queries/` (TanStack Query hooks wrapping services), `components/`, `hooks/`, `atoms/` (Jotai), `types/`. Route-level components are in `src/pages`. Import alias `@` → `src/`.
- The editor (`features/editor`) uses Tiptap with extensions from `@docmost/editor-ext`; collaborative documents sync over Hocuspocus to `/collab` (or `COLLAB_URL`). When adding a new node/mark, define the schema in `packages/editor-ext` so the server can parse it too, and add the React node view in the client.
- Env values are injected at build time through `vite.config.ts` `define` (`process.env.*` read from the root `.env`) and at runtime via config helpers in `src/lib/config.ts`.
- i18n: react-i18next with JSON files in `apps/client/public/locales/<lang>/translation.json`. Add new strings to `en-US`; other locales are synced via Crowdin (`crowdin.yml`), so don't hand-edit them.

## Fork-specific rules

This checkout is a fork that runs Bases/Kanban/Templates without an Enterprise subscription.

- **Never edit** `apps/client/src/ee`, `apps/server/src/ee`, or `packages/ee`. If a fix seems to need it, work from outside first: server logic in `apps/server/src/core/base`, client workarounds in `apps/client/src/features/base-tools` (e.g. query-cache guards, global CSS overrides), or props the EE components already expose. Ask before touching `ee/` as a last resort.
- **Bases/Kanban are a clean-room rewrite** in `apps/client/src/features/base` and `apps/server/src/core/base` (own formula engine in `core/base/engine/formula/`). Never import from `@/ee/base` or `@docmost/base-formula`, and never copy code from them — `packages/base-formula` and `ee/base` are under the Enterprise license.
- **Upstream sync**: merge release tags into `main` with `git merge --no-ff <tag>` (fetch by upstream URL; `origin` is the fork). Conflicts appear only where upstream edits core files the fork changed. Add vi-VN translations for new en-US keys.
- On Windows here, `pnpm.exe` may be blocked; use `corepack pnpm`. Verify merges/installs in a throwaway `git worktree` with a short path, not the main checkout (dev servers may be running on it).
