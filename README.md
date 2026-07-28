# Book Store API

A REST API for a chess-bookstore catalog — books and authors with full-text search, pagination, and sorting — plus a complete authentication and authorization stack, transactional email, and background job processing.

Built with **Bun**, **Express 5**, **TypeScript**, **Drizzle ORM**, **PostgreSQL**, and **Zod**.

> Building notes and the reasoning behind the design decisions live in [Note.md](Note.md).

## Features

- **Catalog** — CRUD for books and authors, with title search (Postgres trigram index), pagination, sorting, and soft delete.
- **Auth** — signup, login, JWT **access + refresh tokens** (rotation + reuse detection), logout, and password reset by email. Tokens work via `Authorization: Bearer` **or** httpOnly cookies (web + mobile friendly).
- **Authorization** — role-based (`admin`, `publisher`, `user`) plus ownership checks (publishers manage only what they created).
- **Users** — profile, self-or-admin updates, account deactivation/reactivation, admin role management.
- **Orders** — transactional checkout with concurrency-safe stock decrement and price snapshots, order history, cancellation with restock, and admin status transitions.
- **Reviews & ratings** — verified-purchase reviews (one per user per book); each book keeps a denormalized average rating + count, recomputed transactionally on every review change.
- **Background work** — password-reset and order emails sent off the request path via a **BullMQ** queue; a **node-cron** job prunes expired tokens.
- **Production hardening** — Zod-validated env, `helmet`, CORS, rate limiting, a DB-checked `/health` endpoint, and structured logging (`pino`).

## Tech Stack

| Area | Choice |
|------|--------|
| Runtime | Bun |
| Framework | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod (+ drizzle-zod) |
| Auth | jsonwebtoken, argon2id (`Bun.password`) |
| Queue / jobs | BullMQ + Redis, node-cron |
| Email | Nodemailer (SMTP) |
| Logging | pino / pino-http |

## Architecture

Two processes share Postgres and Redis:

```
API (index.ts)        enqueues jobs ─┐
  HTTP, auth, CRUD                   ▼
                                  Redis  ── Worker (worker.ts)
                                            • BullMQ consumer (emails)
                                            • node-cron (token cleanup)
```

## Prerequisites

- [Bun](https://bun.sh) `>= 1.2`
- [Docker](https://www.docker.com/) (for PostgreSQL + Redis)

## Getting Started

```bash
# 1. install dependencies
bun install

# 2. start PostgreSQL + Redis
docker compose up -d

# 3. create a .env file with the variables listed below

# 4. run migrations
bun run db:migrate

# 5. start the API and the worker (two terminals)
bun run dev            # http://localhost:8000
bun run worker
```

## Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `8000` | |
| `DATABASE_URL` | **yes** | — | e.g. `postgres://book-store:book-store@localhost:5432/book-store` |
| `JWT_SECRET` | **yes** | — | min 32 chars |
| `ACCESS_TOKEN_TTL_MINUTES` | no | `5` | access-token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | no | `7` | refresh-token lifetime |
| `RESET_TOKEN_TTL_MINUTES` | no | `30` | password-reset link lifetime |
| `REDIS_URL` | no | `redis://localhost:6379` | queue backend |
| `CLEANUP_CRON` | no | `0 3 * * *` | token-cleanup schedule |
| `CORS_ORIGIN` | no | `*` | set a specific origin when using cookies cross-site |
| `CLIENT_URL` | no | `http://localhost:8000` | base URL for the reset link |
| `EMAIL_FROM` | no | falls back to `SMTP_USER` | must be authorized by your SMTP provider |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | no | — | required to send real email |

The environment is validated at boot — a missing or malformed value fails fast with a clear message.

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | start the API with watch reload |
| `bun run worker` | start the background worker (queue + cron) |
| `bun run worker:dev` | worker with watch reload |
| `bun run db:generate` | generate a migration from schema changes |
| `bun run db:migrate` | apply pending migrations |
| `bun run db:push` | push schema directly (dev only) |
| `bun run db:studio` | open Drizzle Studio |

## API Endpoints

All domain endpoints are prefixed with **`/api/v1`** (e.g. `POST /api/v1/auth/login`); the paths below are shown relative to that. `/health` is the one exception — it lives at the root, unversioned, for uptime probes. Responses use a consistent envelope: `{ "status": "success" | "error", ... }`.

### Auth — `/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/signup` | create account (auto login) |
| POST | `/login` | log in |
| POST | `/refresh` | rotate refresh token, issue new access token |
| POST | `/logout` | revoke refresh token |
| POST | `/forgot-password` | email a reset link |
| POST | `/reset-password` | reset password with a token |

### Books — `/books`
| Method | Path | Access |
|--------|------|--------|
| GET | `/` | public — `?search=&page=&limit=&sortBy=&orderBy=` |
| GET | `/:id` | public — includes nested author |
| POST | `/` | admin, publisher |
| PATCH | `/:id` | owner or admin |
| DELETE | `/:id` | owner or admin (soft delete) |

### Authors — `/authors`
| Method | Path | Access |
|--------|------|--------|
| GET | `/` | public — paginated & sortable |
| GET | `/:id` | public |
| GET | `/:id/books` | public — paginated |
| POST | `/` | admin, publisher |
| PATCH | `/:id` | owner or admin |
| DELETE | `/:id` | owner or admin (soft delete) |

### Users — `/users` (authenticated)
| Method | Path | Access |
|--------|------|--------|
| GET | `/me` | current user |
| GET | `/:id` | authenticated |
| PATCH | `/:id` | self or admin |
| PATCH | `/:id/deactivate` | self or admin (admins can't be deactivated) |
| PATCH | `/:id/reactivate` | admin |
| PATCH | `/:id/role` | admin |

### Orders — `/orders` (authenticated)
| Method | Path | Access | Notes |
|--------|------|--------|-------|
| POST | `/` | any user | `{ items: [{ bookId, quantity }] }` — transactional, decrements stock |
| GET | `/` | own orders; **admin** all | paginated |
| GET | `/:id` | owner or admin | includes line items |
| PATCH | `/:id/cancel` | owner or admin | `pending` only; restocks |
| PATCH | `/:id/status` | admin | `pending→paid→shipped` |

### Reviews — `/books/:bookId/reviews` and `/reviews`
| Method | Path | Access | Notes |
|--------|------|--------|-------|
| POST | `/books/:bookId/reviews` | authenticated | verified purchase; one per user/book (dup → 409) |
| GET | `/books/:bookId/reviews` | public | paginated; includes reviewer name |
| PATCH | `/reviews/:id` | owner or admin | recomputes the book's rating |
| DELETE | `/reviews/:id` | owner or admin | recomputes the book's rating |

### Health — `/health`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | liveness + DB check (503 if the DB is down) |

## Project Structure

```
book-store/
├── index.ts            # API entry (HTTP server)
├── worker.ts           # background worker (BullMQ consumer + cron)
├── db/                 # Drizzle client + schema aggregation
├── drizzle/            # generated SQL migrations
├── features/           # domain modules — <feature>/{model,dto,service,controller,route}.ts
│   ├── auth/  books/  authors/  users/  orders/  health/
├── middlewares/        # authenticate, authorize, validate, error-handler, rate-limit
├── libs/               # shared helpers (env, jwt, token, password, error, logger, queue, mailer, ...)
├── jobs/               # scheduled jobs (token cleanup)
├── utils/              # email templates
├── constants/          # shared constants
├── types/              # Express type augmentation
├── docker-compose.yml  # PostgreSQL + Redis
└── Note.md             # learning notes
```
