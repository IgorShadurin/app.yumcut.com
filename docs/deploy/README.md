# Zero-downtime PM2 deploy

Requires Node.js **24.22.1 or newer in the 24.x LTS line**. See the
[Node security remediation runbook](node-security.md) for upgrading the host,
PM2 and workers, verifying running processes, and rotating Stripe keys.
The deploy script rejects unsupported Node versions before deployment.

This deploy keeps the current app running while a new release is cloned, installed, built, and migrated. Only after that it switches `/var/www/app.yumcut.com/current`, reloads PM2, checks the local app, and rolls back automatically if the healthcheck fails.

Default production path:

```bash
/var/www/app.yumcut.com
```

## Server layout

The script creates this layout:

```text
/var/www/app.yumcut.com/
  current -> /var/www/app.yumcut.com/releases/20260513120000
  releases/
  shared/
    .env
```

Put the production `.env` here:

```bash
/var/www/app.yumcut.com/shared/.env
```

If `/var/www/app.yumcut.com/.env` already exists, the first deploy copies it to `shared/.env`.

## First run

Run as the `deploy` user, not as `root`.

```bash
cd /var/www/app.yumcut.com
chmod +x docs/deploy/deploy-app-yumcut.sh
docs/deploy/deploy-app-yumcut.sh
pm2 logs -f app.yumcut.com
```

After the first run, check that PM2 shows at least two clustered instances:

```bash
pm2 list
```

The defaults are:

```bash
APP_NAME=app.yumcut.com
DEPLOY_ROOT=/var/www/app.yumcut.com
REPO_URL=git@github.com:IgorShadurin/app.yumcut.com.git
BRANCH=main
PORT=3111
PM2_INSTANCES=2
HEALTH_URL=http://127.0.0.1:3111/
```

Nginx should proxy `app.yumcut.com` to `127.0.0.1:3111`.

## Normal deploy

```bash
/var/www/app.yumcut.com/current/docs/deploy/deploy-app-yumcut.sh
```

Common overrides:

```bash
BRANCH=main docs/deploy/deploy-app-yumcut.sh
PM2_INSTANCES=4 docs/deploy/deploy-app-yumcut.sh
RUN_MIGRATIONS=0 docs/deploy/deploy-app-yumcut.sh
HEALTH_URL=http://127.0.0.1:3111/api/health docs/deploy/deploy-app-yumcut.sh
```

## Rollback behavior

Rollback is automatic if the new release does not return `2xx` or `3xx` from `HEALTH_URL`.

Manual rollback:

```bash
ls -1 /var/www/app.yumcut.com/releases
ln -sfn /var/www/app.yumcut.com/releases/<release-id> /var/www/app.yumcut.com/current
pm2 startOrReload /var/www/app.yumcut.com/current/.deploy/ecosystem.config.cjs --only app.yumcut.com --update-env
pm2 save
```

## Notes

PM2 reload without downtime requires cluster mode with at least two instances. The generated PM2 config uses `exec_mode: cluster` and `PM2_INSTANCES=2` by default.

If the app was originally started with `pm2 start "npm run start -- -p 3111" --name app.yumcut.com`, the first run moves it to the generated PM2 config. Future deploys use PM2 reload against that config.

Prisma migrations run by default before the symlink switch. Keep production migrations backward compatible because database migrations cannot be undone by a symlink rollback.

## Postal SMTP certificate renewal (Coolify host)

The separate Postal host serves `smtp.copymyui.com` at `204.168.170.212`.
Certbot renews its certificate using a standalone HTTP-01 listener on
`10.0.1.1:8081`. Traefik forwards only the SMTP hostname's
`/.well-known/acme-challenge/` requests to that listener through
`/data/coolify/proxy/dynamic/03-smtp-certificate.yml`.

The proxy must retain this static command:

```yaml
- '--entrypoints.http.allowacmebypass=true'
```

Without it, Traefik's internal ACME router takes precedence over the Certbot
router and returns 404 for Certbot's tokens. Increasing the custom router's
priority alone does not fix that conflict. Traefik's own certificate resolver
remains enabled for its other hostnames.

Preserve this command in **both** `/data/coolify/proxy/docker-compose.yml` and
Coolify's saved proxy configuration (`Server.proxy.last_saved_proxy_configuration`).
Coolify uses its saved configuration when rebuilding the proxy. Back up both
before editing, preserve unrelated settings, and recreate the proxy to apply
static command changes. A proxy recreation briefly interrupts ingress.
See [Traefik's ACME routing documentation](https://doc.traefik.io/traefik/v3.6/reference/install-configuration/entrypoints/#allowacmebypass).

Run these checks as root on the Postal host after proxy configuration changes:

```bash
docker inspect coolify-proxy --format '{{json .Config.Cmd}}'
certbot renew --cert-name smtp.copymyui.com --dry-run --no-random-sleep-on-renew
systemctl is-active certbot.timer postal-smtp-cert-sync.timer
```

The dry run uses Let's Encrypt staging and must succeed before a production
renewal. It does not install a staging certificate. To renew when due:

```bash
certbot renew --cert-name smtp.copymyui.com --no-random-sleep-on-renew
openssl x509 -in /opt/postal/config/smtp.cert -noout -subject -dates
```

The deploy hook `/etc/letsencrypt/renewal-hooks/deploy/postal-smtp-cert-sync`
invokes `/usr/local/sbin/postal-smtp-cert-sync`. It validates the hostname,
expiry and key match, installs the certificate and key with mode `0600` and
owner `999:999`, and restarts only `postal-smtp` when files change.
`postal-smtp-cert-sync.timer` also runs twice daily.

Verify the certificate actually presented on SMTP port 25 with STARTTLS,
including hostname and trust validation; checking the file alone is insufficient.
Check the proxy health and HTTPS responses from `wtf.copymyui.com`,
`postal.copymyui.com`, and `app.yumcut.com` after a proxy recreation.
Do not print private keys, ACME account files, or full proxy configuration
containing credentials when collecting diagnostics.

On 2026-10-20, the missing ACME bypass command was restored in the running
proxy and both persisted configurations. Staging and production renewal
succeeded, and a hostname-validated SMTP STARTTLS connection presented the
renewed certificate, valid until 2027-01-18 17:33:20 UTC. Coolify's custom-command
extraction also retained the option for future proxy regeneration.
