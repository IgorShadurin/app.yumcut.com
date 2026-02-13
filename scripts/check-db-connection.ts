#!/usr/bin/env tsx
import 'dotenv/config';
import { inspect } from 'node:util';
import { PrismaClient } from '@prisma/client';

function sanitizeDatabaseUrl(url: string) {
  return url.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

function summarize(url: string) {
  if (!url) return '(empty)';
  try {
    const parsed = new URL(url);
    const auth = parsed.username
      ? `${parsed.username}${parsed.password ? ':***' : ''}@`
      : '';
    return `${parsed.protocol}//${auth}${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
  } catch {
    return '(unparseable URL)';
  }
}

async function main() {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) {
    console.error('DATABASE_URL is not set. Export it or update your .env before running this check.');
    process.exit(1);
  }

  const sanitized = sanitizeDatabaseUrl(raw);
  console.log('Raw DATABASE_URL length:', raw.length);
  console.log('Raw contains "%" characters:', raw.includes('%'));
  console.log('Sanitized equals raw:', sanitized === raw);
  console.log('Raw summary   :', summarize(raw));
  console.log('Sanitized summary:', summarize(sanitized));

  process.env.DATABASE_URL = sanitized;
  const prisma = new PrismaClient();
  try {
    const startedAt = Date.now();
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    const duration = Date.now() - startedAt;
    console.log('Test query result:', inspect(result, { depth: null }));
    console.log(`Query completed in ${duration}ms`);
  } catch (err: any) {
    console.error('Failed to run test query:', err?.message || err);
    if (err?.code) console.error('Error code:', err.code);
    if (err?.meta) console.error('Error meta:', err.meta);
    if (err?.cause) console.error('Caused by:', err.cause);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Unexpected failure while checking DB connection:', err);
  process.exit(1);
});
