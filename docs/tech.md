## Overview

[Server Installation Manual](docs/server.md)

This repository contains a Next.js application for AI-assisted short video project generation and management. Planning documents live in `plan/`. Start at `plan/INDEX.md`.

## Fast CMDs

```shell
npm run prisma:migrate:deploy && npm run prisma:generate
```

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

### Email Automation (YumCut contacts with Postal or Resend delivery)

YumCut supports:
- onboarding emails for new users (welcome immediately + follow-up after 24 hours),
- periodic planned-email processing via cron/script,
- inbound email webhook forwarding to Telegram admins.

Required env variables:
- `EMAIL_SEND_PROVIDER` - `postal` or `resend`. Immediate and scheduled mail read the same value.
- `EMAIL_AUDIENCE` - local contact audience key (default `yumcut`). It isolates consent when another product later uses the same database.
- `EMAIL_PREFERENCES_URL` - branded origin that routes `/manage/:token` and `/unsubscribe/:token` to this YumCut app.
- `POSTAL_API_URL` - HTTPS origin of the Postal API or the complete `/api/v1/send/message` endpoint.
- `POSTAL_API_KEY` - server-scoped Postal API credential. Keep it in the deployment secret store and never expose it to the browser.
- `POSTAL_FROM_EMAIL` - sender on a domain that is already verified in the same Postal mail server.
- `POSTAL_WEBHOOK_PUBLIC_KEY` - Postal webhook RSA public key as PEM or base64-encoded PEM. It verifies `X-Postal-Signature-256` before a bounce can change contact state.
- `RESEND_API_KEY` - Resend API key. Use a **Full access** key to provision the marketing Automation and to retrieve inbound message bodies.
- `RESEND_FROM_EMAIL` - verified Resend sender.
- `RESEND_MARKETING_REPLY_TO_EMAIL` - fixed Automation reply address; it must be handled by the inbound webhook for reply bonuses.
- `RESEND_MARKETING_EVENT_NAME` - event used by the app and Automation (default `yumcut.marketing.email.v1`).
- `RESEND_WEBHOOK_SECRET` - retained for verification of inbound Resend webhooks.
- `SERVICE_API_PASSWORD` - required for protected cron endpoint auth (`x-service-password` header).

YumCut stores contacts, consent, preference tokens, suppression state, and verified delivery-event IDs in its own database. Registration creates a consented contact. An unknown recipient is never silently opted into marketing, and account deletion removes the local contact.

Provider behavior:
- `postal`: the app checks local consent before each marketing send, then calls Postal. Marketing messages contain a visible footer plus RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post` headers. Transactional messages ignore marketing opt-out and have no marketing footer, but hard-suppressed addresses are not sent to.
- `resend`: those marketing messages trigger a Resend Automation whose template contains `{{{RESEND_UNSUBSCRIBE_URL}}}`. Resend owns the resulting `unsubscribe.resend.com` URL and suppression state. Run `npm run emails:resend:provision` once after configuring the Resend variables, and again after changing the sender or reply-to address.
- project lifecycle and reply-bonus confirmation messages are transactional with every provider, and therefore do not contain a marketing unsubscribe footer.

Before selecting `postal` in production:
1. Verify the sender domain in Postal and confirm SPF, DKIM, DMARC, return-path, PTR/rDNS, forward DNS, and outbound TLS. The visible `From` domain must align with SPF or DKIM for DMARC.
2. Create a least-privilege server API credential and set the four `POSTAL_*` variables above. The API URL must be HTTPS and should expose only Postal's `/api/` path.
3. Apply Prisma migrations and route the `EMAIL_PREFERENCES_URL` hostname to this app. A preference `GET` only displays state; changes require `POST`, including RFC 8058 one-click requests.
4. Create a signed Postal webhook at `POST https://app.yumcut.com/api/postal/webhook`. Verified bounce and delivery-failure events hard-suppress the local contact. Webhook UUIDs are stored for idempotency.
5. Send one transactional and one consented marketing test to a mailbox where full headers can be inspected. Confirm SPF, DKIM, and DMARC pass; confirm both list-unsubscribe headers are covered by the DKIM `h=` list; then test the visible link and the mailbox provider's one-click action.

The app adds a custom idempotency header for diagnosis, but Postal's stable API does not guarantee idempotent sends. The planned-email database lock prevents ordinary duplicate workers; an ambiguous network failure after Postal accepted a message can still result in a retry. Keep the send rate low during initial IP warm-up and monitor Postal's queue, bounces, delivery failures, and Gmail Postmaster spam rate.

For the one-time Plunk migration, temporarily set `PLUNK_API_URL` and `PLUNK_SECRET_KEY`, run `npm run emails:migrate:plunk-to-local` as a dry run, then run `npm run emails:migrate:plunk-to-local -- --apply`. Existing Plunk UUID links are preserved and a local opt-out is never changed to subscribed. Remove both temporary variables after verification. `npm run emails:migrate:resend-to-local` similarly imports Resend delivery history; history is not treated as marketing consent. Neither migration sends messages.

Safe cutover order:
1. Back up the YumCut database, deploy the new release, and run `npm run prisma:migrate:deploy`.
2. Run the Plunk migration first in dry-run mode and then with `--apply`. Compare its source and valid contact counts before continuing.
3. Add the branded mail hostname as an additional HTTPS domain for the YumCut app in the hosting platform. Update its Cloudflare DNS record from the old preference service to the app only after the import succeeds. Cloudflare may proxy these web-only routes.
4. Verify an imported `/manage/:token` URL and test `POST /unsubscribe/:token`; a plain `GET` must not unsubscribe.
5. Set `EMAIL_SEND_PROVIDER=postal`, process one controlled marketing message, and inspect delivery plus DKIM-signed list-unsubscribe headers.
6. Remove the temporary `PLUNK_*` variables. Keep the old service stopped but recoverable until old links, scheduled jobs, and contact counts have been verified.

Cron processing endpoint (requires `x-service-password` header with `SERVICE_API_PASSWORD`):
- `GET https://app.yumcut.com/api/cron/planned-emails`

Example crontab (run every 30 minutes on production host):

```cron
*/30 * * * * curl -fsS -H "x-service-password: $SERVICE_API_PASSWORD" https://app.yumcut.com/api/cron/planned-emails >/dev/null 2>&1
```

Local/script alternative:

```bash
npm run emails:planned:send
```

Inbound receiving webhook endpoint:
- `POST https://app.yumcut.com/api/resend/inbound`

Resend dashboard setup (Custom Domains -> Receiving):
1. Add and verify your receiving domain DNS records in Resend.
2. Create a webhook for `email.received`.
3. Point it to `https://app.yumcut.com/api/resend/inbound`.
4. Put the webhook signing secret into `RESEND_WEBHOOK_SECRET`.

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
