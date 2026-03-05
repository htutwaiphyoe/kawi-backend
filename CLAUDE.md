# Kawi Backend — Project Guide

Real backend for **Kawi**, started from a learning project ("book-store"). Stack: **Bun + Express 5 + TypeScript + Drizzle ORM + PostgreSQL + Redis + Zod**. Two processes: the **API** (`index.ts`) and a **worker** (`worker.ts`). Deep reference lives in `README.md` (setup + endpoints) and `Note.md` (design rationale) — read those for detail; this file is the operating contract.

## Architecture — every feature is 5 layers

Each domain lives in `features/<name>/` as five files, each with one job:

- `<name>.model.ts` — Drizzle table + inferred types **only**
- `<name>.dto.ts` — Zod schemas + request/query types (`…Body`, `…Query`)
- `<name>.service.ts` — DB operations + business rules; throws `ApiError`; **no `req`/`res`**
- `<name>.controller.ts` — read `req` → call service → shape `res`; **no SQL**
- `<name>.route.ts` — endpoints + middleware

Hard rules: **the controller never touches the database; the service never touches `req`/`res`.** Cookies touch `res`, so cookie helpers stay in the controller (auth) while token generation/storage lives in the service.

## Conventions (follow these)

- **Naming:** `getX` — never `listX`. DTO types suffixed `…Body` / `…Query`. Service param that carries the validated body is named `body`.
- **A blank line between each logical step** inside a function body (input → call → response), not compact statement-after-statement.
- **Minimal / no code comments** — clean self-documenting code; explain reasoning in chat, not inline.
- **Response envelope** is always `{ status: "success" | "error", ... }`.
- **Errors:** services `throw ApiError.notFound()/forbidden()/badRequest()/...`; the central `errorHandler` maps them to HTTP (plus Postgres codes and 4xx passthrough). Don't build ad-hoc error responses.

## Feature boundaries

- **One-directional dependencies.** Data-layer FKs go `reviews → books → authors`; `auth ↔ users` is mutual and acceptable. **No feature reaches backwards into another's tables** — expose a service function instead (e.g. `authService.revokeUserRefreshTokens`, `booksService.getBooksByAuthor`).
- **`app.ts` is the composition root** — it mounts everything under **`/api/v1`** and composes nested URLs (`/api/v1/authors/:id/books`, `/api/v1/books/:bookId/reviews`). `/health` stays at the root, unversioned.

## Auth model

Short-lived **access JWT** (~10 min, payload `{ sub, role }`) + long-lived **refresh token** (opaque, SHA-256 hashed in DB, rotated on use with **reuse detection**). Dual transport: tokens in the body **and** httpOnly cookies; `authenticate` reads `Authorization: Bearer` **or** the cookie. Role travels in the token (no per-request user lookup); `refresh` re-reads the live role from the DB. Password reset = emailed hashed one-time token; RBAC via `authorize(...roles)` + ownership checks in services.

## Background work

The **worker** (`worker.ts`) runs the BullMQ email consumer + a node-cron token-cleanup job. The API only **enqueues** (fire-and-forget after the DB commit). Email via nodemailer/SMTP; templates in `utils/mail.ts`.

## Running

- **Dev (hot reload):** `docker compose up -d postgres redis`, then `bun run dev` + `bun run worker` (two terminals).
- **Full stack, one command:** `docker compose up --build` (order: postgres → redis → `migrate` → api + worker).
- **Inspect DB:** `bun run db:studio`, or `psql` to `localhost:5432`.
- **Migrations:** `bun run db:generate` / `db:migrate`. ⚠️ drizzle-kit (RC) sometimes omits `CREATE TYPE` for new enums and `CREATE EXTENSION` — always eyeball the generated SQL and hand-add if missing.
- **Tests:** `bun run test` — Bun test + supertest; needs a separate test DB + Redis db index; request paths are written with the explicit `/api/v1` prefix.

## Data safety

**Never bulk-delete or reset DB rows.** In test cleanup, scope every delete/update to the exact rows created that run (by unique test email/ids) — no blanket `DELETE`/`UPDATE`.

## Current state

Full API implemented and tested: **books, authors, users, auth, orders, reviews** — all on the 5-layer pattern, versioned under `/api/v1`. ~51 tests (Bun + supertest). Dockerized (`Dockerfile` + compose: api, worker, migrate, postgres, redis, pg volume). Production hardening in place: env validation, helmet, CORS, rate limiting, `/health` DB check, structured logging (pino), graceful shutdown.

## Next up (roadmap)

1. **Frontend:** separate `kawi-web` project.
2. **Deploy:** provider still undecided — build the container image, run the api and worker as separate services against managed Postgres and Redis, env from the platform's secret store, SMTP for email.
3. **CI** (GitHub Actions: typecheck + tests with pg/redis services), **OpenAPI/Swagger** docs, **seed script**.

## Commit style

Conventional commits (`feat`/`fix`/`refactor`/`chore`/`docs`/`test`), scoped. This is a real repo — use **normal commit dates** (the back-dating workflow was specific to the learning monorepo, not here).
