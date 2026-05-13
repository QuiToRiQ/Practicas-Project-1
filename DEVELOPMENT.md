# Developer Guide

A walk-through of how this codebase is organised, the conventions it follows, and recipes for the most common extensions. Read it in order on the first pass; later, jump to the [Recipes](#recipes) section.

> **Audience**: a developer comfortable with TypeScript, who has used a Node web framework before (Express / NestJS / Fastify), and who has touched React + hooks. No NestJS experience required — the parts you need are explained here.

---

## Table of contents

1. [Architectural pillars](#1-architectural-pillars)
2. [Repository layout](#2-repository-layout)
3. [The request lifecycle, end to end](#3-the-request-lifecycle-end-to-end)
4. [The ports & adapters seam](#4-the-ports--adapters-seam)
5. [Configuration & secrets](#5-configuration--secrets)
6. [Authentication & permissions](#6-authentication--permissions)
7. [Spreadsheet pipeline](#7-spreadsheet-pipeline)
8. [Frontend architecture](#8-frontend-architecture)
9. [Database schema](#9-database-schema)
10. [HTTP API reference](#10-http-api-reference)
11. [Recipes](#11-recipes)
12. [Testing strategy (todo)](#12-testing-strategy-todo)
13. [Code style & conventions](#13-code-style--conventions)
14. [Glossary](#14-glossary)

---

## 1. Architectural pillars

Four ideas drive every decision in the codebase. When in doubt, go back to these.

### 1.1 Ports & adapters (hexagonal architecture)

Business logic (controllers, services) never depends on infrastructure (Postgres, the local filesystem). It depends on **interfaces** ("ports"). Concrete implementations ("adapters") are wired in at the composition root.

```
          ┌───────────────────────────────────────┐
          │  Controllers + Services (use cases)   │
          │  speak only to interfaces             │
          └───────────────┬───────────────────────┘
                          │ depends on ports
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
  IUserRepo       ISpreadsheetRepo       IFileStorage
       ▲                  ▲                  ▲
       │                  │                  │
  ┌────┴─────┐      ┌────┴─────┐      ┌─────┴────────┐
  │ Postgres │      │ Postgres │      │ Local / Azure│
  │ adapter  │      │ adapter  │      │ / GCS adapter│
  └──────────┘      └──────────┘      └──────────────┘
```

The user requirement was *"API replaceable (from personal DB to Azure or Google, for bigger scale)"* — this is how that's delivered. Swapping a backing store means writing one new file and changing one binding. No service or controller changes.

### 1.2 Zero-trust to the user

Every byte that crosses the boundary from outside the backend is treated as hostile:

- Input is validated with `class-validator` DTOs that reject unknown fields (`whitelist: true, forbidNonWhitelisted: true`).
- Authentication is mandatory on every non-auth route via `JwtAuthGuard`.
- Authorisation is checked per-route via `@RequirePermissions(...)` + `PermissionsGuard`.
- File uploads are checked by **magic bytes**, not file extension.
- Path traversal is impossible in the local file adapter — every key is resolved to an absolute path and verified to be inside the configured root.
- Cross-tenant access is prevented inside repositories (`requesterId` parameter) — a leaked `id` doesn't grant access.
- Errors never leak stack traces or internal structure (see `AllExceptionsFilter`).

### 1.3 Reliability first, then scale, then speed, then polish

This ordering shows up in code: we prefer correctness to micro-optimisation, but where reasonable optimisations exist (virtualised grids, paged queries, JSON-only serialisation), we take them.

### 1.4 No premature abstraction, no dead code

If a thing has one user, it lives next to that user. The abstractions we *do* have (the ports) exist because the user explicitly asked for them. We do not add interfaces "for testability" without a second implementation in sight.

---

## 2. Repository layout

```
spreadsheet-tool/
│
├── backend/                                  ── NestJS API (Node 20)
│   ├── Dockerfile                            ── multi-stage build, non-root runtime
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── src/
│       ├── main.ts                           ── bootstrap: helmet, cookies, CORS, body limit
│       ├── app.module.ts                     ── root module: global pipes, guards, filter
│       │
│       ├── core/                             ── cross-cutting & infrastructure
│       │   ├── config/configuration.ts       ── env validation (class-validator)
│       │   ├── security/
│       │   │   ├── password.service.ts       ── argon2id helpers
│       │   │   ├── security.module.ts
│       │   │   └── all-exceptions.filter.ts  ── final error boundary
│       │   ├── storage/                      ── *** the seam ***
│       │   │   ├── ports/                    ── interfaces (DB-agnostic)
│       │   │   │   ├── tokens.ts             ── DI Symbols
│       │   │   │   ├── user.repository.ts
│       │   │   │   ├── refresh-token.repository.ts
│       │   │   │   ├── permission.repository.ts
│       │   │   │   ├── spreadsheet.repository.ts
│       │   │   │   └── file.storage.ts
│       │   │   └── storage.module.ts         ── chooses adapters from env
│       │   ├── storage.pg/                   ── Postgres adapter
│       │   │   ├── entities/                 ── TypeORM entities
│       │   │   ├── user.repository.pg.ts
│       │   │   ├── refresh-token.repository.pg.ts
│       │   │   ├── permission.repository.pg.ts
│       │   │   └── spreadsheet.repository.pg.ts
│       │   └── storage.local/                ── disk-backed file adapter
│       │       └── file.storage.local.ts
│       │
│       └── modules/                          ── feature modules
│           ├── auth/                         ── register / login / refresh / logout / me
│           ├── permissions/                  ── guard, decorator, seeder
│           └── spreadsheets/                 ── upload, parse, merge, list, edit, export
│
├── frontend/                                 ── React 18 + Vite SPA
│   ├── Dockerfile                            ── build → nginx
│   ├── nginx.conf                            ── SPA fallback + CSP + caching
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx                          ── ReactDOM root
│       ├── App.tsx                           ── routes + QueryClient + AuthProvider
│       ├── styles.css                        ── Tailwind layers
│       ├── api/                              ── typed fetch wrappers
│       │   ├── client.ts                     ── retry-on-401 + refresh dance
│       │   ├── auth.ts
│       │   └── spreadsheets.ts
│       ├── auth/                             ── session context + route guard
│       │   ├── AuthProvider.tsx
│       │   └── ProtectedRoute.tsx
│       ├── components/                       ── reusable UI
│       │   ├── Layout.tsx
│       │   ├── UploadDropzone.tsx
│       │   ├── MergeDialog.tsx
│       │   └── SpreadsheetGrid.tsx           ── the virtualised editable grid
│       └── pages/
│           ├── DashboardPage.tsx
│           ├── LoginPage.tsx
│           ├── RegisterPage.tsx
│           └── SheetPage.tsx
│
├── db/init.sql                               ── Postgres extensions (citext)
├── docker-compose.yml                        ── orchestration
├── .env.example                              ── canonical environment template
├── README.md
├── INSTRUCTIONS.md                           ── ops / deploy
└── DEVELOPMENT.md                            ── you are here
```

---

## 3. The request lifecycle, end to end

Take a single user action — **"edit a cell value"** — and trace it through the system.

```
1.  User double-clicks a cell in SpreadsheetGrid.tsx, types a new value, presses Enter.
                                                  │
2.  EditableCell.onCommit → updateCell mutation in SpreadsheetGrid:
        sheetsApi.updateCell(sheetId, rowId, column, value)
                                                  │
3.  api/client.ts → fetch(`/api/spreadsheets/:id/rows/:rowId`, {
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ column, value }),
    })                                            │
                                                  │
                            ┌─────────────────────┘
                            │
                            ▼
4.  Browser sends the request with the httpOnly `access_token` cookie.
                                                  │
5.  nginx (in frontend container) is not in the picture in dev — Vite proxies
    `/api/*` to the backend. In prod the reverse proxy (Caddy/nginx) does it.
                                                  │
                            ┌─────────────────────┘
                            ▼
6.  NestJS pipeline:
        a. CORS guard (allowed origin? credentials allowed?)
        b. ThrottlerGuard (under the per-IP rate limit?)
        c. helmet headers added on response
        d. cookieParser middleware reads `access_token`
        e. JwtAuthGuard runs JwtAccessStrategy:
              - extracts JWT from cookie (or Authorization header)
              - verifies signature with JWT_ACCESS_SECRET
              - attaches `req.user = { id, email }`
        f. PermissionsGuard reads `@RequirePermissions('sheets:write')`
              metadata, fetches the user's permissions from the database,
              throws 403 if any are missing.
        g. ValidationPipe deserialises body into UpdateCellDto, throws 400
              on type mismatches or unknown fields.
                                                  │
7.  SpreadsheetsController.updateCell()
        - whitelists value's primitive type
        - calls SpreadsheetsService.updateCell(...)
                                                  │
8.  SpreadsheetsService.updateCell()
        - calls ISpreadsheetRepository.updateCell(...)
                                                  │
                            ┌─────────────────────┘
                            ▼
9.  SpreadsheetPgRepository.updateCell()
        - finds the sheet by id
        - verifies sheet.ownerId === requesterId  (cross-tenant defence)
        - verifies the column is in the sheet's column list
        - finds the row by (id, spreadsheetId)
        - patches data[column] = value
        - saves the row, bumps sheet.updatedAt
                                                  │
                            ┌─────────────────────┘
                            ▼
10. JSON response → ValidationPipe / serializer → AllExceptionsFilter
    (only fires if something blew up)
                                                  │
                            ┌─────────────────────┘
                            ▼
11. Frontend receives the row → updateCell.onSuccess updates the buffer
    in SpreadsheetGrid so the cell reflects the canonical server value.
```

If anything went wrong, the response is shaped as `{ message, ... }` with a meaningful HTTP status. The frontend's `ApiError` propagates it.

---

## 4. The ports & adapters seam

This is the single most important concept in the backend. Internalise this section and the rest is just plumbing.

### 4.1 What is a port?

A **port** is a plain TypeScript interface that describes what business logic needs, without saying how the need is met. Example:

```ts
// backend/src/core/storage/ports/user.repository.ts
export interface IUserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: CreateUserInput): Promise<UserRecord>;
  setActive(id: string, isActive: boolean): Promise<void>;
}
```

A service that wants to look up a user injects the port, not a concrete class:

```ts
constructor(
  @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
) {}
```

`USER_REPOSITORY` is a `Symbol` (see `tokens.ts`) — using symbols instead of strings prevents accidental name collisions.

### 4.2 What is an adapter?

An **adapter** is a class that implements a port using one specific technology. For users we have `UserPgRepository` (Postgres via TypeORM). For files we have `LocalFileStorage` (disk).

```ts
// backend/src/core/storage.pg/user.repository.pg.ts
@Injectable()
export class UserPgRepository implements IUserRepository {
  constructor(@InjectRepository(UserEntity) private readonly users: Repository<UserEntity>) {}
  /* ...implements the four methods ... */
}
```

### 4.3 Where they are wired together

`backend/src/core/storage/storage.module.ts` is the only file that knows about both sides:

```ts
providers: [
  { provide: USER_REPOSITORY, useClass: UserPgRepository },
  { provide: FILE_STORAGE, useFactory: (cfg) => {
      switch (cfg.getOrThrow('STORAGE_DRIVER')) {
        case 'local': return new LocalFileStorage(...);
        // case 'azure': return new AzureBlobStorage(...);
      }
    }, inject: [ConfigService] },
],
```

To swap a backing technology you add a new adapter folder, then one line in this file. **Nothing else changes.** See recipes 11.5 and 11.6.

---

## 5. Configuration & secrets

The env file `.env` is the **only** source of configuration. The backend validates it at boot using `EnvConfig` in `backend/src/core/config/configuration.ts`:

```ts
@IsString() @MinLength(32) JWT_ACCESS_SECRET!: string;
@IsInt() MAX_UPLOAD_BYTES!: number;
@IsIn(['local','azure','gcs']) STORAGE_DRIVER!: 'local'|'azure'|'gcs';
```

If any value is missing, malformed, or too short, **the backend refuses to start**. The error log spells out which key is bad. No "silent default" surprises.

To add a new env variable:

1. Add the field with its decorators in `EnvConfig`.
2. If it's numeric, add its name to the `numbers` array in `validateEnv()`.
3. Add it to `.env.example` with a sensible default and a comment.
4. Plumb it into `docker-compose.yml`'s `backend.environment` section.
5. Reach it from code with `cfg.getOrThrow<string>('YOUR_VAR')`.

---

## 6. Authentication & permissions

### 6.1 Password hashing

`PasswordService.hash()` uses **argon2id** with OWASP-recommended parameters (`memoryCost: 19_456`, `timeCost: 2`, `parallelism: 1`). Verification uses constant-time compare from the underlying library. Don't roll your own.

### 6.2 Token model

Two tokens are issued at login:

| Token              | Lifetime | Where it lives                          | Used for                                |
|--------------------|----------|------------------------------------------|------------------------------------------|
| `access_token`     | 15 min   | httpOnly cookie `access_token` (path `/`) | Stateless authentication on every request |
| `refresh_token`    | 14 days  | httpOnly cookie `refresh_token` (path `/auth`) | Getting a new access token; SHA-256 hash stored in `refresh_tokens` |

The refresh token is **rotated** on every use: when the client calls `POST /auth/refresh`, the old token is revoked and a new pair is issued. If a previously revoked or unknown token is presented, **the entire family for that user is revoked** as a leaked-token defence.

### 6.3 Permission flow

Every protected route is annotated:

```ts
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sheets:write')
@Patch(':id/rows/:rowId')
updateCell(...) { ... }
```

`PermissionsGuard` reads the metadata, calls `IPermissionRepository.listForUser(userId)`, and throws 403 with a list of missing permissions if any.

Permission codes are **stable strings**. The canonical list lives in `backend/src/modules/permissions/permissions.seeder.ts` and is upserted into the DB on every boot. To add a permission, edit that array — see recipe 11.3.

### 6.4 Why httpOnly cookies, not localStorage?

- localStorage tokens are reachable from any XSS — one stray dependency with an exploit and your token is exfiltrated.
- httpOnly cookies cannot be read by JavaScript at all. With `SameSite=lax` they also block most CSRF unless paired with a state-changing GET (which we don't have).

The frontend never needs to read the token; it just sends `credentials: 'include'`.

---

## 7. Spreadsheet pipeline

```
        ┌──────────────────────────────┐
        │  HTTP POST /spreadsheets/    │
        │           upload             │
        │  multipart/form-data         │
        └──────────────┬───────────────┘
                       │
                       ▼
        SpreadsheetsController.upload()
                       │
                       │  per file:
                       ▼
        SpreadsheetParser.parse(buffer, name)
            ├─ .csv / .tsv / .tab  ─→ delimited text parser
            ├─ .xlsx               ─→ ExcelJS reader
            ├─ .ods                ─→ SheetJS reader
            └─ .xls                ─→ SheetJS reader (legacy CFB)
                            │
                            ▼  magic-byte verified
                       ParsedSheet { columns, rows }
                            │
                            ▼
        SpreadsheetsService.uploadOne()
                            │
                            ▼
        ISpreadsheetRepository.create()  ── transactional
            ├─ INSERT spreadsheets
            └─ INSERT spreadsheet_rows (chunked, 1000 at a time)
```

### Why two parser libraries?

| Format | Library  | Why                                                                        |
|--------|----------|----------------------------------------------------------------------------|
| `.xlsx` | ExcelJS  | Closest to what real Excel files look like in production; preserves rich-text |
| `.ods`  | SheetJS  | Most complete community parser for OpenDocument                            |
| `.xls`  | SheetJS  | Handles the legacy CFB binary format                                       |
| `.csv` / `.tsv` / `.tab` | (in-house) | Delimiter-parameterised; avoids a dependency for a 30-line task |

**`.xlsm`, `.xlsb`, `.xltm` are rejected at the boundary** with a specific error. Their macro payload can survive a round-trip through this tool and attack the user when they re-open the export in Excel — out-of-scope for a zero-trust posture.

`MergeService` is similar — given multiple `SpreadsheetRecord`s, it streams rows page-by-page from the repository and accumulates them. The **append** strategy preserves union of columns; the **join** strategy keys rows by the chosen column. Empty cells are written as `null` to keep `data[col]` consistently defined.

`ExportService` produces XLSX via ExcelJS (with bolded header row) or CSV with proper RFC 4180 escaping for commas, quotes, and newlines.

> All spreadsheet rows are stored in Postgres as `jsonb` — flexible schema, indexable later, queryable with `->>`. If the data outgrows a single jsonb column (multi-MB rows), the next step is to project specific columns into typed columns; the port interface won't change.

---

## 8. Frontend architecture

### 8.1 Stack

- **Vite** — instant dev server, sub-second HMR, ESBuild + SWC.
- **React 18** with the new automatic batching and concurrent root.
- **TanStack Query** — caches server state, handles refetching, invalidation, mutations with `onSuccess` hooks. We do not use Redux; server state is owned by Query, UI state by component `useState`.
- **TanStack Table + Virtual** — header-less core table model with virtualised rows. The grid in `SpreadsheetGrid.tsx` is the bigger piece, with windowed row rendering that stays smooth past 200k rows.
- **React Router v6** — file-less routing in `App.tsx`.

### 8.2 Data flow

```
api/spreadsheets.ts  (typed fetch wrappers)
        ▲
        │ used by hooks via useQuery / useMutation
        │
DashboardPage  /  SheetPage  /  MergeDialog
        ▲
        │ wrap in <ProtectedRoute requirePermission="...">
        │
App.tsx Routes
        ▲
        │ inside <AuthProvider>
        │
main.tsx → ReactDOM root
```

`AuthProvider` exposes `{ status, session, login, register, logout, hasPermission }`. On mount it calls `/auth/me` to hydrate; on 401 it falls into `guest` mode.

`api/client.ts` implements the **single-flight refresh dance**: on a 401, all callers wait on one in-flight `POST /auth/refresh`, and if it succeeds, the original requests are replayed. This means you can have ten parallel queries open and they all keep working after a silent token rotation.

### 8.3 The virtualised grid

`SpreadsheetGrid.tsx` is intentionally the only complicated frontend file. The model:

- **A sparse buffer** of rows indexed by global row index.
- **`useVirtualizer`** computes which row indices are about to be rendered.
- **A page-fetch effect** notices when the rendered range crosses a page boundary, fetches the missing page from `/spreadsheets/:id/rows?offset=...&limit=...`, and stitches it into the buffer.
- **`EditableCell`** is uncontrolled until the user double-clicks (or presses Enter/F2). Commit fires `sheetsApi.updateCell(...)`; success replaces the row in the buffer with the canonical server response so server-side coercion (e.g. number stayed a number) is reflected.

Adding new column types (date, currency, dropdown) means swapping the `<input>` in `EditableCell` for a wrapper. Don't smear that logic across cells; centralise it.

---

## 9. Database schema

Auto-generated by TypeORM from the entities in `backend/src/core/storage.pg/entities/`. The shape:

```
users                       ── citext email is unique
  id           uuid PK
  email        citext UNIQUE
  password_hash text
  display_name text NULL
  is_active    bool DEFAULT true
  created_at, updated_at

user_roles                  ── join table
  user_id      uuid FK users.id
  role_id      uuid FK roles.id

roles
  id           uuid PK
  name         text UNIQUE        -- e.g. "tutor", "admin"
  description  text

role_permissions            ── join table
  role_id          uuid FK roles.id
  permission_id    uuid FK permissions.id

permissions
  id           uuid PK
  code         text UNIQUE        -- e.g. "sheets:write"
  description  text

refresh_tokens              ── one row per refresh-token issuance
  id           uuid PK
  user_id      uuid FK users.id (indexed)
  token_hash   text UNIQUE        -- sha256 hex; raw token never persisted
  expires_at   timestamptz
  revoked_at   timestamptz NULL
  created_at

spreadsheets
  id           uuid PK
  owner_id     uuid (indexed)
  name         text
  columns      jsonb              -- ["Name","Email",...] in order
  row_count    int
  created_at, updated_at

spreadsheet_rows            -- indexed on (spreadsheet_id, row_index)
  id              uuid PK
  spreadsheet_id  uuid
  row_index       int                 -- gaps allowed for cheap reordering
  data            jsonb               -- { "Name": "Alice", "Email": ... }
```

### Moving from `synchronize` to migrations

`StorageModule.forRoot()` currently passes `synchronize: cfg.get('NODE_ENV') !== 'production'`. This is convenient in dev but **unsafe in production** because it can drop columns. Before serving real data, migrate to TypeORM migrations:

```bash
# in backend/
npx typeorm migration:generate -d src/datasource.ts src/migrations/Initial
npx typeorm migration:run
```

Then flip `synchronize: false` for all environments and run migrations explicitly on deploy.

---

## 10. HTTP API reference

All paths are relative to the backend base. Cookies (`access_token`, `refresh_token`) are sent automatically by the browser when `credentials: 'include'` is set.

### Auth

| Method | Path                | Auth          | Body                                            | Returns                       |
|--------|---------------------|---------------|-------------------------------------------------|-------------------------------|
| POST   | `/auth/register`    | none          | `{email, password, displayName?}`               | `{ user }` + sets cookies     |
| POST   | `/auth/login`       | none          | `{email, password}`                             | `{ user }` + sets cookies     |
| POST   | `/auth/refresh`     | refresh cookie| —                                                | `{ ok: true }` + new cookies  |
| POST   | `/auth/logout`      | access cookie | —                                                | 204; revokes all refresh tokens for user |
| POST   | `/auth/me`          | access cookie | —                                                | `{ user, permissions: [] }`   |

### Spreadsheets

All require `access_token`, plus the listed permission. Cross-owner access is rejected with 403 inside the repository.

| Method | Path                                  | Permission       | Body / Query                                                  | Returns                  |
|--------|---------------------------------------|------------------|----------------------------------------------------------------|--------------------------|
| GET    | `/spreadsheets`                       | `sheets:read`    | —                                                              | `Spreadsheet[]`          |
| POST   | `/spreadsheets/upload`                | `sheets:write`   | multipart, field `files` — `.xlsx`, `.xls`, `.ods`, `.csv`, `.tsv`, `.tab` (≤ 20 files, ≤ 50 MB each; `.xlsm`/`.xlsb`/`.xltm` rejected) | `{ created: Spreadsheet[] }` |
| POST   | `/spreadsheets/merge`                 | `sheets:write`   | `{name, strategy:'append'\|'join', joinOn?, sources:[{spreadsheetId}], consumeSources?}` | `Spreadsheet`            |
| GET    | `/spreadsheets/:id`                   | `sheets:read`    | —                                                              | `Spreadsheet`            |
| GET    | `/spreadsheets/:id/rows`              | `sheets:read`    | query `?offset=0&limit=100`                                    | `{rows, total, columns}` |
| PATCH  | `/spreadsheets/:id/rows/:rowId`       | `sheets:write`   | `{column, value: string\|number\|boolean\|null}`               | updated `SpreadsheetRow` |
| DELETE | `/spreadsheets/:id`                   | `sheets:delete`  | —                                                              | 204                      |
| GET    | `/spreadsheets/:id/export?format=xlsx\|csv` | `sheets:export` | —                                                          | binary attachment        |

### Admin

Every route requires `users:admin`. The service layer enforces **self-lockout protections**: an admin cannot deactivate / demote / delete themselves, and the system refuses to remove the admin role from the last remaining admin.

| Method | Path                                       | Body / Query                                                         | Returns                       |
|--------|--------------------------------------------|----------------------------------------------------------------------|--------------------------------|
| GET    | `/admin/stats`                             | —                                                                    | `{userCount, activeUserCount, adminCount, sheetCount, totalRowCount}` |
| GET    | `/admin/roles`                             | —                                                                    | `RoleRecord[]` (read-only)    |
| GET    | `/admin/users`                             | `?search&offset&limit`                                                | `{users: AdminUserDto[], total}` |
| GET    | `/admin/users/:id`                         | —                                                                    | `AdminUserDto`                 |
| PATCH  | `/admin/users/:id`                         | `{displayName?, isActive?}`                                          | updated `AdminUserDto`         |
| PATCH  | `/admin/users/:id/roles`                   | `{roleNames: string[]}` — full replace                               | updated `AdminUserDto`         |
| POST   | `/admin/users/:id/password`                | `{password}` (≥ 12 chars). Also revokes all sessions                  | 204                            |
| POST   | `/admin/users/:id/revoke-sessions`         | —                                                                    | 204                            |
| DELETE | `/admin/users/:id`                         | —                                                                    | 204 (cascades sheets + tokens) |

`AdminUserDto` is a deliberately narrow projection of `UserRecord` — **it never includes `passwordHash`**. If you add a new field to `UserRecord`, decide explicitly whether admins should see it and update `toAdminDto()` accordingly.

### Response shape on error

```json
{ "message": "what went wrong", "statusCode": 400 }
```

Never includes a stack trace. Internal errors collapse to `{ message: "internal server error", statusCode: 500 }`; check `docker compose logs backend` for the real cause.

---

## 11. Recipes

### 11.1 Add a new endpoint

Example: `GET /spreadsheets/:id/summary` returning row count, column count, and last-updated.

1. **DTO** (if there's input). For this one, no body needed; nothing to add.
2. **Service method** — `backend/src/modules/spreadsheets/spreadsheets.service.ts`:

   ```ts
   async summary(id: string, requesterId: string) {
     const s = await this.get(id, requesterId);   // already auth-checks
     return { rowCount: s.rowCount, columnCount: s.columns.length, updatedAt: s.updatedAt };
   }
   ```

3. **Controller** — `spreadsheets.controller.ts`:

   ```ts
   @RequirePermissions('sheets:read')
   @Get(':id/summary')
   summary(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: RequestUser) {
     return this.sheets.summary(id, user.id);
   }
   ```

4. **Frontend** — add to `api/spreadsheets.ts`:

   ```ts
   summary: (id: string) => request<Summary>(`/spreadsheets/${id}/summary`),
   ```

5. **Use it** with `useQuery({ queryKey: ['sheet', id, 'summary'], queryFn: () => sheetsApi.summary(id) })`.

### 11.2 Add a new entity / table

Example: track per-sheet *tags*.

1. Define the entity in `backend/src/core/storage.pg/entities/tag.entity.ts` with TypeORM decorators.
2. Add it to the `entities` array in `StorageModule.forRoot()`.
3. Define a port `ITagRepository` in `backend/src/core/storage/ports/tag.repository.ts`.
4. Implement the Postgres adapter in `backend/src/core/storage.pg/tag.repository.pg.ts`.
5. Add a new DI token `TAG_REPOSITORY` in `ports/tokens.ts` and wire it in `storage.module.ts`'s `providers` array.
6. Inject `@Inject(TAG_REPOSITORY)` wherever you need it.

Notice the service/controller layer **does not import the entity or the adapter** — they only see the port.

### 11.3 Add a new permission

1. In `backend/src/modules/permissions/permissions.seeder.ts`, add an entry to `PERMISSIONS`:

   ```ts
   { code: 'sheets:share', description: 'Share spreadsheets with other tutors' },
   ```

2. Add it to whichever roles should have it in the `ROLES` array (usually both `tutor` and `admin`, or just `admin`).

3. Restart the backend (`docker compose up -d --build backend`). The seeder upserts on boot.

4. Apply on routes:

   ```ts
   @RequirePermissions('sheets:share')
   @Post(':id/share')
   share(...) {...}
   ```

5. On the frontend, gate UI affordances:

   ```tsx
   const { hasPermission } = useAuth();
   {hasPermission('sheets:share') && <ShareButton />}
   ```

   Permissions also gate routes via `<ProtectedRoute requirePermission="sheets:share">`.

### 11.4 Add a new role

Add an entry to `ROLES` in `permissions.seeder.ts`. Restart. Promote a user with the SQL snippet in `INSTRUCTIONS.md › 6. Create the first admin user`.

### 11.5 Swap file storage to Azure Blob Storage

1. **Adapter**. Create `backend/src/core/storage.azure/file.storage.azure.ts`:

   ```ts
   import { BlobServiceClient } from '@azure/storage-blob';
   import { IFileStorage, PutOptions } from '../storage/ports/file.storage';

   export class AzureBlobStorage implements IFileStorage {
     private readonly container;
     constructor(connectionString: string, containerName: string) {
       const service = BlobServiceClient.fromConnectionString(connectionString);
       this.container = service.getContainerClient(containerName);
     }
     async putBuffer(key: string, data: Buffer, opts: PutOptions) {
       await this.container.getBlockBlobClient(key).uploadData(data, {
         blobHTTPHeaders: { blobContentType: opts.contentType },
       });
       return { key, size: data.length };
     }
     async getStream(key: string) {
       const d = await this.container.getBlockBlobClient(key).download();
       return d.readableStreamBody as NodeJS.ReadableStream as any;
     }
     async delete(key: string) {
       await this.container.getBlockBlobClient(key).deleteIfExists();
     }
   }
   ```

2. **Env**. Add two new keys to `.env.example` and `EnvConfig`:

   ```
   AZURE_BLOB_CONN_STRING=
   AZURE_BLOB_CONTAINER=practicas
   ```

3. **Wire**. In `core/storage/storage.module.ts`, extend the `FILE_STORAGE` factory:

   ```ts
   case 'azure':
     return new AzureBlobStorage(
       cfg.getOrThrow<string>('AZURE_BLOB_CONN_STRING'),
       cfg.getOrThrow<string>('AZURE_BLOB_CONTAINER'),
     );
   ```

4. **Switch**. In `.env`, set `STORAGE_DRIVER=azure`. Restart.

No controller, service, or frontend change. Same recipe applies to **Google Cloud Storage** (`@google-cloud/storage`).

### 11.6 Swap the database engine

The port for persistence is `ISpreadsheetRepository` (and friends). To run on, for example, MongoDB:

1. Create `backend/src/core/storage.mongo/` with one repository class per port, using the official `mongodb` driver.
2. Add a `DB_DRIVER` env var (alongside `STORAGE_DRIVER`).
3. In `core/storage/storage.module.ts`, conditionally bind the repository classes based on `DB_DRIVER`. Keep the TypeORM module gated to `pg`.
4. Optionally short-circuit `synchronize: ...` for non-pg drivers.

This is more invasive than file storage because there's more surface area (5 ports vs 1), but it's the same pattern.

### 11.7 Add Google / Azure OAuth

You do **not** want to write new auth flows. Plug in a Passport strategy.

1. `npm install passport-google-oauth20` (or `passport-azure-ad`).
2. Create `backend/src/modules/auth/google.strategy.ts` that calls `super({ clientID, clientSecret, callbackURL, scope: ['email','profile'] })` and in `validate()` looks up or creates the user in `IUserRepository` with role `tutor`.
3. Register it in `AuthModule` providers.
4. Add `GET /auth/google` (kicks off OAuth) and `GET /auth/google/callback` (lands users in the app with the same `setAuthCookies()` helper already in `AuthController`).
5. Add a "Sign in with Google" button on `LoginPage.tsx` that just navigates to `/auth/google`.

No DB schema changes — the existing `users` table already supports OAuth-created users (the `passwordHash` column is required, but you can store a random hash; OAuth users never use it).

### 11.8 Increase the max upload size

1. Edit `.env`: `MAX_UPLOAD_BYTES=104857600` (100 MB).
2. If you're behind nginx/Caddy, raise `client_max_body_size` to match.
3. Restart backend: `docker compose up -d --build backend`.

Also consider raising `MAX_ROWS_PER_FILE` — the parser refuses to ingest beyond this regardless of file size, as a memory safety bound.

### 11.9 Add server-side TLS (without a reverse proxy)

This is **not recommended** — let a battle-tested proxy (Caddy / nginx / Traefik) terminate TLS. If you must:

1. Mount certificates into the backend container: `volumes: ./certs:/certs:ro`.
2. In `main.ts`, pass `httpsOptions` to `NestFactory.create()`:

   ```ts
   import { readFileSync } from 'fs';
   const app = await NestFactory.create(AppModule, {
     httpsOptions: { key: readFileSync('/certs/key.pem'), cert: readFileSync('/certs/cert.pem') },
   });
   ```

### 11.10 Add a new admin action

The admin panel lives in `modules/admin/` and is gated entirely by the `users:admin` permission. Adding a new admin-only action — for example, "freeze sheet uploads system-wide" — follows the standard recipe with one extra rule.

1. **Port** the new persistence concern as usual (§ 11.2). For ops-flags, that might be a tiny `ISystemSettingsRepository`.
2. **Service method** in `admin.service.ts` that orchestrates ports. Cross-port operations belong here, not in controllers.
3. **Self-lockout checks**: any action that can leave the system in a non-recoverable state must guard against the actor doing it to themselves OR against acting on the last instance of something (last admin, last seat). Pattern:
   ```ts
   if (actingUserId === targetId) throw new ForbiddenException('cannot X yourself');
   if (await this.users.countByRole(ADMIN_ROLE) <= 1)
     throw new ConflictException('cannot remove the last admin');
   ```
4. **Controller** route on `AdminController`. The controller already declares `@RequirePermissions('users:admin')` at class level, so no decorator needed on the handler — but feel free to add a tighter permission if you want to split the admin role.
5. **DTO** with `class-validator` exactly like the existing ones.
6. **Public projection**: if the route returns user data, route it through `toAdminDto()` so the password hash never leaks. **Do not** return raw `UserRecord` from admin routes.
7. **Frontend**: add the API method in `frontend/src/api/admin.ts`, then surface the action in `AdminUserDetailPage.tsx` (or build a new admin page if it's a system-wide action).

### 11.11 Add a new file format

Currently accepted: `.xlsx`, `.xls`, `.ods`, `.csv`, `.tsv`, `.tab`. Suppose you want to add Apple Numbers (`.numbers`).

1. **Pick a parser**. SheetJS doesn't read `.numbers`; you'd need a library like `numbers-parser` (Python) or to call out to a subprocess. Vet it for security and licensing before committing.

2. **Register the format**. In `backend/src/modules/spreadsheets/parser.service.ts`, add to `HANDLERS`:

   ```ts
   {
     extensions: ['.numbers'],
     parser: 'numbers',           // new branch name
     acceptMagic: ['zip'],        // .numbers files are zip containers
   },
   ```

3. **Extend the union**. Update `FormatHandler.parser` to `'csv' | 'xlsx' | 'sheetjs' | 'numbers'`.

4. **Implement the branch**. Add a `case 'numbers':` to the `switch` in `parse()` that calls a new private `parseNumbers(buffer, maxRows)` method returning a `ParsedSheet`.

5. **Update the frontend hint**. Add the MIME + extension to `frontend/src/components/UploadDropzone.tsx`'s `accept` map and the on-screen hint string.

6. **Update docs**. README features list, INSTRUCTIONS troubleshooting, and the API table in this file.

Notice that the controller, service, repository, and database **do not change**. Format support is fully contained in the parser.

### 11.12 Add a feature flag

Don't introduce a flag library yet — for a single flag, just read the env:

```ts
const enableMerge = this.cfg.get<string>('ENABLE_MERGE') === 'true';
if (!enableMerge) throw new ForbiddenException();
```

When you have three or more, introduce a small `FeatureFlagsService` (a port) so flags can later move to LaunchDarkly / GrowthBook without touching call sites.

---

## 12. Testing strategy (todo)

The current codebase does not ship tests. When adding them, prefer:

- **Unit tests** for pure logic: `MergeService.append/joinByColumn`, `SpreadsheetParser` (CSV branch is pure; xlsx branch is also pure given a fixture buffer).
- **E2E / integration tests** for the auth flow and `PermissionsGuard` — these have a lot of moving parts and are where regressions hurt most. Use NestJS's `Test.createTestingModule` with a real Postgres in a sidecar (`testcontainers-node`) so you actually exercise the SQL.

Avoid mocking `IUserRepository` — the integration value is the SQL itself. Use the real Postgres adapter against a disposable database.

---

## 13. Code style & conventions

- **No `any`.** If TypeScript can't be made to know something, narrow at the boundary and assert the shape with a class-validator DTO.
- **Strict equality.** No `==`.
- **DTOs validate everything.** Never trust a body, query, or param. `ParseUUIDPipe` for path UUIDs.
- **Every DTO field needs a decorator.** The global ValidationPipe runs `whitelist: true`, which silently strips any property without a `class-validator` decorator. If you want a field to pass through without validation (rare — e.g. a union type validated manually inside the controller), tag it with `@Allow()` from `class-validator`. An undecorated, undocumented field is invisible to the framework.
- **Errors are HTTP exceptions.** `throw new BadRequestException(...)`, `NotFoundException(...)`, `ForbiddenException(...)`. The filter takes care of the response shape.
- **Cross-tenant checks live in repositories.** A leaked id should never grant access just because the caller passed the auth guard.
- **No comments that restate the code.** Comments explain *why*, not *what*. If you found yourself writing one, ask if the function name should change instead.
- **No premature abstraction.** If the only consumer of an interface is one class, inline the concrete dependency. Ports exist because we explicitly want to swap implementations; not as a default.
- **Component state is local.** Server state goes through TanStack Query. We do not have a global store; if we ever do, the bar to add one is "three independent components need to mutate the same data within one user action".

---

## 14. Glossary

- **Adapter** — concrete implementation of a port (e.g. Postgres repository).
- **Argon2id** — modern memory-hard password hashing algorithm; current OWASP recommendation.
- **citext** — Postgres extension providing case-insensitive text comparison; used here for `users.email` so `Alice@x.com` and `alice@x.com` are the same user.
- **DTO** — Data Transfer Object. Class-validator decorated input shape, used to validate request bodies and queries.
- **Hexagonal architecture** — synonym for ports & adapters.
- **httpOnly cookie** — cookie that JavaScript cannot read; mitigates token theft via XSS.
- **JTI** — JWT ID claim; a unique random identifier per token, used here to detect reuse of revoked refresh tokens.
- **Port** — interface that declares what business logic needs from infrastructure.
- **RBAC** — Role-Based Access Control. Permissions group into roles; users get roles.
- **SameSite=lax** — cookie attribute that prevents the browser from sending the cookie on most cross-site requests; mitigates CSRF.
- **Single-flight refresh** — pattern where many concurrent expired-token requests are coalesced into one refresh attempt to avoid thundering-herd refresh storms.
- **Virtualised list** — UI technique where only the visible rows are rendered to the DOM, allowing huge data sets without freezing the browser.
