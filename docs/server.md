Here is a more “secure-by-default” version of the setup, keeping in mind possible RCE bugs in Next.js and Node apps. The main idea: **only Apache faces the internet, Node apps run as unprivileged user behind it, DB is local, firewall is tight.**

Assumptions:

* Ubuntu 22.04 / 24.04
* You have a sudo-capable user (not root) for admin
* You will run:

    * Next.js app for `app.yumcut.com` on port **3000**
    * Another Node/static app for `static.yumcut.com` on port **3001**

You can always change ports later.

---

## 0. High-level security principles

* Never run Node/pm2 as `root`
* Use a dedicated app user (for example `deploy`)
* DB only listens on localhost, app has its own DB user
* Only 22, 80, 443 open in firewall
* All traffic to Node apps goes through Apache reverse proxy
* Keep secrets in `.env` with restricted permissions

---

## 1. Basic system setup and firewall

Update and install base tools:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y build-essential curl git ufw
```

Firewall (UFW):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 4404/tcp

sudo ufw enable
```

You can check:

```bash
sudo ufw status verbose
```

---

## 2. Create dedicated app user (`deploy`)

This user will own code, Node, pm2 processes.

```bash
sudo adduser --disabled-password --gecos "" deploy
# if you want to deploy via sudo sometimes:
sudo usermod -aG sudo deploy
```

App directories:

```bash
sudo mkdir -p /var/www/app.yumcut.com
sudo mkdir -p /var/www/static.yumcut.com
sudo mkdir -p /var/www/yumcut-daemon
sudo mkdir -p /var/www/yumcut-shorts-tools
sudo mkdir -p /var/www/video-slides
sudo mkdir -p /var/www/yumcut-captions-video-maker
sudo mkdir -p /root/YUMCUT_PROJECTS
sudo mkdir -p /root/YUMCUT-KEYS/
sudo mkdir -p /root/YUMCUT_FILES

sudo chown -R deploy:deploy /var/www/app.yumcut.com
sudo chown -R deploy:deploy /var/www/static.yumcut.com
sudo chown -R deploy:deploy /var/www/yumcut-daemon
sudo chown -R deploy:deploy /var/www/yumcut-shorts-tools
sudo chown -R deploy:deploy /var/www/video-slides
sudo chown -R deploy:deploy /var/www/yumcut-captions-video-maker
sudo chown -R deploy:deploy /root/YUMCUT_PROJECTS
sudo chown -R deploy:deploy /root/YUMCUT-KEYS/
sudo chown -R deploy:deploy /root/YUMCUT_FILES
```

You will later clone/copy your app into these directories as `deploy`.

---

## 3. Install and harden Apache

Install Apache:

```bash
sudo apt install -y apache2
sudo systemctl enable apache2
sudo systemctl start apache2
```

Harden basic Apache info leak:

```bash
echo 'ServerTokens Prod' | sudo tee /etc/apache2/conf-available/security-tokens.conf
echo 'ServerSignature Off' | sudo tee -a /etc/apache2/conf-available/security-tokens.conf

sudo a2enconf security-tokens.conf
sudo systemctl reload apache2
```

Enable required modules for reverse proxy:

```bash
sudo a2enmod proxy proxy_http headers rewrite
sudo systemctl restart apache2
```

---

## 4. Install and secure MySQL

Upload a SQL file:
```shell
scp /Users/test/Downloads/yumcut-backup-2025-12-05_17-34.sql root@YOUR_SERVER_IP:/root/yumcut.sql
```

Install:

```bash
sudo apt install -y mysql-server
sudo systemctl enable mysql
sudo systemctl start mysql
```

Secure defaults:

```bash
sudo mysql_secure_installation
```

Recommended answers:

* Validate password plugin: up to you, but “Y” is safer
* Remove anonymous users: Y
* Disallow root login remotely: Y
* Remove test database: Y
* Reload privilege tables: Y

Create app DB and a restricted DB user:

```bash
sudo mysql
```

In MySQL shell:

```sql
CREATE DATABASE yumcut CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'yumcut_user'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, ALTER
ON yumcut.* TO 'yumcut_user'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

Then import your dump (still as root):

```bash
mysql yumcut < /root/yumcut.sql
```


---

## 5. Install nvm and Node.js 24 (for `deploy` user only)

Switch to `deploy`:

```bash
sudo -iu deploy
```

Install nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
```

Load nvm in current shell:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

Add the same lines to `~/.bashrc` or `~/.zshrc` so it loads automatically:

```bash
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
```

Install Node 24:

```bash
nvm install 24
nvm use 24
nvm alias default 24
```

