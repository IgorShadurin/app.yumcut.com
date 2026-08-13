# Email Writing Instructions

These rules are mandatory for all email templates in `email/en` and `email/ru`.

## Voice and Sender

- Split voice by email type:
- Onboarding/re-engagement emails (for example `welcome_v1`, `follow_up_24h_v1`, `reply_bonus_confirmed_v1`, `subscription_cancelled_winback_v1`) should be written as a personal note from `Igor`.
- Service lifecycle emails (`project_created_v1`, `project_ready_v1`) must be neutral system notifications.
- For service lifecycle emails, do not add personal signatures (for example `- Igor`) or device footers (for example `Sent from my iPhone`).
- Do not write from `team`, `support team`, or any generic company voice unless explicitly requested.

## Style Consistency

- Study the current email templates first.
- Follow the existing style and structure already used in this repo.
- Do not invent a new tone, new format, or new writing style unless explicitly requested.

## Quality Bar

- Be clear and concise.
- Prefer short sentences and simple words.
- Keep each email focused on one action.
- Avoid marketing fluff, robotic text, and generic AI-style phrasing.

## Practical Rules

- Keep placeholder usage consistent (`{{name}}`, `{{bonus_tokens}}`, etc.).
- Keep English and Russian versions aligned in intent.
- Keep wording natural for each language, not literal machine translation.

## Technical Delivery Guardrails

- Do not change `Reply-To` addressing format without updating tests in `tests/server/planned-emails.test.ts`.
- `Reply-To` must always be a valid email address in `email@example.com` format.
- Keep the local part (before `@`) at 64 characters or less (RFC limit).
- If aliasing is used in `Reply-To`, prefer short prefixes to avoid breaching local-part length.
- Treat any provider error containing `Invalid \`reply_to\` field` as a release-blocking regression.

## Postal Marketing Campaign CLI

YumCut already has a reusable, non-hardcoded command-line marketing sender. Reuse it instead of
searching other repositories for a mail script or building another one:

- npm command: `npm run emails:campaign -- ...`
- CLI entry point: `scripts/send-marketing-campaign.ts`
- delivery and safety logic: `src/server/emails/marketing-campaign.ts`
- provider: Postal directly; marketing campaigns do not use Resend or `EMAIL_SEND_PROVIDER`
- default pacing: 2,000 milliseconds between recipients

Campaign bodies belong in UTF-8 text files, normally under `email/campaigns/<language>/`. Content
must not be hardcoded into the CLI implementation. Use a new stable `--campaign-id` for each real
campaign and a separate ID for test sends.

Preview a campaign before every send:

```bash
npm run emails:campaign -- \
  --all \
  --language "en" \
  --campaign-id "2026-08-example" \
  --subject "Example subject" \
  --text-file "/absolute/path/to/email.txt" \
  --dry-run
```

Only after reviewing the eligible and selected counts, replace `--dry-run` with
`--confirm-send`. The command refuses to send without this explicit flag.

For a test or limited campaign, repeat `--to` or provide comma-separated addresses:

```bash
npm run emails:campaign -- \
  --to "igor.shadurin@gmail.com" \
  --campaign-id "2026-08-example-test" \
  --subject "Example subject" \
  --text-file "/absolute/path/to/email.txt" \
  --dry-run
```

Operational rules:

- `--all` means all locally subscribed, non-suppressed contacts in the configured YumCut audience,
  never every raw user email.
- Use `--language en` or `--language ru` with `--all` when campaign content is localized. The
  filter matches `EmailContact.preferredLanguage`; unknown languages are not silently included.
- Explicit `--to` recipients must normally be subscribed and non-suppressed. Non-suppressed
  YumCut admin accounts are allowed for campaign testing without changing their consent state.
- Postal renders the plain and HTML bodies and adds the branded preference link, RFC 8058
  one-click unsubscribe headers, and suppression checks.
- Recipient-level duplicate protection is keyed by `--campaign-id`. Rerunning the same campaign
  skips already processed contacts and continues unfinished contacts.
- Use `--retry-failed` only when intentionally retrying contacts recorded as failed.
- Inline `--text` is available for short tests; prefer `--text-file` for real campaigns.
- The delay may be changed with `--delay-ms`, but keep the 2-second default unless there is a clear
  deliverability reason to use a slower rate.
- Full operational documentation and examples are in `docs/tech.md` under
  "Command-line Postal marketing campaigns."
