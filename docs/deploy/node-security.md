# October 2026 Node.js security update

The [official advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
includes CVE-2026-111497: malicious Brotli input can corrupt memory when decoded
by Node.js. Affected runtime use is not proof of compromise.

YumCut uses Node 24 LTS, with a minimum of **24.22.1**. `.nvmrc` pins the
verified baseline for development and CI. Package lifecycle and deploy checks
reject older runtimes. Keep `.nvmrc`, package engines, the lockfile, the runtime
check and its tests aligned when raising this baseline. Updating npm dependencies
does not patch the Node executable. Direct invocations of Next.js or tsx bypass
npm lifecycle checks; the host runtime must still be upgraded.

## Production remediation

1. Inventory every host using this account's Stripe keys, including app servers,
   workers and scheduled jobs. Preserve relevant access/authentication, proxy,
   application and Stripe logs before making changes. Review unexpected logins,
   new users/SSH keys, services, cron jobs, processes and outbound connections.
   If compromise is suspected, isolate and rebuild from trusted images rather
   than assuming an in-place runtime update cleans the host.
2. As the app's service user (normally `deploy`), load nvm and install the patched
   runtime:

   ```bash
   export NVM_DIR="$HOME/.nvm"
   . "$NVM_DIR/nvm.sh"
   nvm install 24.22.1
   nvm use 24.22.1
   nvm alias default 24.22.1
   node --version
   ```

3. PM2 itself and every worker must run under the new executable. Record the
   installed PM2 version with `pm2 --version` before switching Node; install that
   same version under the new Node with `npm install -g pm2@<recorded-version>`.
   Save the process list and use `pm2 update` under the patched runtime to restart
   the PM2 daemon and its managed processes. Plan a maintenance window: this can
   interrupt requests and worker jobs. Check for explicitly configured old
   interpreters, npm paths and scheduled jobs and update them before restarting.
   Regenerate the PM2 systemd startup unit using `pm2 startup systemd -u deploy
   --hp /home/deploy`, run the exact privileged command it prints, then `pm2 save`.
   Merely running `nvm use` or reloading an old PM2 daemon is insufficient.
4. Verify the actual running executables with `/proc/<pid>/exe` for **every**
   Node/PM2 process, not just `node --version` in the shell. Verify the startup
   unit no longer references the old Node installation. Check app and worker
   health, then use the normal deploy procedure. Retired runtime binaries must
   not be used by rollback configurations or boot services.
5. For Stripe account `acct_1T7bJKRQgiCJNWSi`, review
   [request logs](https://docs.stripe.com/development/dashboard/request-logs),
   payouts, charges and account setting changes for unexplained activity.
   After the environment is secured, [rotate exposed secret/restricted API keys](https://docs.stripe.com/keys#rolling-keys).
   Deploy the replacement through the server's secret configuration to every
   consumer, restart processes, verify API access and checkout, then expire the
   old key promptly. If malicious use is detected, revoke immediately and contact
   Stripe. Never paste keys into chat, Git, command arguments or logs.
   Webhook signing secrets are separate; assess and rotate these and other
   accessible credentials too if the host was compromised.

## Verification status on 2026-10-24

The developer workspace was upgraded from Node 24.11.1 to 24.22.1 using nvm,
with archive checksum verification and the nvm default set to 24.22.1. Existing
terminal sessions and processes need to switch/restart to use it. Production SSH at the
host configured in `.ssh.env` rejected available root and deploy authentication.
Production runtime version, compromise assessment, Stripe activity review and
key rotation therefore remain unverified. Repository safeguards alone do not
resolve the production incident.
