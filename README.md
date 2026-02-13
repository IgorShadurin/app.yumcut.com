## Overview

[Server Installation Manual](docs/server.md)

## Fast CMDs

```shell
npm run prisma:migrate:deploy && npm run prisma:generate
```

This repository contains a Next.js application for AI-assisted video project management. Planning documents live in `plan/`. Start at `plan/INDEX.md`.

## Database Setup (MySQL + Prisma)

1) Install MySQL 8+.
2) Create the application database (emoji-safe):

   ```sh
   mysql -uroot -p -e "CREATE DATABASE IF NOT EXISTS \`yumcut\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
   ```

3) Create a dedicated user with full access to that database:

   ```sh
   mysql -uroot -p -e "CREATE USER 'yumcut'@'%' IDENTIFIED BY 'STRONG_PASSWORD'; GRANT ALL PRIVILEGES ON \`yumcut\`.* TO 'yumcut'@'%'; FLUSH PRIVILEGES;"
   ```
4) Copy `example.env` to `.env` and update the secrets (at minimum `DATABASE_URL`, `NEXTAUTH_SECRET`, the shared API passwords, and `MEDIA_ROOT`).
5) Initialize Prisma (first time only): `npx prisma init`
6) Apply schema migrations:
   - Dev (create + apply): `npx prisma migrate dev --name init`
   - Deploy/apply pending only: `npx prisma migrate deploy`
7) (Optional) Open Prisma Studio: `npx prisma studio`

See the detailed schema in `plan/db/schema.md` and migration workflow in `plan/db/migrations.md`.

### Reset DB from scratch (dev)

To wipe all local data and re-initialize the database from the current migrations in one step (drops all tables, re-applies the initial migration, and regenerates Prisma Client):

- `npx prisma migrate reset --force`
- `npx prisma migrate reset --force && npx prisma generate`

Requirements:
- Ensure `DATABASE_URL` is set (root `.env` or `prisma/.env`).
- Your MySQL server must be running and reachable at the configured host/port.

### Prisma .env (DATABASE_URL)

Prisma reads `DATABASE_URL` from `prisma/.env` (or root `.env`). Create it before running migrations. Both examples are provided: `example.env` (root) and `prisma/.env.example`.

- Local (root without password):
  - `printf "DATABASE_URL=\"mysql://root@localhost:3306/yumcut\"\n" > prisma/.env`

- Server (dedicated user):
  - `printf "DATABASE_URL=\"mysql://yumcut:REPLACE_ME_STRONG_PASSWORD@127.0.0.1:3306/yumcut\"\n" > prisma/.env`

Alternatively export it inline for a single command:

- `DATABASE_URL="mysql://root@localhost:3306/yumcut" npx prisma migrate dev --name init`

### Migrations: Apply Only New Ones (Dev) and Regenerate Prisma

When you already have migration files committed and just want to apply the new ones locally (without creating additional migrations) and then regenerate the Prisma Client:

- Apply only pending migrations (works in dev too):
  - `npm run prisma:migrate:deploy`

- Regenerate Prisma Client (update types after schema/migrations):
  - `npm run prisma:generate`

- One-liner (apply pending + regenerate):
  - `npm run prisma:migrate:deploy && npm run prisma:generate`

Notes:
- Ensure `DATABASE_URL` is set in your environment or `prisma/.env` before running these commands.
- If you actually changed `prisma/schema.prisma` and need to create a brand new migration in dev, use:
  - `npm run prisma:migrate:dev -- --name <short-change-name>`
  This creates a migration, applies it to your local DB, and updates the Prisma Client.

### Create Database (emoji-safe)

All text should support emojis. Use utf8mb4 character set and utf8mb4_0900_ai_ci collation (MySQL 8+).

- Local (root without password):
  - `mysql -u root -e "CREATE DATABASE IF NOT EXISTS yumcut CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"`

