# Deployment Instructions

This document walks an IT administrator through deploying the **practicas** tool on a school server. It assumes you have **shell access** to a Linux machine and **administrator rights** to install software.

> **Estimated time**: 20–30 minutes for a basic install. Add 20 minutes if you also configure HTTPS with a reverse proxy.

---

## Table of contents

1. [Hardware & OS requirements](#1-hardware--os-requirements)
2. [Install prerequisites](#2-install-prerequisites)
3. [Get the project](#3-get-the-project)
4. [Configure environment](#4-configure-environment)
5. [Start the stack](#5-start-the-stack)
6. [Create the first admin user](#6-create-the-first-admin-user)
7. [Expose the app to users (HTTPS)](#7-expose-the-app-to-users-https)
8. [Backups](#8-backups)
9. [Updating to a new version](#9-updating-to-a-new-version)
10. [Operational tasks](#10-operational-tasks)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Hardware & OS requirements

| Resource         | Minimum                           | Recommended                       |
|------------------|-----------------------------------|-----------------------------------|
| CPU              | 2 cores                           | 4 cores                           |
| RAM              | 2 GB                              | 4 GB                              |
| Disk             | 10 GB                             | 50 GB (logs + uploads + DB)       |
| OS               | Ubuntu 22.04+ / Debian 12 / RHEL 9 | Ubuntu 24.04 LTS                  |
| Network          | One free TCP port for the app (default 80 for HTTPS via proxy) |

The app is fully containerised, so any Linux distribution with a recent kernel and Docker works.

---

## 2. Install prerequisites

You need **Docker Engine ≥ 24** and **Docker Compose plugin v2**.

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER   # so you don't have to sudo every docker command
newgrp docker
```

### Verify

```bash
docker --version              # Docker version 24.x.x or higher
docker compose version        # Docker Compose version v2.x.x
```

> If `docker compose version` says **"not a docker command"**, your installation only has the *legacy* `docker-compose` binary. Either install `docker-compose-plugin` from your package manager, or substitute `docker-compose` for `docker compose` in every command below.

---

## 3. Get the project

If you were given a `.zip` or `.tar.gz`:

```bash
mkdir -p /opt
cd /opt
tar xzf /path/to/practicas-tool.tar.gz       # or: unzip practicas-tool.zip
mv spreadsheet-tool practicas
cd practicas
```

If you have a Git URL:

```bash
sudo apt install -y git
cd /opt
git clone <your-git-url> practicas
cd practicas
```

---

## 4. Configure environment

```bash
cp .env.example .env
```

Open `.env` with `nano .env` and **change at minimum**:

| Variable                 | What to set it to                                                            |
|--------------------------|------------------------------------------------------------------------------|
| `POSTGRES_PASSWORD`      | A long random password (`openssl rand -base64 24`)                           |
| `JWT_ACCESS_SECRET`      | A long random string (`openssl rand -base64 64`)                             |
| `JWT_REFRESH_SECRET`     | A **different** long random string                                           |
| `COOKIE_DOMAIN`          | The domain users will type in the browser (e.g. `practicas.school.edu`) — use `localhost` only for local testing |
| `COOKIE_SECURE`          | `true` if served over HTTPS (recommended for any non-localhost deployment)   |
| `CORS_ORIGIN`            | The public URL of the frontend (e.g. `https://practicas.school.edu`)         |
| `VITE_API_URL`           | The public URL of the backend (e.g. `https://practicas.school.edu/api`)      |
| `STORAGE_DRIVER`         | Leave `local` unless you've configured Azure / GCS (see DEVELOPMENT.md)      |
| `MAX_UPLOAD_BYTES`       | Bytes per file (default 50 MB). Bump for very large spreadsheets.            |

Two one-liners that generate strong secrets in place:

```bash
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 64 | tr -d '\n')|"  .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')|" .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '\n')|"   .env
```

> **Never commit `.env` to Git.** It's already in `.gitignore`. Back it up to a password manager once secrets are set.

---

## 5. Start the stack

```bash
docker compose up -d --build
```

The first build takes **3–6 minutes** (it downloads Node, Postgres, builds the frontend bundle, and installs npm dependencies). Subsequent starts take **5–15 seconds**.

Check everything is healthy:

```bash
docker compose ps
```

You should see three services with **STATUS = "Up"** and the `db` row showing `(healthy)`:

```
NAME                       STATUS              PORTS
practicas-db-1             Up (healthy)        5432/tcp
practicas-backend-1        Up                  0.0.0.0:3001->3001/tcp
practicas-frontend-1       Up                  0.0.0.0:5173->80/tcp
```

Open the URL you set as `CORS_ORIGIN` (e.g. `http://localhost:5173` for local) and you should see the **Sign in** page.

---

## 6. Create the first admin user

The app does **not** auto-create an admin (a "first user becomes admin" rule would be an easy footgun in shared deployments). The bootstrap flow:

1. Open the frontend, click **Create one**, and register normally. You now have a `tutor` account.
2. From the server, promote that account to `admin`:

```bash
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id
      FROM users u, roles r
      WHERE u.email = 'YOUR_EMAIL_HERE' AND r.name = 'admin'
      ON CONFLICT DO NOTHING;"
```

3. Sign out and back in to refresh the session. An **Admin** link now appears in the top bar; it routes to `/admin` and gives you the full panel.

From that point on, this SQL snippet should never need to run again. Every subsequent admin promotion / demotion / password reset is done in the **Admin → Users** page in the browser.

> **Self-lockout protections** baked into the panel: you cannot deactivate yourself, you cannot remove the `admin` role from yourself, you cannot delete yourself, and the system refuses to remove the admin role from the last remaining admin. The only way to lock yourself out is to lose your password — and you can recover from that with the SQL password-reset snippet in § 10.

---

## 7. Expose the app to users (HTTPS)

Running the stack on `:5173` directly is fine for a single tester on the same network. For real use you almost certainly want:

- HTTPS on port 443
- A single hostname for both the frontend and the API (different paths)
- A reverse proxy in front of Docker

### Option A — Caddy (easiest, automatic Let's Encrypt)

Install Caddy on the host, then put this in `/etc/caddy/Caddyfile`:

```
practicas.school.edu {
    encode zstd gzip

    # API requests
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy localhost:3001
    }

    # Everything else → SPA
    handle {
        reverse_proxy localhost:5173
    }
}
```

Then:

```bash
sudo systemctl reload caddy
```

Update `.env`:
- `COOKIE_DOMAIN=practicas.school.edu`
- `COOKIE_SECURE=true`
- `CORS_ORIGIN=https://practicas.school.edu`
- `VITE_API_URL=https://practicas.school.edu/api`

Then **rebuild** so the frontend bakes in the right API URL:

```bash
docker compose up -d --build
```

### Option B — nginx

```nginx
server {
    listen 443 ssl http2;
    server_name practicas.school.edu;
    ssl_certificate     /etc/letsencrypt/live/practicas.school.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/practicas.school.edu/privkey.pem;

    location /api/ {
        proxy_pass http://localhost:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 60m;       # match MAX_UPLOAD_BYTES
    }

    location / {
        proxy_pass http://localhost:5173/;
        proxy_set_header Host $host;
    }
}
```

> **Important**: when behind a TLS-terminating proxy, set `COOKIE_SECURE=true` so cookies are only sent over HTTPS. Browsers silently drop `Secure` cookies on plain HTTP — symptom: "I log in and immediately get logged out".

---

## 8. Backups

Three things to back up:

1. **Database** (users, sheets, rows, permissions)
2. **Uploads volume** (any file you upload via `STORAGE_DRIVER=local`)
3. **`.env`** (secrets — put it in a password manager once set)

### Built-in scripts

The project ships with backup tooling. From the project root:

```bash
make backup            # snapshot db + uploads into ./backups/<timestamp>/
make list-backups      # show what's available
make restore           # interactive: restore the most recent backup
make restore FILE=backups/2026-05-14_103000   # restore a specific one
make reset             # take a backup, then wipe + rebuild — use INSTEAD of `down -v`
```

Each backup directory contains:

- `db.sql.gz` — `pg_dump` of the database, gzipped (`--clean --if-exists` so restore is idempotent)
- `uploads.tar.gz` — tarball of the uploads volume
- `manifest.json` — timestamp + sizes + which user/db it came from

`scripts/backup.sh` retains the **last 14 backups** by default (override with `BACKUP_RETAIN=N`). Backups are excluded from git via `.gitignore`.

### Automated nightly backups (cron)

The built-in `make backup` is what you schedule. Add to `crontab -e`:

```cron
0 3 * * *  cd /opt/practicas && /usr/bin/make backup >> /var/log/practicas-backup.log 2>&1
```

Or as a daily-cron drop-in:

```bash
sudo tee /etc/cron.daily/practicas-backup > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/practicas
exec make backup >> /var/log/practicas-backup.log 2>&1
EOF
sudo chmod +x /etc/cron.daily/practicas-backup
```

### Off-server copies

`./backups/` lives on the same disk as the data it's protecting — fine against accidental deletion, useless against disk failure. Sync the directory to a separate location at least weekly:

```bash
# rsync to a NAS
rsync -a --delete /opt/practicas/backups/ backup-host:/srv/practicas/

# or to S3-compatible storage
aws s3 sync /opt/practicas/backups/ s3://your-bucket/practicas/
```

### A backup you've never restored is a wish, not a backup

Once a quarter, exercise the restore on a throwaway machine:

```bash
git clone <repo> /tmp/practicas-test
cp .env /tmp/practicas-test/        # use a separate POSTGRES_PORT to avoid clash
cp -a backups /tmp/practicas-test/
cd /tmp/practicas-test
make restore
```

Confirm you can log in and your sheets are present.

---

## 9. Updating to a new version

```bash
cd /opt/practicas
# back up first
/etc/cron.daily/practicas-backup
# pull new code, then rebuild
git pull
docker compose up -d --build
```

If the schema changed, the backend applies any pending TypeORM migrations automatically on boot (`migrationsRun: true`). Tail `docker compose logs backend | grep -i migration` to confirm. See DEVELOPMENT.md › "Working with migrations" for the developer workflow.

---

## 10. Operational tasks

### Tail the logs

```bash
docker compose logs -f backend     # API logs
docker compose logs -f frontend    # nginx access/error logs
docker compose logs -f db          # Postgres logs
```

### Stop / restart

```bash
docker compose stop                # stop containers, keep volumes
docker compose start               # restart them
docker compose down                # stop and remove containers (volumes preserved)
docker compose down -v             # ⚠️ destroys the database volume too
```

### Open a Postgres shell

```bash
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB
```

### Reset a user's password from the server

There's no built-in CLI yet. Quickest workaround:

```bash
# In Node — generate an argon2id hash for the new password
docker compose exec backend node -e \
  "require('argon2').hash('NEW_PASSWORD_HERE',{type:2,memoryCost:19456,timeCost:2,parallelism:1}).then(console.log)"
# Then update Postgres:
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "UPDATE users SET password_hash = 'PASTE_HASH_HERE' WHERE email = 'user@example.com';"
```

### Force-logout a user

Revoking all of a user's refresh tokens will require them to sign in again:

```bash
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = (SELECT id FROM users WHERE email='user@example.com');"
```

---

## 11. Troubleshooting

> **First step for anything**: run `docker compose logs --tail=100 <service>` to see what the failing service is actually complaining about. Most problems below are recognised from the error text.

### "The web page can't be reached"

| Symptom                                              | Likely cause                                                                                                                                | Fix                                                                                                  |
|------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Browser shows "connection refused" on `:5173`         | The frontend container isn't running, or another service owns port 5173.                                                                     | `docker compose ps`, then `docker compose logs frontend`. Change `FRONTEND_PORT` in `.env`.          |
| Browser shows "this site can't provide a secure connection" | You set `COOKIE_SECURE=true` but the user is hitting plain HTTP.                                                                              | Set up HTTPS (section 7) **or** flip `COOKIE_SECURE=false` for a temporary http test.                |
| Frontend loads but `/api/auth/me` returns 502         | Backend isn't reachable from the reverse proxy. Wrong upstream port or backend container down.                                                | Verify `docker compose ps`. Confirm proxy points to `localhost:3001`.                                |
| Frontend loads but CORS errors in browser console     | `CORS_ORIGIN` doesn't match the URL in the browser bar.                                                                                       | Set `CORS_ORIGIN` to the exact public origin (scheme + host + port), then `docker compose up -d --build`. |

### "I log in but get immediately logged out"

Always one of these three:

1. **`COOKIE_SECURE=true` over plain HTTP** — browsers drop the cookie silently. Use HTTPS or set the flag to `false` for testing.
2. **`COOKIE_DOMAIN` mismatch** — if the value is `practicas.school.edu` but the user is visiting `localhost`, the cookie is never sent back. The domain in `.env` must match the host bar.
3. **`SameSite` blocked by a third-party origin** — if the frontend and backend are on different *registered domains* (not just paths), set `COOKIE_DOMAIN` to the common parent domain *and* the cookies need `SameSite=None; Secure`. Easier: serve both behind one hostname (section 7).

### "JWT_ACCESS_SECRET: minLength must be longer than or equal to 32 characters"

The backend won't even start with weak secrets. Re-run the `openssl rand` commands in section 4.

### "relation 'users' does not exist" / first request times out

Postgres started, but the TypeORM migration hasn't run yet (or the new entity wasn't covered by an existing migration). Wait ~10 seconds after `docker compose up`. If it persists:

```bash
docker compose logs backend | grep -i error
```

Common cause: **stale volume from a failed first boot before `citext` was installed**. Wipe the volume (this destroys all data — only do it on a fresh install):

```bash
docker compose down -v
docker compose up -d --build
```

### "extension 'citext' is not available" / "type 'citext' does not exist"

The DB volume was created before `db/init.sql` was mounted. Either:

```bash
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "CREATE EXTENSION IF NOT EXISTS citext;"
docker compose restart backend
```

…or wipe the volume as above.

### "Uploads fail at 413 / payload too large"

You're behind a reverse proxy that caps body size before the backend ever sees it. In nginx: `client_max_body_size 60m;`. In Caddy: this works by default, but check the encode/limit directives. Also ensure `MAX_UPLOAD_BYTES` in `.env` is large enough.

### "Out of disk space"

Run `docker system df` to see what's consuming space. Typical offenders:

- **Old image layers** from previous builds → `docker image prune -f`
- **Stopped containers** → `docker container prune -f`
- **Backup files** → check `/var/backups/practicas`
- **`uploads` volume** if you've enabled persistent file storage with `STORAGE_DRIVER=local` and very large workbooks have been uploaded → audit the volume:
  ```bash
  docker run --rm -v practicas_uploads:/data alpine du -sh /data
  ```

### "Permission denied" on Docker socket

```
permission denied while trying to connect to the Docker daemon socket
```

Your user isn't in the `docker` group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

…or prepend `sudo` to docker commands.

### "passwords too short" on the registration page

Backend requires 12+ characters. Adjust the `@MinLength(12)` in `backend/src/modules/auth/dto/auth.dto.ts` if the school policy is different.

### "I forgot the JWT secrets and now no one can log in"

Tokens issued under the old secret are invalid; users simply need to sign in again with their existing email + password. **Do not lose `POSTGRES_PASSWORD`** — without it you cannot decrypt the DB (well, Postgres doesn't encrypt at rest by default, but you can't authenticate). If you lose it:

```bash
# stop everything
docker compose down
# edit .env to set a new POSTGRES_PASSWORD
# reset the db user's password from inside the container
docker compose up -d db
docker compose exec db psql -U postgres -c "ALTER USER practicas WITH PASSWORD 'NEW_PASSWORD';"
docker compose up -d
```

### "I want to allow another file format"

The accepted formats are: **`.xlsx`, `.xls`, `.ods`, `.csv`, `.tsv`, `.tab`**. The whitelist lives in `HANDLERS` at the top of `backend/src/modules/spreadsheets/parser.service.ts`. Adding a format means adding an entry there plus a branch in the `switch` statement — see DEVELOPMENT.md › "Add a new file format".

**Macro-enabled Excel files (`.xlsm`, `.xlsb`, `.xltm`) are intentionally rejected** with an explicit error. Their macro payload can survive a round-trip through this tool and attack the user when they re-open the export in Excel. If a user insists on uploading one, ask them to **Save As → .xlsx** in Excel/LibreOffice first.

### "An `.ods` file from LibreOffice opens fine in LibreOffice but is rejected here"

The magic-byte check confirms the file is a real OpenDocument spreadsheet. Common false-positive causes:

- The file was hand-edited or renamed from another extension (`mv foo.zip foo.ods`). Re-export from LibreOffice.
- A corporate sync tool (OneDrive, Box) replaced the file with a placeholder shortcut. Open the file once locally before uploading.
- The user uploaded an `.odt` (text document) instead of `.ods`. The error message will say so.

### "Container keeps restarting"

```bash
docker compose ps
docker compose logs --tail=200 backend
```

Most common: `validateEnv` is rejecting a malformed `.env`. The error log spells out which variable is wrong.

### "Random TLS errors when calling external services"

If your school proxies outbound traffic through a TLS-intercepting firewall (Zscaler, Sophos, etc.), Docker won't trust its CA by default. Mount the CA into the build:

```dockerfile
# Add to backend/Dockerfile after FROM node:20-alpine
COPY corporate-ca.crt /usr/local/share/ca-certificates/
RUN apk add --no-cache ca-certificates && update-ca-certificates
```

### Still stuck?

Collect:

```bash
docker compose version
docker compose ps
docker compose logs --tail=200
cat .env | grep -v 'SECRET\|PASSWORD'   # never share secrets
```

…and send it to whoever maintains the deployment.
