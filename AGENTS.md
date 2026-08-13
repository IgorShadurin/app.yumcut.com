# Agent Instructions

## Email Rules

Email-writing instructions live in [email/AGENTS.md](email/AGENTS.md).

- YumCut already has a reusable command-line Postal marketing campaign sender. Before searching
  for or developing another marketing-mail script, use `npm run emails:campaign -- --help` and
  follow the campaign instructions in `email/AGENTS.md`.
- The campaign CLI implementation is `scripts/send-marketing-campaign.ts`; reusable campaign
  delivery logic is in `src/server/emails/marketing-campaign.ts`.

## Commit Rules

- After completing the requested feature, commit all changes.
- Use Conventional Commits format, for example: `fix(scope): short message`, `feat: short message`, `chore: short message`.

## Deploy and Dependency Fix Rules

- Treat production deploy failures, `npm ci` failures, lockfile sync errors, and audit/dependency failures as repository bugs until proven otherwise. Fix the repo state, commit it, and push it; do not present `npm install` on the server as the final fix.
- When `npm ci` reports missing packages from `package-lock.json`, inspect the exact dependency path and add/update the lockfile entries that satisfy that path. Do not rely only on a macOS/local `npm ci --dry-run` if the failure happens on Linux.
- For dependency or lockfile fixes, verify with the closest production command available. For Linux deploy issues, run `npm ci --dry-run --os=linux --cpu=x64` in addition to the normal local check when relevant.
- If `npm audit fix` or any dependency command rewrites the lockfile, rerun the deploy-oriented `npm ci` checks afterward; dependency rewrites can undo a previous lockfile fix.
- When a lockfile/deploy issue is subtle or platform-specific, add a focused regression test or script check that validates the invariant, so the same broken lockfile shape cannot be committed again.

## User API Feature Rules

- When adding or changing user-facing project, account, automation, billing-adjacent, file, media, or settings behavior, check whether it should be available through the user automation API as well as the frontend.
- If the action is safe for user automation, implement or update the matching `/api/user/v1` method using the same core service code as the frontend flow. Avoid duplicate business logic, credit handling, project creation, status polling, download URL generation, and settings mutation paths.
- Classify each user API method as read or write access and enforce API key scope, authenticated user ownership, credit balance rules, idempotency for costly write operations, and the existing project security boundaries.
- Never expose admin-only behavior, arbitrary/custom internal query execution, cross-user data, billing bypasses, free project creation, or privileged daemon controls through the user API.
- Keep the API documentation current for every supported method. Update the OpenAPI schema, interactive docs page, request/response examples, scope requirements, and any user-facing explanation needed to automate video creation after API key creation.
- Add or update tests for every new or changed API method, including successful access, read/write scope denial, unauthenticated access, cross-user data leakage prevention, credit/idempotency behavior where relevant, and documentation/schema coverage.

## UI Cursor Rules

- For clickable or interactive UI elements, explicitly apply a clickable cursor style (for example `cursor-pointer`) by default.
- Only skip the clickable cursor when there is a clear reason or explicit instruction not to use it (for example disabled states or intentionally non-interactive elements).

## Debug Auth Notes

- Local debug instructions for signing into web admin in Chrome MCP without OAuth are documented in [docs/debug-web-admin-login.md](docs/debug-web-admin-login.md).

## Image Prank Catalog Notes

- Instructions for generating and importing Image Prank catalog characters are documented in [docs/image-prank-character-generation.md](docs/image-prank-character-generation.md).
