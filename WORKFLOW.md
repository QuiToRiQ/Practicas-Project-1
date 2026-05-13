# Workflow

How this project is meant to be worked on, from "first boot today" through "six months from now, fixing a bug on a Friday afternoon."

> Companion to the other docs: `README.md` is the elevator pitch, `INSTRUCTIONS.md` is for IT/ops, `DEVELOPMENT.md` is the deep dive into the code. This file is the *process* — what you do, in what order, day to day.

---

## Table of contents

1. [Two modes of running the app](#1-two-modes-of-running-the-app)
2. [One-time setup](#2-one-time-setup)
3. [The daily inner loop](#3-the-daily-inner-loop)
4. [Implementing a new feature, step by step](#4-implementing-a-new-feature-step-by-step)
5. [Testing and verifying changes](#5-testing-and-verifying-changes)
6. [Source-control workflow](#6-source-control-workflow)
7. [Releasing a new version](#7-releasing-a-new-version)
8. [Long-term operations](#8-long-term-operations)
9. [Onboarding a new developer in 30 minutes](#9-onboarding-a-new-developer-in-30-minutes)
10. [Where the seams are](#10-where-the-seams-are)

---

## 1. Two modes of running the app

The same codebase runs in **two distinct modes**. Pick the right one for what you're doing.

| Mode      | Command                              | When to use it                          | Hot reload? |
|-----------|--------------------------------------|------------------------------------------|-------------|
| **Prod-like** (all-in-docker) | `docker compose up --build`             | Final smoke-test before deploy, demos, deploy to the school | No — full rebuild |
| **Dev** (split)               | DB in docker, backend + frontend on host | Day-to-day coding                        | Yes — instant    |

**Why split for dev?** The all-in-docker build is slow (3–5 min) and the Vite dev server / NestJS watcher are dramatically faster than rebuilding container images for every edit. The DB is fine in Docker — you almost never touch it.

### Dev-mode boot sequence

```bash
# Terminal 1 — Postgres only
docker compose up db

# Terminal 2 — backend, with auto-restart on file change
cd backend
npm install                        # first time only
npm run start:dev                  # watches src/, restarts on save

# Terminal 3 — frontend with hot-module-replacement
cd frontend
npm install                        # first time only
npm run dev                        # Vite at http://localhost:5173
```

Vite already proxies `/api/*` to `http://localhost:3001` (see `frontend/vite.config.ts`), so the frontend reaches your local backend without CORS hassles. The DB connection comes from `.env` — `DB_HOST=localhost` for split mode, `DB_HOST=db` for full-docker mode.

> **Pitfall**: `.env` is shared between both modes. If you switch from full-docker to split mode, change `DB_HOST=db` → `DB_HOST=localhost`. A clean alternative is keeping two files: `.env` (split mode) and `.env.docker` (loaded only by `docker compose --env-file .env.docker up`).

---

## 2. One-time setup

```bash
# Tools you should have on the host
docker --version            # ≥ 24
docker compose version      # ≥ v2
node --version              # ≥ 20
git --version

# In your editor: install
#   - ESLint / Prettier (if you add them)
#   - the official "Docker" extension
#   - "Tailwind CSS IntelliSense" if you use VS Code
```

If you haven't already, put this under version control today (the directory is not a git repo yet):

```bash
cd /path/to/spreadsheet-tool
git init
git add .
git commit -m "initial scaffold: nest+react+postgres, ports/adapters, auth, sheets"
```

Then push to a private GitHub / GitLab / Gitea repo. **Never commit `.env`** — it's already in `.gitignore`.

---

## 3. The daily inner loop

```
edit a file  →  save  →  watcher restarts  →  test in browser  →  repeat
                                                    │
                                          if it broke, read the logs:
                                                    │
                                       docker compose logs -f backend
                                       or just look at the npm start:dev terminal
```

That's it. The whole point of dev mode is that you don't think about anything else during this loop. Each watcher restarts in under a second.

> **Never type `docker compose down -v` directly** — the `-v` flag drops named volumes and erases the database + uploaded files. Use `make reset` instead, which takes a backup first and tells you how to undo. See § 8 for the full backup workflow.

When something is unclear:

- **Database state**: `docker compose exec db psql -U practicas -d practicas` → run SQL directly.
- **What a request actually sends**: open browser DevTools → Network tab → filter by `/api/`.
- **What the backend received**: drop a `console.log(...)` in the controller temporarily; the watcher reloads on save.

---

## 4. Implementing a new feature, step by step

Use the same shape every time — it's what the whole architecture is set up for. As a worked example, suppose you want to **add a tag system** ("freshman", "second-year", etc.) attachable to a sheet.

### Step 1 — Plan in two sentences

Write down, in plain language, what the user can do and what's required to do it. *"Tutors can attach any number of free-form tags to a sheet. A new permission `sheets:tag` controls who can add or remove them."* Now you know what you're building.

### Step 2 — Database / port shape

Open `backend/src/core/storage/ports/`. Ask: is this a new persistence concern, or an extension of an existing one? Tags are new → add a new port:

```ts
// backend/src/core/storage/ports/tag.repository.ts
export interface TagRecord { id: string; sheetId: string; label: string; }
export interface ITagRepository {
  list(sheetId: string): Promise<TagRecord[]>;
  add(sheetId: string, label: string): Promise<TagRecord>;
  remove(sheetId: string, tagId: string): Promise<void>;
}
```

Add a DI token in `ports/tokens.ts`:

```ts
export const TAG_REPOSITORY = Symbol('TAG_REPOSITORY');
```

### Step 3 — Postgres adapter

In `backend/src/core/storage.pg/`:

- Add `entities/tag.entity.ts` (TypeORM entity, FK to sheet)
- Add `tag.repository.pg.ts` implementing `ITagRepository`
- Register the entity + adapter in `core/storage/storage.module.ts`

### Step 4 — Permission

In `backend/src/modules/permissions/permissions.seeder.ts`, add `'sheets:tag'` to `PERMISSIONS` and to whichever roles should have it (probably both `tutor` and `admin`). Restart the backend → seeder upserts on boot.

### Step 5 — Service + controller

In `backend/src/modules/spreadsheets/` (or a new `tags` module if it gets bigger):

```ts
// service depends on the port, not the adapter
constructor(@Inject(TAG_REPOSITORY) private readonly tags: ITagRepository) {}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sheets:tag')
@Post(':id/tags')
add(@Param('id') id: string, @Body() dto: AddTagDto, @CurrentUser() u: RequestUser) {
  // verify owner via existing sheet service, then call this.tags.add(...)
}
```

DTO with `class-validator`, just like the existing ones.

### Step 6 — Frontend API + UI

- Add typed methods to `frontend/src/api/spreadsheets.ts` (or a new `tags.ts`).
- Build the UI in `frontend/src/components/`. Gate visibility with `useAuth().hasPermission('sheets:tag')`.

### Step 7 — Verify

Run the manual checklist (next section). Commit. Push.

That's the whole shape — **port → adapter → service → controller → API client → UI**. Every new feature follows this exact pattern. There is no clever variation. If you find yourself doing something else, ask why.

---

## 5. Testing and verifying changes

The project ships without an automated test suite (intentional v1 cut). For now, this is your manual checklist before considering a change "done":

### 5.1 The five-minute self-test

1. **Typecheck passes** in both projects:
   ```bash
   (cd backend && npx tsc --noEmit) && (cd frontend && npx tsc --noEmit)
   ```
   Should produce zero output.
2. **Production build succeeds**: `npm run build` in each. Catches things `tsc --noEmit` misses (decorator metadata, bundler-only issues).
3. **Auth still works**: log out, log back in, refresh the page — your session survives.
4. **Permission boundary still works**: temporarily strip your own role with SQL and confirm the gated UI hides + the API returns 403.
5. **Happy path of the change**: do the user-facing action you just built.
6. **One sad path**: try the obvious bad input. Confirm the error message is sensible and no stack trace leaks.

### 5.2 When tests start to matter

Add tests the day you have your second tutor user or your first real bug report. Start with:

```bash
cd backend
npm install --save-dev @nestjs/testing supertest testcontainers @types/supertest
```

…and add a single integration spec for the auth + permissions flow. It's the part with the highest cost-of-regression. Pure-function services (`MergeService`, `SpreadsheetParser`) are easy unit-test targets too. See `DEVELOPMENT.md § 12` for the strategy.

---

## 6. Source-control workflow

Solo-project conventions, kept light:

```
main                     ← always deployable
├── feature/tag-system   ← branch per change
├── fix/login-secure-cookie
└── chore/bump-nest-11
```

**Branch lifecycle**:

```bash
git checkout -b feature/tag-system
# ...code...
git add backend/src/... frontend/src/...    # never `git add .` blindly
git commit -m "tags: add ITagRepository + Postgres adapter + sheets:tag permission"
git push -u origin feature/tag-system
# open PR (if multi-person) or fast-forward merge to main if solo
```

**Commit messages**: imperative, focus on the "why" if non-obvious. *"sheets: reject xlsm at parser boundary — macros survive round-trip"* beats *"updated parser.service.ts"*.

**`.env` discipline**: if you ever introduce a new env variable, update **three** places in the same commit so nothing rots: `.env.example`, `EnvConfig` in `configuration.ts`, and `docker-compose.yml`'s `environment:` block.

---

## 7. Releasing a new version

The release pipeline for this project today is intentionally simple: **rebuild, deploy, verify**.

### 7.1 Versioning

Tag releases semver-style in git:

```bash
git tag -a v0.2.0 -m "tags + ods support"
git push origin v0.2.0
```

You're not publishing this to npm, so semver is a documentation convention more than a contract.

### 7.2 Deploy to the school server

On your dev machine, push the tag. On the server:

```bash
cd /opt/practicas
sudo /etc/cron.daily/practicas-backup     # safety dump before doing anything
git fetch --tags
git checkout v0.2.0
docker compose up -d --build              # rebuild only changed layers
docker compose ps                          # confirm all "Up" / "healthy"
```

If something's wrong: `git checkout v0.1.0 && docker compose up -d --build` rolls back code; the DB dump from the backup step rolls back data if a migration broke things.

### 7.3 Database schema changes

Right now `synchronize: true` in dev means TypeORM mutates the DB to match your entities. **You will outgrow this**. The transition:

1. Generate the initial migration from the current entity graph:
   ```bash
   cd backend
   # Add a DataSource file (one-time)
   npx typeorm migration:generate -d src/datasource.ts src/migrations/Initial
   ```
2. Flip `synchronize: false` for `production` (already gated on `NODE_ENV`).
3. From then on, every schema change is a migration committed alongside the entity change.
4. The deploy command becomes `docker compose run --rm backend npm run migration:run` *before* `docker compose up -d --build`.

Treat this as a milestone *before* you have real student data on the server.

---

## 8. Long-term operations

What you actually need to do over months, not days.

### 8.0 The backup workflow

The project ships with `make` targets that wrap `pg_dump` + the uploads volume. Use them — don't run `docker` commands by hand for this:

| Target                                            | What it does                                                      |
|---------------------------------------------------|-------------------------------------------------------------------|
| `make backup`                                     | Snapshot DB + uploads into `./backups/<timestamp>/`. Safe to run live. |
| `make list-backups`                               | Show what backups exist with their sizes                          |
| `make restore`                                    | Interactive restore from the most recent backup                   |
| `make restore FILE=backups/2026-05-14_103000`     | Restore from a specific backup                                    |
| `make reset`                                      | **Takes a backup, then** wipes and rebuilds. Use this instead of `down -v`. |
| `make clean`                                      | Wipes WITHOUT backing up first. Requires typing "destroy". Avoid. |

The rules of thumb:

1. **Run `make backup` before any change you're not sure about** — schema migrations, dependency upgrades, environment swaps. It's a 2-second insurance policy.
2. **Use `make reset` instead of `docker compose down -v`** when you need a clean slate. It backs up first, so any data loss is undoable.
3. **Restores wipe the current volume** before applying the backup — that's the only way to guarantee a clean state. The script asks you to type `restore` to confirm.
4. **`./backups/` is in `.gitignore`** — never commit them. Replicate them off-server with rsync / S3 sync for disaster recovery (INSTRUCTIONS § 8 has the snippets).

The 14-most-recent rule means after two weeks of daily `make backup`, the oldest one auto-evicts. Override with `BACKUP_RETAIN=30 make backup` if you want longer history.

### 8.1 Weekly

- Check `docker compose ps` shows everything healthy.
- Glance at `docker compose logs --since 7d backend | grep -iE 'error|fatal'`. Anything unexpected → investigate.
- Confirm the nightly backup ran: `ls -lh /var/backups/practicas/ | tail -3`. Sizes shouldn't be wildly different week-to-week.

### 8.2 Monthly

- `docker image prune -f` to reclaim disk.
- `docker compose pull` to refresh base images (Postgres, Node, nginx). Then `docker compose up -d --build` to actually use them.
- Audit dependencies: `cd backend && npm outdated`, same in frontend. Bump minor versions liberally; major versions deliberately.

### 8.3 Quarterly

- **Rotate secrets**: run the `openssl rand` commands again to regenerate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Restart backend. Every user has to sign in again, but old tokens are now worthless.
- **Test backup recovery**: take the most recent dump, restore it to a throwaway database (`docker run --rm -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16`), and verify it actually loads. A backup you've never restored is a wish, not a backup.

### 8.4 As needed

| Event                          | What to do                                                              |
|--------------------------------|--------------------------------------------------------------------------|
| User forgot password           | INSTRUCTIONS.md § 10 → "Reset a user's password"                         |
| User suspected of token theft  | `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ...` then ask them to re-login |
| Tutor leaves the school        | Set `is_active = false` on their user row; their sessions die at next access-token expiry |
| Disk filling up                | `docker system df`; usually old image layers or backups                  |
| User wants `.numbers` files    | DEVELOPMENT.md § 11.10 recipe                                            |
| Need to move to managed DB     | DEVELOPMENT.md § 11.6 recipe                                             |
| Need OAuth (Google / Azure)    | DEVELOPMENT.md § 11.7 recipe — Passport strategy, no auth-flow rewrite   |

---

## 9. Onboarding a new developer in 30 minutes

When you hand this off, here's the exact path you give them:

1. **First 5 min**: read `README.md` end to end.
2. **Next 5 min**: run the dev-mode boot sequence from § 1 above. Confirm the app comes up.
3. **Next 10 min**: read `DEVELOPMENT.md § 1–4` (architectural pillars + repo layout + request lifecycle + ports/adapters). This is the only conceptual material that doesn't show up in the code itself.
4. **Next 10 min**: make a trivial change end-to-end — e.g. add `email` to the response of `GET /spreadsheets/:id`. Touch the entity? No (already there). Touch the service? Maybe (return shape). Touch the controller? No. Touch the frontend type? Yes. This forces them through the layers without the pressure of a real feature.
5. **Open `DEVELOPMENT.md § 11 Recipes`** and tell them "your future feature work looks like one of these — pick the closest recipe before you start."

You're done. They can ship.

---

## 10. Where the seams are

Three places in the code can absorb large future changes without rewriting business logic. Know they exist; resist the urge to "improve" them prematurely.

| Seam                                                    | Absorbs                                              | Where                                                      |
|---------------------------------------------------------|------------------------------------------------------|-------------------------------------------------------------|
| `FILE_STORAGE` port                                     | Moving file storage to Azure Blob, GCS, S3, etc.     | `core/storage/storage.module.ts` factory                    |
| `USER_REPOSITORY` / `SPREADSHEET_REPOSITORY` ports       | Moving the DB to a managed service or different engine | Bind a new adapter behind the same Symbol                  |
| `AuthModule` strategies (Passport)                       | Adding Google / Azure AD / SAML / Keycloak             | New `xxx.strategy.ts` + one new controller route             |

If a feature request can be expressed as "use a different X behind one of these seams" — congratulations, no service or controller code changes.
