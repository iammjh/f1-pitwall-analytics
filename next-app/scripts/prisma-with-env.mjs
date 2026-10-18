import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require('@next/env');
const appDirectory = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/prisma-with-env.mjs <Prisma command> [...args]');
  process.exit(1);
}

// Prisma loads .env by itself, whereas the app documents .env.local.
// Match Next.js precedence without overriding environment variables from a host.
loadEnvConfig(appDirectory, process.env.NODE_ENV !== 'production');

const child = spawn(process.execPath, [require.resolve('prisma'), ...args], {
  cwd: appDirectory,
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
