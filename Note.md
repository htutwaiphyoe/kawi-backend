# Book Store — Learning Notes

These are the notes I took while building a small chess-bookstore API with **Bun, Express 5, Drizzle ORM, PostgreSQL, and Zod**. They're written to my future self: each section explains a concept in plain terms and then calls out the specific mistakes that actually cost me time, so I don't repeat them.

If you're skimming, the **"Watch out"** paragraphs are the parts worth reading twice.

---

## 1. TypeScript & tsconfig

TypeScript won't know about Node's built-in globals (`require`, `process`, `Buffer`) unless you tell it to include the Node type definitions. The setting for that is `types`, and if it's set to an empty array, TypeScript ignores `@types/node` even when it's installed — which shows up as the confusing error *"Cannot find name 'require'."* The fix is simply:

```json
"types": ["node"]
```

For import paths, the modern setup is `moduleResolution: "bundler"` together with `module: "preserve"`. This matches how Bun (and bundlers like Vite/esbuild) actually resolve files, and it lets you write natural, extensionless imports like `import { log } from "./logger"`. If you instead use `module: "nodenext"`, you have to write the *compiled* extension — `./logger.js` — even though the file on disk is `logger.ts`, which trips everyone up the first time.

A couple of smaller things: `baseUrl` is deprecated as of TypeScript 7, so define path aliases with just `paths` (they resolve relative to the `tsconfig.json` itself):

```json
"paths": { "@/*": ["./*"] }
```

And `verbatimModuleSyntax: true` requires you to mark type-only imports explicitly with `import type { X }`.

**Watch out:** VS Code caches your `tsconfig.json`. After you change it, the errors won't clear until you restart the TypeScript server (Command Palette → "Restart TS Server"). I lost time thinking a fix hadn't worked when it actually had.

## 2. require vs import

When you write `const x = require("...")`, TypeScript types `x` as **`any`** — you get no autocomplete and no type-checking at all. That's not a bug; `require`'s type signature genuinely returns `any` because it can load anything at runtime. Switching to an ESM `import` gives you full types and editor support, so prefer it.

**Watch out:** an ESM `import` needs `"type": "module"` in `package.json` (under `nodenext` resolution). Without it, the file is treated as CommonJS and the `import` keyword is rejected outright.

## 3. Bun

Bun does **not** reload your server automatically when you edit a file — it runs the file once and keeps the process alive. To get live reloading, use `bun --watch index.ts` (which fully restarts the process) or `bun --hot index.ts` (which hot-swaps the code without dropping the process). Bun also reads your tsconfig `paths` natively, so the `@/` alias just works at runtime with no extra tooling.

**Watch out:** flags must come **before** the entry file. `bun --hot index.ts` enables hot reload; `bun index.ts --hot` quietly passes `--hot` as an argument to your own program instead, and nothing reloads.

**Watch out:** older Bun (the 1.1.x line) had a bug where Express body parsing intermittently failed with *"request size did not match content length"* on reused connections. It's a Bun bug, not your code — running `bun upgrade` to the 1.2.x line fixes it.

## 4. Express 5

In `@types/express` v5, the values in `req.params` are typed as `string | string[]` (Express 5 supports wildcard and repeated params). If you pass a raw `req.params.id` straight into a query, TypeScript complains that a `string[]` isn't allowed. The clean fix is to type the route generic so the param narrows to a plain string:

```ts
(req: Request<{ id: string }>, res) => { const { id } = req.params; }
```

It helps to remember the order of the handler generics: `Request<Params, ResBody, ReqBody, ReqQuery>`. The request **body** is the third slot and the **query** is the fourth — a common source of "why isn't my body typed" confusion.

