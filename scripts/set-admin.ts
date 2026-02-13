#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';

function loadDotEnv(rootDir: string) {
  const envPath = path.join(rootDir, '.env');
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) (process.env as any)[key] = val;
    }
  } catch {
    // ignore missing .env
  }
}

async function main() {
  loadDotEnv(process.cwd());
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Create a .env file at the repo root first.');
    process.exit(1);
  }

  const [, , identifier, stateArg] = process.argv;
  if (!identifier) {
    console.error('Usage: npm run admin:set -- <user-id-or-email> [true|false]');
    process.exit(1);
  }

  const lookupField = identifier.includes('@') ? 'email' : 'id';
  let makeAdmin = true;
  if (typeof stateArg === 'string') {
    const normalized = stateArg.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      makeAdmin = true;
    } else if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      makeAdmin = false;
    } else {
      console.error("Invalid state. Expected 'true' or 'false'.");
      process.exit(1);
    }
  }

  const { prisma } = await import('../src/server/db');
  const where = { [lookupField]: identifier } as any;

  const select = {
    id: true,
    email: true,
    isAdmin: true,
  } satisfies Prisma.UserSelect;

  try {
    const user = await prisma.user.findUnique({ where, select });
    if (!user) {
      console.error('User not found.');
      process.exitCode = 1;
      return;
    }

    if (!!user.isAdmin === makeAdmin) {
      console.log(`No change. User ${user.email || user.id} is already ${makeAdmin ? 'an administrator' : 'a standard user'}.`);
      return;
    }

    await prisma.user.update({ where, data: { isAdmin: makeAdmin } });
    console.log(`Success. User ${user.email || user.id} is now ${makeAdmin ? 'an administrator' : 'a standard user'}.`);
  } catch (err: any) {
    console.error('Failed to update administrator flag:', err?.message || String(err));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { prisma } = await import('../src/server/db');
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