Check:

```bash
node -v
npm -v
```

---

## 6. Install pm2 (as `deploy`)

Still as `deploy`:

```bash
npm install -g pm2
pm2 -v
```

pm2 is now installed only for this user, not globally for root.

---

## 6.1. Create SSH Key for GitHub

Do this as the `deploy` user, not root.

```bash
# 1) switch to deploy user
su - deploy

# 2) generate SSH key (press Enter for all questions)
ssh-keygen -t ed25519 -C "deploy@yumcut-server"

# 3) show the public key to paste into GitHub/GitLab
cat ~/.ssh/id_ed25519.pub
```

Then:

1. Copy the output of `cat ~/.ssh/id_ed25519.pub`
2. In GitHub: Settings → SSH and GPG keys → New SSH key → paste
3. Test from server:

```bash
ssh -T git@github.com
```

(or `git@gitlab.com` depending on where your repo is)


## 7. Deploy apps under `deploy` user

### 7.1. App for `app.yumcut.com` (port 3000)

Still as `deploy`:

```bash
git clone git@github.com:IgorShadurin/app.yumcut.com.git /var/www/app.yumcut.com
git clone git@github.com:IgorShadurin/app.yumcut.com.git /var/www/yumcut-daemon
git clone git@github.com:IgorShadurin/yumcut-storage.git /var/www/static.yumcut.com
git clone git@github.com:IgorShadurin/yumcut-shorts-tools.git /var/www/yumcut-shorts-tools
git clone git@github.com:IgorShadurin/video-slides.git /var/www/video-slides
git clone git@github.com:IgorShadurin/yumcut-captions-video-maker.git /var/www/yumcut-captions-video-maker
```

### 7.2. Update FFmpeg to 7.1.1+

The daemon verifies the ffmpeg version on startup and exits if it is older than 7.1.1. Follow `docs/daemon-ffmpeg.md` to add the Ubuntu Handbook PPA (`ppa:ubuntuhandbook1/ffmpeg7`) and install the required build.

Environment file:

```bash
nano .env
```

Example permissions for `.env` and project:

```bash
chmod 640 .env
chmod -R 750 /var/www/app.yumcut.com
```

Start via pm2:

```bash
cd /var/www/static.yumcut.com
npm ci && npm run build
pm2 start "npm run start -- -p 3333" --name static.yumcut.com && pm2 logs -f static.yumcut.com

cd /var/www/app.yumcut.com
npm ci && npm run build
pm2 start "npm run start -- -p 3111" --name app.yumcut.com && pm2 logs -f app.yumcut.com

cd /var/www/yumcut-daemon
npm ci && npm run build
pm2 start "npm run daemon" --name yumcut-daemon && pm2 logs -f yumcut-daemon
```

## 8. Make pm2 start on boot (for `deploy` only)

Still as `deploy`:

```bash
pm2 startup systemd
```

It prints a command like:

```text
sudo env PATH=$PATH:/home/deploy/.nvm/versions/node/v24.x.x/bin pm2 startup systemd -u deploy --hp /home/deploy
```

Copy that command and run it in another shell (as your sudo admin user):

```bash
sudo env PATH=$PATH:/home/deploy/.nvm/versions/node/v24.x.x/bin pm2 startup systemd -u deploy --hp /home/deploy
```

Back as `deploy`, save the process list:

```bash
pm2 save
```

Now pm2 (and your apps) will come up automatically after reboot, running as **deploy**, not root.

If you ever accidentally ran pm2 as root before, clean that up:

```bash
# as root
pm2 list
pm2 delete all
pm2 save
sudo systemctl disable pm2-root --now 2>/dev/null || true
```

Then only use pm2 from `deploy`.

---

## 9. Configure Apache as reverse proxy

### 9.1. VirtualHost for `app.yumcut.com`

Create vhost:

```bash
sudo nano /etc/apache2/sites-available/app.yumcut.com.conf
```

Content:

```apache
<VirtualHost *:80>
    ServerName app.yumcut.com

    ProxyPreserveHost On
    ProxyRequests Off

    <Proxy *>
        Require all granted
    </Proxy>

    # Forward everything to Node on 3111
    ProxyPass / http://127.0.0.1:3111/ connectiontimeout=5 timeout=60
    ProxyPassReverse / http://127.0.0.1:3111/

    # Forward useful headers
    RequestHeader set X-Forwarded-Proto "http"
    RequestHeader set X-Forwarded-Port "80"

    ErrorLog /var/www/logs/app.yumcut.com-error.log
    CustomLog /var/www/logs/app.yumcut.com-access.log combined
</VirtualHost>
```

