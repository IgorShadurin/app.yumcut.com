#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-app.yumcut.com}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/app.yumcut.com}"
REPO_URL="${REPO_URL:-git@github.com:IgorShadurin/app.yumcut.com.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3111}"
PM2_INSTANCES="${PM2_INSTANCES:-2}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_DELAY_SECONDS="${HEALTH_DELAY_SECONDS:-2}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-1}"

RELEASES_DIR="${DEPLOY_ROOT}/releases"
SHARED_DIR="${DEPLOY_ROOT}/shared"
SHARED_ENV="${SHARED_DIR}/.env"
CURRENT_LINK="${DEPLOY_ROOT}/current"
LOCK_DIR="${DEPLOY_ROOT}/.deploy.lock"

RELEASE_DIR=""
PREVIOUS_RELEASE=""
DEPLOY_SUCCEEDED="0"

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

cleanup() {
  local exit_code=$?

  if [ "${DEPLOY_SUCCEEDED}" != "1" ] && [ -n "${RELEASE_DIR}" ] && [ -d "${RELEASE_DIR}" ]; then
    rm -rf "${RELEASE_DIR}"
  fi

  if [ -d "${LOCK_DIR}" ]; then
    rmdir "${LOCK_DIR}" 2>/dev/null || true
  fi

  exit "${exit_code}"
}

require_command node
node "$(dirname "${BASH_SOURCE[0]}")/../../scripts/check-node-version.cjs"

trap cleanup EXIT

healthcheck() {
  local attempt status

  for attempt in $(seq 1 "${HEALTH_RETRIES}"); do
    status="$(curl -fsS -o /dev/null -w '%{http_code}' "${HEALTH_URL}" || true)"

    case "${status}" in
      2*|3*)
        log "Healthcheck passed (${status})"
        return 0
        ;;
    esac

    log "Healthcheck attempt ${attempt}/${HEALTH_RETRIES} failed (${status:-no response})"
    sleep "${HEALTH_DELAY_SECONDS}"
  done

  return 1
}

write_pm2_config() {
  local release_dir="$1"

  mkdir -p "${release_dir}/.deploy"

  cat > "${release_dir}/.deploy/ecosystem.config.cjs" <<PM2_CONFIG
const path = require('path');

const releaseRoot = path.resolve(__dirname, '..');

module.exports = {
  apps: [
    {
      name: '${APP_NAME}',
      cwd: releaseRoot,
      script: 'node_modules/next/dist/bin/next',
      args: ['start', '-p', process.env.PORT || '${PORT}'],
      exec_mode: 'cluster',
      instances: Number(process.env.PM2_INSTANCES || '${PM2_INSTANCES}'),
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || '${PORT}',
      },
      kill_timeout: Number(process.env.PM2_KILL_TIMEOUT || 10000),
      listen_timeout: Number(process.env.PM2_LISTEN_TIMEOUT || 10000),
      max_memory_restart: process.env.PM2_MAX_MEMORY || '1G',
    },
  ],
};
PM2_CONFIG
}

pm2_reload_current() {
  APP_NAME="${APP_NAME}" PORT="${PORT}" PM2_INSTANCES="${PM2_INSTANCES}" \
    pm2 startOrReload "${CURRENT_LINK}/.deploy/ecosystem.config.cjs" --only "${APP_NAME}" --update-env
}

rollback() {
  if [ -z "${PREVIOUS_RELEASE}" ] || [ ! -d "${PREVIOUS_RELEASE}" ]; then
    fail "Healthcheck failed and no previous release is available for rollback"
  fi

  log "Rolling back to ${PREVIOUS_RELEASE}"
  ln -sfn "${PREVIOUS_RELEASE}" "${CURRENT_LINK}"
  pm2_reload_current

  if ! healthcheck; then
    fail "Rollback reload did not pass healthcheck. Check PM2 logs: pm2 logs -f ${APP_NAME}"
  fi
}

prune_old_releases() {
  local keep_plus_header

  if [ "${KEEP_RELEASES}" -le 0 ]; then
    return 0
  fi

  keep_plus_header=$((KEEP_RELEASES + 1))

  find "${RELEASES_DIR}" -mindepth 1 -maxdepth 1 -type d -name '20*' \
    | sort -r \
    | tail -n "+${keep_plus_header}" \
    | while IFS= read -r old_release; do
        log "Removing old release ${old_release}"
        rm -rf "${old_release}"
      done
}

require_command git
require_command npm
require_command curl
require_command pm2

mkdir -p "${DEPLOY_ROOT}" "${RELEASES_DIR}" "${SHARED_DIR}"

if ! mkdir "${LOCK_DIR}" 2>/dev/null; then
  fail "Another deploy is already running (${LOCK_DIR} exists)"
fi

if [ ! -f "${SHARED_ENV}" ] && [ -f "${DEPLOY_ROOT}/.env" ]; then
  log "Copying existing ${DEPLOY_ROOT}/.env to ${SHARED_ENV}"
  cp -p "${DEPLOY_ROOT}/.env" "${SHARED_ENV}"
fi

if [ ! -f "${SHARED_ENV}" ]; then
  fail "Missing ${SHARED_ENV}. Put the production .env there before deploying."
fi

if [ -L "${CURRENT_LINK}" ]; then
  PREVIOUS_RELEASE="$(readlink "${CURRENT_LINK}")"
fi

RELEASE_ID="$(date +%Y%m%d%H%M%S)"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"

log "Cloning ${BRANCH} from ${REPO_URL} into ${RELEASE_DIR}"
git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${RELEASE_DIR}"

node "${RELEASE_DIR}/scripts/check-node-version.cjs"

ln -sfn "${SHARED_ENV}" "${RELEASE_DIR}/.env"
write_pm2_config "${RELEASE_DIR}"

log "Installing dependencies"
(
  cd "${RELEASE_DIR}"
  npm ci
)

log "Building app"
(
  cd "${RELEASE_DIR}"
  npm run build
)

if [ "${RUN_MIGRATIONS}" = "1" ]; then
  log "Applying Prisma migrations"
  (
    cd "${RELEASE_DIR}"
    npm run prisma:migrate:deploy
  )
fi

log "Switching current symlink to ${RELEASE_DIR}"
ln -sfn "${RELEASE_DIR}" "${CURRENT_LINK}"

log "Reloading PM2 app ${APP_NAME}"
pm2_reload_current

if ! healthcheck; then
  rollback
  fail "New release failed healthcheck and was rolled back"
fi

DEPLOY_SUCCEEDED="1"

pm2 save
prune_old_releases

log "Deploy completed: ${RELEASE_DIR}"