The best change in Express 5 is that it **automatically forwards errors from async handlers** to your error-handling middleware. In Express 4 an async function that threw would leave the request hanging, so people wrapped every handler in `try/catch`. In Express 5 that boilerplate is unnecessary — you only reach for `try/catch` when you want to *transform* a specific error into a friendlier one. Just remember the error handler must take all four arguments `(err, req, res, next)` (that's how Express recognizes it) and be registered last.

**Watch out:** a `204 No Content` response must not have a body. If you write `res.status(204).json({ ... })`, the JSON is silently dropped and the client gets an empty response. Use `200` with `.json()` when you want to return data, or `204` with `.send()` when you don't.

**Watch out:** for a catch-all 404, use `app.use(handler)` — not `app.get("*", ...)`. Express 5's router rejects a bare `*` and throws on startup.

## 5. Drizzle ORM

Drizzle can infer your TypeScript types straight from the table definition: `table.$inferSelect` is a full row and `$inferInsert` is the insert shape (columns with defaults or that are nullable become optional). A useful mental model is that **the column definition decides whether a field is required**: a `notNull` column with no default is required, while a column with a default is optional.

Two column types surprise people. A `numeric` column is represented as a **string** in JavaScript (this is deliberate — it avoids floating-point rounding errors with money), and a `date` column also comes back as a string like `"1965-01-01"`. So when you build values to insert, price is a string, not a number.

For conditional queries, `.where(undefined)` means "no filter", which makes optional search filters clean to express:

```ts
.where(search ? ilike(booksTable.title, `%${search}%`) : undefined)
```

Constraints and indexes go in the table's second-argument callback:

```ts
pgTable("books", { ...columns }, (t) => [
  check("price_non_negative", sql`${t.price} >= 0`),
  index("books_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
]);
```

**Watch out (this one cost real time):** Drizzle wraps database errors in a `DrizzleQueryError`. The actual Postgres error code lives at **`err.cause.code`**, not `err.code`. Because I was reading `err.code`, every database error fell through to a generic 500 instead of the right status. Check both.

**Watch out:** `drizzle-kit` does not manage Postgres extensions. If your schema uses something like a trigram index, `CREATE EXTENSION pg_trgm` won't be generated for you — you have to add it to the migration SQL by hand.

### Joining tables (leftJoin)

A join lets a single query pull related rows from two tables at once, matching them on a shared value. Since a book stores only its author's id, a join is how you return the whole author alongside the book instead of just that id — the database matches each book to the author whose id equals the book's stored author id, and hands back both together.

The important idea is the difference between a **left** join and an **inner** join. A left join always keeps every row from the "left" (main) table — here, books — even when there's no matching row on the other side; the missing side simply comes back empty. An inner join is stricter: it only returns rows where *both* sides have a match, so a book with no matching author would disappear from the results entirely.

In this project every book has a required author (the foreign key is not-null), so the two kinds of join would behave identically. But a left join is the safer default because it never silently drops your main record just because a related row happens to be missing — you'd rather get the book back with an empty author than get nothing at all. You reach for an inner join only when you specifically *want* to require the match and exclude the unmatched rows.

One practical wrinkle worth remembering: the result of a join isn't a single flat object. It comes back grouped by table — the book's columns under one key, the author's under another — so if you want a tidy response with the author nested inside the book, you reshape it yourself before sending it back.

## 6. IDs: identity vs UUID

There are two natural choices for a primary key, and they trade off differently:

- **Sequential (`generatedAlwaysAsIdentity`)** gives you small, ordered, human-readable ids like `1, 2, 3`. The downside is they're **guessable and enumerable** — anyone can walk `/books/1`, `/books/2` and count or scrape your data.
- **UUID (`defaultRandom`)** is not guessable and merges cleanly across databases, at the cost of being larger and hurting index locality because the values are random (UUIDv7 solves the ordering problem if you need it).

For a public API where ids are exposed, UUIDs are usually the safer default.

## 7. PostgreSQL & Docker

`docker compose up -d` needs the Docker **daemon** running first — on a Mac that means starting Docker Desktop. A stopped container still counts as "using" its image, so if you try to delete an image and it refuses, remove the container first and then the image. And remember that without a named `volumes:` entry, your database data is **ephemeral** — `docker compose down` deletes it along with the container.

It's worth mapping the common Postgres error codes to sensible HTTP responses in your error handler:

| Code | Meaning | HTTP |
|------|---------|------|
| 23505 | unique violation | 409 |
| 23503 | foreign key violation | 400 |
| 23502 | not-null violation | 400 |
| 23514 | check violation | 400 |

**Watch out:** an `ILIKE '%term%'` search (with a leading wildcard) **cannot use a normal B-tree index** — that kind of index only helps prefix searches like `term%`. To make `%term%` fast you need the `pg_trgm` extension and a **GIN trigram index**. And don't be alarmed if `EXPLAIN` shows a sequential scan anyway: on a tiny table Postgres correctly decides scanning is faster than using the index. You can force it with `SET enable_seqscan = off` just to confirm the index is usable.

### Two ways to search text: trigram vs full-text

`ILIKE` + trigram is not the only option. Postgres also has proper **full-text search** with `to_tsvector`/`to_tsquery`, and the two solve *different* problems:

```ts
// trigram / ILIKE — matches any substring, typo-tolerant, partial words
.where(ilike(booksTable.title, `%${term}%`))

// full-text — matches whole words and their stems, with ranking
.where(sql`to_tsvector('english', ${booksTable.title}) @@ websearch_to_tsquery('english', ${term})`)
```

The key distinction: **trigram matches substrings** (typing `syst` finds "System", `fisch` finds "Fischer"), while **full-text matches words and their stems** ("games" matches "game", "running" matches "run") and can rank results and handle boolean/phrase queries. Full-text ignores stop words and is language-aware; trigram is language-agnostic and tolerates typos and partial input.

For a short **title** field where users type partial words, trigram is usually the better fit — full-text can't do partial-word matching without a `:*` prefix trick. Full-text shines on longer prose like a **description**, where stemming and relevance ranking matter. Its index is a GIN index on the tsvector rather than a trigram index:

```ts
index("books_title_fts_idx").using("gin", sql`to_tsvector('english', ${t.title})`)
```

**Watch out:** never pass raw user input to `to_tsquery` — it has a strict query syntax and throws on ordinary input like `chess endgame`. Use **`websearch_to_tsquery`**, which accepts plain human text (spaces, quotes, `or`) safely.

## 8. Zod validation

The key realization is that **TypeScript types are erased at runtime**, so a typed `req.body` is really just untrusted `any` coming off the network. Zod is what actually checks the data at runtime. `drizzle-zod`'s `createInsertSchema` is especially nice because it derives the validator directly from your table, so validation and schema never drift apart.

A few techniques that mattered:

- **`.pick()` whitelists** the fields a client is allowed to send, which blocks *mass assignment* — without it, a client could set `id`, `createdAt`, or `updatedAt`. (I confirmed this: an injected `"id"` was silently stripped.)
- **Refinements** (the second argument to `createInsertSchema`) tighten fields whose auto-generated validation is too loose. Under this Drizzle release candidate, `varchar` length was enforced automatically but `numeric`, `date`, and `integer` were **not**, so I had to validate those explicitly or bad values would reach the database and cause a 500.
- **`.transform((n) => n.toFixed(2))`** lets the client send a natural `number` for price while handing Drizzle the `string` its `numeric` column expects. The rule to remember: the schema's *output* type must match what `db.insert().values()` expects.
- A refinement alone can't make a nullable or defaulted column required — for that, either use `.extend()` (which fully replaces the field) or make the column `notNull` so the requirement comes from the schema itself.

**Branded types** were the neat trick here. `z.uuid().brand<"Uuid">()` produces a `Uuid` type that is distinct from a plain `string`, so you can't accidentally pass an unvalidated string where a validated id is expected. It's only honest, though, when a validation gate (middleware) actually runs to produce that branded value.

## 9. Architecture patterns

A few patterns kept the code clean:

- A single **`validate(source, schema)` middleware factory** validates `req.body`, `req.params`, or `req.query`. It reassigns `req.body` with the parsed result (params and query are read-only in Express 5, so those are validated but not replaced).
- An **`ApiError` class plus a central error handler** means any layer can `throw ApiError.notFound(...)` and the handler turns it — along with mapped Postgres codes and a generic 500 fallback — into consistent JSON, without ever leaking a stack trace.
- Every response uses the **same envelope**: `{ status: "success" | "error", ... }`, so clients parse everything the same way.
- Controllers stay **thin** — validation happens at the edge in middleware, so the handler can trust its input — and the `@/` path alias removes the `../../..` import noise.

## 10. Git

To back-date a commit properly you have to set **both** dates, because `--date` on its own only changes the *author* date and leaves the *committer* date as now:

```bash
GIT_COMMITTER_DATE="2025-08-10T12:00:00" \
  git commit --date "2025-08-10T12:00:00" -m "..."
```

A bare `YYYY-MM-DD` is rejected for `GIT_COMMITTER_DATE`, so give it a full timestamp. (GitHub's contribution graph uses the author date, in case that's what you're aiming for.)

**Watch out:** GitHub's push protection blocks secrets before they ever land — including a public Mapbox `pk.` token. The way out is to scrub the token to a placeholder and amend, or explicitly allow it via the unblock URL in the error. And a broader lesson from debugging: when a stack trace lives entirely inside `node_modules` with none of your own files in it, the bug is almost always in a dependency or the runtime, not your code.

## 11. Deleting data: soft delete & keeping history

Deleting a record that other records point to is one of the most consequential decisions in a schema, because a foreign key can turn one delete into many. When a book references an author, the database needs to know what to do to the books if that author is removed. The options range from destructive to protective: a **cascade** deletes the author and all their books along with them; a **restrict** refuses the delete while any book still points at the author; a **set null** keeps the books but empties their author link; and **soft delete** sidesteps the whole question by never actually removing anything.

The safest default for anything meaningful is **soft delete**. Instead of a real `DELETE`, you add a `deletedAt` timestamp column and simply set it when something is "deleted." The row stays in the database, so nothing is destroyed and everything is reversible — you're just hiding it. The catch is that *every* read has to remember to filter out the hidden rows (`where deletedAt is null`); miss one query and "deleted" records leak back into the app. There's also a subtle side effect: a unique column like email is still occupied by a soft-deleted row, so that value can't be reused unless you make the uniqueness apply only to non-deleted rows.

The reason all of this matters becomes vivid once you imagine a customer who has already **bought** a book. Now the chain is order → book → author, and deleting the author is no longer just an author problem. A cascade would delete the author, then the books, and suddenly an order points at a product that no longer exists — the receipt and purchase history break, which for a real store is a legal and accounting disaster. Soft delete avoids this because the whole chain stays intact; the author is merely hidden from listings.

But the deeper principle worth remembering is that **transactional records should not depend on live catalog data at all.** An order is a historical fact: it must show what was bought, and the price that was actually paid, forever — regardless of what happens to the book or author afterward. So a well-designed order doesn't just link to the book and read its current title and price; it **stores a snapshot** of those values at the moment of purchase. Prices change, titles get corrected, records get removed — but the receipt must never change. The foreign key becomes a convenience link, while the snapshot is the source of truth.

The rule of thumb that falls out of this: **catalog data** (books, authors) can be edited or hidden, so it's fine to soft-delete and reference live; **transactional data** (orders) is append-only and self-contained, so it snapshots what it needs and never lets a later change rewrite history.

## 12. Authentication: JWT & password hashing

Authentication answers one question — *who is this request from?* The stateless way to answer it is a **JWT**: after a successful login the server hands the client a signed token, and the client sends it back on every subsequent request (in the `Authorization: Bearer <token>` header). The server can then trust the request without looking anything up in a session store.

A token is three base64 pieces joined by dots: `header.payload.signature`. The **header** says which algorithm signed it and barely changes between tokens. The **payload** carries the claims — who the user is (`sub`, the subject, is the user id), when the token was issued and when it expires. The **signature** is the important part: it's an HMAC of the header and payload computed with a secret only the server knows. Anyone can *read* a JWT (the payload is encoded, **not encrypted**), but nobody can forge or tamper with one without the secret, because any change to the payload invalidates the signature. The practical rule: the signature proves **integrity, not confidentiality** — so never put anything secret in the payload.

Passwords are a separate concern and never travel in the token. They're stored as an **argon2id** hash via `Bun.password.hash`, and login verifies with `Bun.password.verify`. You never store or compare plaintext; you compare against the hash.

**Watch out:** it's tempting to define a custom `AuthedRequest` type (a `Request` where `user` is guaranteed present) and use it as a handler's parameter type. It doesn't work — under `strictFunctionTypes`, Express's handler signature is contravariant in its request type, so a narrower request type isn't assignable where Express expects the base `Request`. The clean fix is a small `getCurrentUser(req)` helper that throws if `req.user` is missing and returns the narrowed type, called inside the handler instead of typing the parameter.

## 13. Authorization: roles vs ownership

Authorization answers the next question — *is this authenticated user allowed to do this?* Two HTTP statuses keep the distinction honest: **401 Unauthenticated** means "I don't know who you are" (missing or invalid token), while **403 Forbidden** means "I know who you are, and you can't do this." Conflating them leaks information and confuses clients.

There are two independent axes of "allowed," and this project uses both:

- **Role-based** — an `authorize(...roles)` middleware factory that checks `req.user.role` against a list and 403s otherwise. Coarse-grained: "admins and publishers may create books."
- **Ownership-based** — an `assertOwnership(user, createdBy)` check *inside the controller*, after the row is loaded, so it can compare the row's `createdBy` against the current user. Fine-grained: "a publisher may edit only the books they created." Admins bypass the ownership check entirely.

The two compose into a clean pipeline for a mutating route: **`validate → authenticate → authorize(role) → ownership check`**. Each stage fails fast with the right status, so by the time the controller does its work, the input is well-formed, the caller is known, their role is sufficient, and they own the resource.

**Watch out — user enumeration:** on login, return the *same* error for an unknown email and a wrong password. If "no such user" and "wrong password" look different, an attacker can discover which emails have accounts. Same message, same status, for both.

**Watch out — the soft-delete lockout trap:** deactivating an account is a soft delete (`deactivatedAt`), and the authenticate middleware refuses to load a deactivated user. That has a consequence that's easy to miss: a deactivated user **cannot authenticate**, so they can't reactivate *themselves*. Reactivation therefore has to be an admin-only action. And by the same logic, admin accounts must not be deactivatable at all — deactivate the last admin and there's no one left who can turn anyone (including that admin) back on.

## 14. Configuration & environment validation

Environment variables are untyped strings that may or may not be set, and reading them ad hoc (`process.env.PORT`, `process.env.DATABASE_URL!`) scatters that uncertainty across the codebase — a missing or malformed value blows up deep inside some unrelated request instead of at startup. The fix is to validate the whole environment **once, at boot**, with a Zod schema, and export a single typed `env` object that the rest of the app imports. Coercions live there too (`z.coerce.number()` turns the `PORT` string into a real number), so `env.PORT` is typed `number`, not `string | undefined`.

The payoff is **fail-fast**: if `JWT_SECRET` is too short or `DATABASE_URL` is missing, the process prints exactly what's wrong and exits before the server ever listens — you find out on deploy, not on the first request that happens to need it.

## 15. Hardening: helmet, CORS, rate limiting, health checks

A handful of middleware turn a working API into a deployable one:

- **helmet** sets a batch of sensible security response headers (CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, …) so browsers refuse a range of attacks by default.
- **CORS** controls which origins may call the API from a browser; the allowed origin is config, so it can be locked down per environment.
- **Rate limiting** caps requests per client per window. The general limiter protects the whole API, and a **stricter limiter on `/auth`** specifically blunts credential brute-forcing — the login route is the one you most want to throttle.

Middleware **order matters**: security headers and CORS go first, body parsing next, then the rate limiter, then routes; the error handler is always last.

A **health check** (`GET /health`) is what a load balancer or uptime monitor polls to decide if the instance is alive. A useful one doesn't just return `200` blindly — it pings the database (`SELECT 1`) and returns **503** if the DB is unreachable, so "healthy" actually means "can serve real traffic." Two practical details: mount it **before** the rate limiter (probes hit it constantly and shouldn't be throttled), and wrap the DB check in `try/catch` so a failure returns a clean 503 instead of falling through to the generic 500 handler.

## 16. Structured logging

`console.log` is fine until you need to *search* your logs. Structured logging (via **pino**) emits one JSON object per line — level, timestamp, request id, method, url, status, response time — which a log aggregator can filter and query. The trick is to keep it readable while developing: **pretty-print in dev, raw JSON in prod**, switched on `NODE_ENV`. Wiring `pino-http` in as middleware gives every request a `req.log` that already carries a per-request id, so logs from the same request correlate.

**Watch out (Bun-specific):** pino's usual way to pretty-print is a *transport*, which runs the formatter in a **worker thread**. Under Bun that thread doesn't flush reliably, so the log file comes out empty even though everything "works." The fix is to use `pino-pretty` as a **direct stream** (`pino(pretty(...))`) instead of a transport — no worker thread, logs appear immediately. Also worth doing: exclude `/health` from request logging, or uptime probes will bury the useful lines.

**Watch out (background processes):** when testing a server you launched with `&`, a stale copy left bound to the port will keep serving requests while your *new* process logs nothing — making it look like logging is broken when it isn't. Kill by port (`lsof -ti tcp:8000 | xargs kill`), not just by name, before re-running.

## 17. Sessions done right: access + refresh tokens

A single long-lived JWT can't be revoked — so "logout" is impossible server-side. The real-world fix is **two tokens**: a short-lived **access token** (a stateless JWT, ~5–15 min, sent on every request) and a long-lived **refresh token** (an opaque random string, ~7 days, used *only* to mint new access tokens). Logout = revoke the refresh token. The access token can't be killed, but it dies on its own in minutes — the accepted tradeoff.

The refresh token is the sensitive, revocable secret, so it gets the same treatment as a password: store only a **SHA-256 hash** in the DB, never the raw value. A leaked table then hands out nothing usable.

Two patterns make it robust:

- **Rotation** — every refresh revokes the used token and issues a brand-new one. A healthy client always moves forward, so a given refresh token is effectively single-use.
- **Reuse detection** — because of rotation, seeing an *already-revoked* token come back means theft/replay. You can't tell victim from attacker, so the safe response is to revoke **all** of that user's refresh tokens and force a fresh password login. The attacker doesn't have the password; the user just logs in again.

**Watch out — transport is a security choice, not a detail.** Where the client stores tokens decides the threat model: `localStorage` is readable by any XSS; an `httpOnly` cookie is not (but is auto-sent, so it needs `SameSite`/CSRF thought); a native mobile app has no XSS surface and its own secure storage (Keychain/Keystore), so it wants tokens in the body + a `Bearer` header. To serve web **and** mobile, stay transport-agnostic: return tokens in the body *and* set httpOnly cookies, and have auth read a `Bearer` header **or** the cookie. One backend, both worlds.

**Watch out — rotation + client retries.** If a client fires two refreshes in parallel (or retries a timed-out one), the second presents an already-rotated token and trips reuse detection, nuking all sessions. It's inherent to rotation; worth knowing before it surprises you in the wild.

## 18. Password reset by email

The flow: `forgot-password` generates a random token, stores its **hash + expiry** (one active token per user fits two nullable columns on `users` — no separate table needed, unlike refresh tokens which are one-to-many), and emails the **raw** token in a link. `reset-password` hashes the submitted token, checks it's unexpired and unused, updates the password, clears the columns (one-time use), and revokes all refresh tokens (a password change should end every session).

**The elegant part — enumeration resistance through a different channel.** `forgot-password` must return the *same* 200 whether or not the email exists, or an attacker can probe which addresses have accounts. But the real user still learns the truth — not from the HTTP response, but from their **inbox** (the email arrives, or it doesn't). The answer is delivered privately to the mailbox owner, invisibly to whoever called the API.

**Watch out — email is the on-demand case; keep it off the request path.** Sending inline makes the request wait on SMTP (~seconds) and, worse, leaks existence via **timing** (existing email = slow send, unknown = instant) and via **failure** (an SMTP error becomes a 500 while unknown stays 200). Fire the send in the background (a queue, §20) so the response is fast and uniform regardless.

**Watch out — deliverability (SPF/DKIM/DMARC).** When relaying through a provider like Gmail, the `From` address **must** be the authenticated account. Send `From: no-reply@some-other-domain` through your Gmail and the message is *accepted* (250 OK) but then silently dropped by the receiver for failing SPF/DKIM alignment — you get no error and no email. Default `EMAIL_FROM` to the authenticated `SMTP_USER` so it can't drift, rather than to a plausible-looking fake that fails silently.

## 19. Role in the token vs a per-request lookup

Loading the user from the DB on every authenticated request is what gives you **instant** revocation — deactivate or demote someone and their next request reflects it. That per-request query isn't waste; it's your revocation mechanism. The tradeoff is one DB read per request.

The alternatives trade freshness for speed:

- **Put `role` in the JWT** and skip the lookup. Zero DB on the hot path, but role/deactivation changes lag until the token expires. Safe *as a signed claim* — a user can't forge a higher role because tampering breaks the signature (**as long as you `verify`, never `decode`**). Bound the staleness with a short access TTL, and **re-read the role from the DB on refresh** so it self-corrects each cycle.
- **Cache the user** (Redis, short TTL). Freshness within the TTL, but you inherit cache invalidation — you must evict on every user mutation, or serve stale privileges.

**The judgment worth internalizing:** match the tool to the actual need. A cache to avoid a sub-millisecond primary-key lookup is premature optimization; carrying one signed `role` claim solves the same problem with zero infrastructure. Reach for Redis when something genuinely needs it — a job queue — not to shave a lookup that isn't a bottleneck.

## 20. Background work: queues and cron

Two different shapes of "not in the request":

- **Queue (on-demand)** — "do this *now*, off the request path" (send an email). A **producer** (the API) enqueues a job; a separate **worker** process consumes it. The worker earns its separation: the API stays responsive, work retries on failure, and workers scale independently. BullMQ (Redis-backed) gives retries, exponential backoff, and delayed jobs for free — so a transient SMTP failure retries instead of vanishing (what plain fire-and-forget would lose).
- **Cron (scheduled)** — "do this *every night*" (prune expired/revoked tokens so the tables don't grow forever). No producer — a timer fires it. `node-cron` runs in-process with zero infra.

**Watch out — they scale differently.** A queue scales *cleanly*: run N workers and Redis hands each a different job. In-process cron does **not**: N worker copies means the schedule fires N times. Harmless for an idempotent `DELETE`, but for anything else you'd move the schedule to a single process or a **BullMQ repeatable job** (Redis dedupes it to one run). While you run a single worker, hosting both the queue consumer and the cron in it is perfectly fine.

**Watch out — the worker needs the same config and a way to be run.** It's a real second process (`bun run worker`) with its own lifecycle; it loads the same `.env` (DB, Redis, SMTP) and must be started alongside the API in dev and deployed separately in prod.

## 21. Orders: transactions, snapshots & inventory

Placing an order is where several ideas from earlier sections come together into one operation that has to be **all-or-nothing**: decrement stock for every item, create the order, create its line items — and if *any* part fails, none of it happened. That's a **database transaction** (`db.transaction`). Wrap the whole thing; a throw anywhere rolls back every write, so a mid-order failure can't leave stock decremented for an order that was never created.

**Concurrency is the subtle part.** The naive way to check stock is "read the stock, if it's enough, then decrement it" — but that's a **race condition**: two buyers both read stock 1, both decide it's fine, both decrement, and you've sold the last copy twice (stock goes to −1). The fix is to make the check and the decrement a **single atomic statement**:

```ts
UPDATE books SET stock = stock - :qty
WHERE id = :id AND deletedAt IS NULL AND stock >= :qty
RETURNING title, price
```

If the row comes back, you got the stock (and the snapshot); if it comes back empty, there wasn't enough — throw and roll back. Under Postgres' default READ COMMITTED, a second transaction hitting the same row **waits** for the first to commit, then **re-checks** `stock >= qty` against the now-updated value — so it correctly fails instead of overselling. (Verified: 10 concurrent orders against stock 3 → exactly 3 succeed, 7 get a 400, stock lands on 0, never negative.) The one statement does validation + snapshot + decrement together, which is what closes the race.

**Snapshots make the order a permanent record.** Each `order_item` stores the `title` and `price` **as they were at purchase**, not just a `bookId` pointer. So when a book's price later changes, or it's soft-deleted, past orders still show what was actually bought and paid — the receipt never mutates. This is the transactional-vs-catalog-data principle from section 11, applied.

**Cancel needs its own kind of locking.** Cancelling restocks inventory, so two concurrent cancels of the same order would restock **twice**. Here the atomic-conditional-UPDATE trick doesn't fit as neatly (there's a read + several writes), so instead lock the order row up front with `SELECT ... FOR UPDATE`: the second cancel blocks, then re-reads the status as `cancelled` and returns a 409. Same goal as the stock UPDATE — serialize the racers — just via an explicit row lock.

**Keep side effects off the request and after the commit.** The confirmation/status emails are enqueued (section 20), not sent inline, and enqueued **after** the transaction commits and as fire-and-forget — so a slow mailer never blocks checkout, and a Redis hiccup can't fail an order that already succeeded. The rule: do the durable, must-succeed work inside the transaction; do the best-effort notifications after it.

One design choice worth noting: **cancellation lives on its own endpoint**, not the generic status-change endpoint, because it has a side effect (restock) and looser authorization (a buyer can cancel their own order, but only an admin advances fulfillment). Modelling status as a small transition map (`pending→paid→shipped`) keeps illegal jumps out, and routing `cancelled` through the dedicated cancel path keeps the restock logic in exactly one place.

## 22. Structuring a feature: the layered split

Early on each feature was two files — a `model` (table **and** its Zod schemas) and a `controller` (request handling **and** database queries). That's fine until the controllers grow: validation, HTTP shaping, business rules, and SQL all pile into one function. The fix is to give each feature five thin layers, each with one job:

```
features/<name>/
  <name>.model.ts       # the Drizzle table + inferred types (data shape)
  <name>.dto.ts         # Zod schemas + request-body/query types (the edge contract)
  <name>.service.ts     # DB operations + business rules (no req/res)
  <name>.controller.ts  # read req → call service → shape res (no SQL)
  <name>.route.ts       # wire endpoints + middleware
```

The key discipline: **the controller never touches the database, and the service never touches `req`/`res`.** A controller reads input (`getCurrentUser(req)`, parsed body/query), calls a service function, and shapes the response — that's it. The service owns the queries, transactions, ownership checks, and throws `ApiError` for failures (the central error handler maps them to HTTP). That separation is what makes the service unit-testable in isolation and lets the same logic be reused (e.g. `authService.revokeUserRefreshTokens` is called from both auth and users).

**Watch out — some things legitimately straddle a layer.** Cookies are the clearest example: setting a refresh-token cookie touches `res`, so the cookie helpers stay in the **controller**, while the token *generation and storage* live in the service. The rule isn't "controllers have no logic" — it's "controllers only do request/response work."

**Watch out — naming conventions pay off.** Consistency across features (`getX` not `listX`, request-body types suffixed `…Body`, query types `…Query`, a `body` parameter name) means every feature reads the same way and there's no guessing. Worth agreeing on early and applying everywhere.

## 23. Feature boundaries and the composition root

Features will reference each other (a book has an author; a review targets a book), and the direction of those references matters. Aim for a **single, acyclic direction**. Here it's `reviews → books → authors` at the data layer (foreign keys), and that's it. When a feature needs to reach "backwards," that's a smell:

- The old `GET /authors/:id/books` had `authors` reaching into the *books* table — the wrong way. It moved to a `booksService.getBooksByAuthor` (a **books** query, where it belongs); authors no longer imports books at all.
- Deactivating a user must revoke their refresh tokens (an *auth* concern). Instead of `users` reaching into the `refresh_tokens` table, it calls `authService.revokeUserRefreshTokens(id)` — depending on auth's *public function*, not its internals.

**The composition root.** Individual feature routers don't know their mount paths or how they nest. `app.ts` wires everything together — it mounts `/api/v1/books`, and also composes the nested URLs like `/api/v1/authors/:id/books` and `/api/v1/books/:bookId/reviews` (each nested router uses `mergeParams` to read the parent id). Keeping the URL topology in one place means neither feature hard-codes the other's path.

**Watch out — mutual dependence between tightly-coupled features is okay.** `auth` reads the users table and `users` calls an auth service function — a two-way dependency. For features as intertwined as auth and users that's acceptable; what you avoid is a *cycle at the same layer* (auth.service ↔ users.service). Here auth.service depends only on `users.model`, so it stays acyclic.

## 24. API versioning

All domain routes sit under a **`/api/v1`** prefix; `/health` deliberately does not (uptime probes want a stable, unversioned path). Versioning up front is cheap and buys room later: a breaking change can ship as `/api/v2` mounted alongside `v1`, so existing clients keep working while new ones migrate. Retro-fitting a version prefix after clients exist is far more painful.

**Watch out:** the version prefix belongs to *routing*, not to the feature. Feature routers define paths relative to their own resource (`/`, `/:id`); the prefix is applied once where they're mounted, so bumping to v2 is a mounting change, not a per-feature edit.

## 25. Denormalized aggregates: book ratings

A book shows an average rating and a review count. Two ways to get them: compute on every read (`AVG`/`COUNT` join each time), or **store** `ratingsAverage`/`ratingsCount` on the book and keep them current. This project stores them — reads are then free (the values sit on the book row), at the cost of maintaining them on writes.

The safe way to maintain a denormalized aggregate is to **recompute it from source inside the same transaction as the change**, not to increment/decrement it:

```ts
// after any review insert/update/delete, in the same tx:
const [agg] = await tx.select({
  average: sql`coalesce(avg(${reviews.rating}), 0)`,
  total: count(),
}).from(reviews).where(eq(reviews.bookId, bookId));
await tx.update(books).set({ ratingsAverage: ..., ratingsCount: agg.total }).where(...);
```

Recomputing from source is self-correcting — it can't drift the way manual `count + 1` / `count - 1` bookkeeping does if an edge case is missed. Because it shares the review write's transaction, the review and the updated average commit together or not at all.

**Watch out — a "verified purchase" rule is a cross-feature query.** Reviews are gated to users who actually bought the book, which means checking `order_items` joined to a non-cancelled `orders` row for that user — the reviews service reads order/book data. That's the natural dependency direction (reviews → orders/books), so it's fine; just be deliberate that a review's precondition lives in *another* feature's tables.

---

*Field notes from building the Book Store API — kept as a quick reference for next time.*