- Server (create DB + user with password):
  - `mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS yumcut CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE USER IF NOT EXISTS 'yumcut'@'%' IDENTIFIED BY 'REPLACE_ME_STRONG_PASSWORD'; GRANT ALL PRIVILEGES ON yumcut.* TO 'yumcut'@'%'; FLUSH PRIVILEGES;"`

- Convert existing DB to emoji-safe collation (if needed):
  - `mysql -u root -p -e "ALTER DATABASE yumcut CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"`

Prisma relies on the database defaults for charset/collation; creating the DB with utf8mb4 ensures all string/text columns support emojis.

## Administrator Accounts

The app distinguishes administrators with the `User.isAdmin` flag. Administrators can access the `/admin` dashboard and see elevated tooling. To promote an existing user:

1. Ensure the user has signed in at least once so a `User` row exists.
2. Run the helper script with either the user’s ID or email. Pass `false` to demote (defaults to `true`):
   ```sh
   npm run admin:set -- person@example.com         # promote by email
   npm run admin:set -- 123e4567-e89b-12d3-a456-426614174000  # promote by id
   npm run admin:set -- person@example.com false   # demote back to standard user
   ```
3. The user should sign out and sign back in so the session picks up the new role.

## Environment Variables

Environment variables for the Next.js backend live in `.env`. Start from the committed template:

```
cp example.env .env
```

Then edit the copy to match your environment (set `DATABASE_URL`, `NEXTAUTH_SECRET`, `SERVICE_API_PASSWORD`, `DAEMON_API_PASSWORD`, etc.). For more context see `plan/env-and-secrets.md`.

Key flags:
- Main app always runs in UI mode; the storage worker is now a separate service. Configure `NEXT_PUBLIC_STORAGE_BASE_URL` / `STORAGE_PUBLIC_URL` to point at the storage host.
- `STORAGE_ALLOWED_ORIGINS` controls which browser origins can POST to the storage uploader (comma-separated list).

### Mobile authentication (Google & Apple)

The iOS app now talks to the same backend via dedicated mobile-auth routes. Configure these extra secrets in `.env` (or your deployment environment) before enabling the feature:

- `GOOGLE_IOS_CLIENT_ID` – the OAuth client id generated for the iOS bundle (can differ from the web client id).
- `APPLE_WEB_CLIENT_ID` – the Sign in with Apple Service ID used by NextAuth on the web.
- `APPLE_IOS_CLIENT_ID` – the bundle identifier used when verifying iOS identity tokens (e.g. `org.video.ai.YumCut`).
- `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` – your Apple developer team id, the key id, and the associated `.p8` private key contents (used to mint the Apple client secret at runtime).
- `MOBILE_JWT_SECRET` – long random string used to sign mobile access tokens (fallbacks to `NEXTAUTH_SECRET`, but keeping a dedicated secret is recommended).
- `MOBILE_ACCESS_TOKEN_TTL_MINUTES` (default 30) and `MOBILE_REFRESH_TOKEN_TTL_DAYS` (default 180) control token lifetimes.

Apple and Google accounts that share the same email automatically link to the same `User` row, so there is no conflict when someone switches providers later.

Available endpoints (all wrap `withApiError` and return `{ error: { code, message } }` on failure):

| Route | Method | Body | Purpose |
| --- | --- | --- | --- |
| `/api/mobile/auth/google` | `POST` | `{ idToken, deviceId, deviceName?, platform?, appVersion? }` | Verifies the Google ID token, links/creates the user + account, and issues `{ user, tokens }` (access/refresh). |
| `/api/mobile/auth/apple` | `POST` | `{ identityToken, fullName?, deviceId, deviceName?, platform?, appVersion? }` | Verifies the Sign in with Apple identity token, links/creates the user + account, and issues `{ user, tokens }` (access/refresh). |
| `/api/mobile/auth/refresh` | `POST` | `{ refreshToken, deviceId?, deviceName?, platform?, appVersion? }` | Rotates the refresh token and returns a new `{ user, tokens }` block. |
| `/api/mobile/auth/logout` | `POST` | `{ refreshToken }` | Revokes the stored session (no error if it already expired). |

