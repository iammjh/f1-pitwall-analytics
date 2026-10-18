import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import { verificationFailed, verifyMongo, verifyOpenF1, verifyRedis } from './service-verification.mjs';

const args = process.argv.slice(2);
if (args.some((arg) => !['--json', '--require-live'].includes(arg))) {
  console.error('Usage: npm run services:verify -- [--json] [--require-live]');
  process.exit(1);
}
const { loadEnvConfig } = createRequire(import.meta.url)('@next/env');
loadEnvConfig(fileURLToPath(new URL('../', import.meta.url)), process.env.NODE_ENV !== 'production', {
  info() {},
  error() { console.error('An environment file could not be loaded. Check file permissions and syntax.'); },
});

const [mongo, redis, openf1] = await Promise.all([
  verifyMongo(process.env, (uri) => new PrismaClient({ datasources: { db: { url: uri } }, log: [] })),
  verifyRedis(process.env, createClient),
  verifyOpenF1(process.env),
]);
const checks = [mongo, redis, ...openf1];
if (args.includes('--json')) console.log(JSON.stringify({ checks }, null, 2));
else checks.forEach((check) => console.log(`${check.service}: ${check.status} — ${check.message}`));
process.exitCode = verificationFailed(checks, args.includes('--require-live')) ? 1 : 0;
