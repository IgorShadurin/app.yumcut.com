#!/usr/bin/env node
'use strict';

// October 2026 security baseline, including CVE-2026-111497 (Brotli RCE).
// Keep package.json engines, package-lock.json and .nvmrc in sync.
function isSupportedNode(version) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [, major, minor, patch] = match.map(Number);
  return major === 24 && (minor > 22 || (minor === 22 && patch >= 1));
}

if (require.main === module && !isSupportedNode(process.versions.node)) {
  console.error(
    `Unsupported Node.js ${process.versions.node}. YumCut requires Node.js >=24.22.1 <25. ` +
    'Run nvm install && nvm use in the repository, then restart all app and worker processes. ' +
    'See docs/deploy/node-security.md.'
  );
  process.exitCode = 1;
}

module.exports = { isSupportedNode };