Access tokens are short-lived JWTs (HS256, issuer `yumcut-mobile`) meant for upcoming mobile API routes; refresh tokens are random 64-byte values stored hashed in `MobileSession`.

### Telegram notifications

The app can send Telegram alerts when a project needs manual approval, encounters an error, or finishes processing. To enable it:

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) and note the bot token and username.
2. Configure the environment variables:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_BOT_USERNAME`
   - `TELEGRAM_WEBHOOK_SECRET` (any random string, used to verify Telegram webhook calls)
3. Point the bot webhook to `https://<your-domain>/api/telegram/webhook` and include the same secret via Telegram's `secret_token` parameter.

Once configured, each user can open **Account → Telegram notifications** to generate a one-time connection code and link their Telegram chat. They can disconnect from the same panel or by sending `/stop` to the bot. The backend stores only the chat identifier and basic profile metadata; connection codes expire after 10 minutes.

## Planning Documents

See `plan/INDEX.md` for the full, cross-linked project plan and checklists.
## CLI: Update Project Status (dev)

Use the typed TS script to update a project's status and attach optional JSON data. The script validates the status using the shared enum and writes a log entry.

- Command (via `npx`):
  - `npx tsx scripts/update-project-status.ts <projectId> <status> [data-json]`

- Example:
  - Set status to generate audio (with arbitrary extra):
    - `npx tsx scripts/update-project-status.ts 123e4567-e89b-12d3-a456-426614174000 process_audio '{"progress":0.42,"note":"halfway"}'`

  - Script approval example (injects script text for validation):
    - `npx tsx scripts/update-project-status.ts 51e05d41-5855-4dde-90c4-d01df4330e62 process_script_validate '{"scriptText":"Hi! This is a short script that must be approved before voiceover."}'`

  - Voiceover approval example (injects audio candidates for selection):
    - `npx tsx scripts/update-project-status.ts 51e05d41-5855-4dde-90c4-d01df4330e62 process_audio_validate '{"audios":["https://upload.wikimedia.org/wikipedia/commons/b/bf/Wikimedia_Sound_Logo_Finalist_VQ97.wav","https://upload.wikimedia.org/wikipedia/commons/0/03/Bardo.wav"]}'`

- What it does:
  - Loads `.env` to pick up `DATABASE_URL`.
  - Validates `<status>` against `src/shared/constants/status.ts` (no duplication).
  - Updates `Project.status` and appends a row to `ProjectStatusHistory` with `extra` = your JSON.
  - For `process_script_validate` with `{ scriptText }` it upserts a `Script` row so the UI can render the “approve script” view.
  - For `process_audio_validate` with `{ audios: string[] }` it resets and inserts `AudioCandidate` rows so the UI can render the “approve voiceover” choices.

- Also available as an npm script (requires `tsx`):
  - `npm run project:status -- <projectId> <status> '{"key":"value"}'`

## CLI: Adjust User Tokens

Grant or deduct tokens for a specific user directly from the command line. Positive amounts add tokens, negative amounts deduct them. All adjustments are logged via the token ledger.

- Command (via `npx`):
  - `npx tsx scripts/manage-tokens.ts <userId> <amount> [comment...]`

- npm script alias:
  - `npm run tokens:adjust -- <userId> <amount> [comment...]`

- Examples:
  - Give a 250-token bonus with the default comment:
    - `npm run tokens:adjust -- 123e4567-e89b-12d3-a456-426614174000 250`
  - Deduct 45 tokens with a custom note:
    - `npm run tokens:adjust -- 123e4567-e89b-12d3-a456-426614174000 -45 "Manual content review adjustment"`

What happens:
- Loads `.env` to connect to the database.
- Verifies the user exists before adjusting.
- Records the adjustment using the shared token ledger (transaction type `ADMIN_ADJUSTMENT`) with your optional comment (defaults to “Adjusted by administrator”).
- Prints the new balance once complete.