```apache
<VirtualHost *:80>
    ServerName static.yumcut.com

    ProxyPreserveHost On
    ProxyRequests Off

    <Proxy *>
        Require all granted
    </Proxy>

    # Forward everything to Node on 3333
    ProxyPass / http://127.0.0.1:3333/ connectiontimeout=5 timeout=60
    ProxyPassReverse / http://127.0.0.1:3333/

    # Forward useful headers
    RequestHeader set X-Forwarded-Proto "http"
    RequestHeader set X-Forwarded-Port "80"

    ErrorLog /var/www/logs/static.yumcut.com-error.log
    CustomLog /var/www/logs/static.yumcut.com-access.log combined
</VirtualHost>
```

#### Issue / re-issue HTTPS with Certbot

Even if you already had a certificate for `app.yumcut.com`, you need a repeatable way to reinstall or renew it. The safest flow is:

1. **Install Certbot (snap package).**

   ```bash
   sudo apt install -y snapd
   sudo snap install core
   sudo snap refresh core
   sudo snap install --classic certbot
   sudo ln -s /snap/bin/certbot /usr/bin/certbot
   ```

2. **Make sure the HTTP vhost is enabled and serving challenges.**  
   If you have not yet enabled it, do so now so Let’s Encrypt can reach `http://app.yumcut.com/.well-known/...`:

   ```bash
   sudo a2ensite app.yumcut.com.conf
   sudo systemctl reload apache2
   ```

   (Certbot’s Apache plugin only needs the port‑80 vhost; you can still keep HTTPS disabled until the certificate is issued.)

3. **Inspect existing certificates (if any).**  
   This tells you whether Certbot already has metadata for this domain and where it is stored.

   ```bash
   sudo certbot certificates
   ```

   * If `app.yumcut.com` shows up, you can renew or reissue it in place.
   * If it does not show up (e.g. you issued it on another machine), just request a new one.

4. **Request (or reissue) the certificate (both hostnames in one run).**  
   Let Certbot edit Apache for you and write the HTTPS vhosts automatically:

   ```bash
   sudo certbot --apache -d app.yumcut.com -d static.yumcut.com
   ```

   * Use `--force-renewal` if you need to overwrite a broken/expired cert immediately.
   * Certbot will create/refresh the `*-le-ssl.conf` files for both hosts and reload Apache after you confirm the prompts.

5. **(Optional) reload Apache manually if you tweaked configs after Certbot ran.**

   ```bash
   sudo systemctl reload apache2
   ```

6. **Confirm renewals will work.**  
   Certbot installs a systemd timer for automatic renewals. Verify with:

   ```bash
   sudo systemctl list-timers | grep certbot
   sudo certbot renew --dry-run
   ```

This flow works whether you are reinstalling an existing certificate or requesting a completely new one, and it does not require `a2ensite` to have been run before—Certbot only needs the HTTP vhost active during issuance.

Enable:

```bash
sudo a2ensite app.yumcut.com.conf
```


### 9.3. Disable default site, test config, reload

```bash
sudo a2dissite 000-default.conf

sudo apachectl configtest
sudo systemctl reload apache2
```

Now:

* `app.yumcut.com` → `127.0.0.1:3111` (pm2 `app.yumcut.com`)
* `static.yumcut.com` → `127.0.0.1:3333` (pm2 `static.yumcut.com`)

Make sure DNS for both domains points to this server’s IP.

---

## 10. Extra hardening ideas (optional but recommended)

Not strictly required for first run, but good to consider:

1. **Keep Next.js and dependencies up to date.** RCE bugs usually come from outdated packages.
2. **SSH hardening**:

    * Use key-based auth, disable password login
    * Disable root SSH login (`PermitRootLogin no` in `/etc/ssh/sshd_config`)
3. **Fail2ban** for SSH/Apache brute-force protection:

   ```bash
   sudo apt install -y fail2ban
   ```
4. **Separate envs per app** (don’t reuse DB users or env vars across different services).
5. **Regular backups** of DB and configs.

---

## 12. Quick security checklist

* Node apps run as `deploy`, not root
* pm2 service is configured for `deploy` only
* MySQL accessible only via `localhost`, app has dedicated DB user
* Only ports 22, 80, 443 open in firewall
* Apache proxies to `127.0.0.1:3000` and `127.0.0.1:3001`
* HTTPS enabled for both domains
* `.env` files not world-readable

If you want, next I can add a minimal deploy script (git pull + npm install + build + pm2 restart) that also tries to be safe (no root, runs only as `deploy`).
