/** Review legacy imports before applying explicit decisions; no source collections are changed. */
import { config } from 'dotenv';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { migrateLegacyUsers } from './legacy-migration.mjs';

function options(args) {
  const result = { dryRun: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--dry-run') result.dryRun = true;
    else if (['--report', '--apply-resolutions'].includes(argument)) {
      const path = args[++index];
      if (!path || path.startsWith('--')) throw new Error(`${argument} requires a JSON file path.`);
      const key = argument === '--report' ? 'report' : 'resolutionsPath';
      if (result[key]) throw new Error(`Duplicate ${argument} option.`);
      result[key] = resolve(path);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (result.report && !result.dryRun) throw new Error('--report requires --dry-run so report creation cannot follow database writes.');
  return result;
}

let prisma;
try {
  const parsed = options(process.argv.slice(2));
  const resolutions = parsed.resolutionsPath ? JSON.parse(await readFile(parsed.resolutionsPath, 'utf8')) : undefined;
  config({ path: resolve(process.cwd(), '.env.local') });
  config({ path: resolve(process.cwd(), '.env') });
  prisma = new PrismaClient();
  const summary = await migrateLegacyUsers(prisma, { dryRun: parsed.dryRun, resolutions });
  if (parsed.report) {
    // Exclusive creation protects the operator's previously edited decisions.
    await writeFile(parsed.report, `${JSON.stringify(summary.resolutionManifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify(summary, null, 2));
  console.log(parsed.dryRun ? 'Dry run: no database writes were performed.'
    : 'Legacy collections were left untouched. Preserve _F1LegacyWatchlistMap, including skip records, for safe reruns.');
  if (summary.needsReview.length) {
    console.error('Review the manifest: choose map with a candidate targetId, import with targetId null, or skip with targetId null. Then use --apply-resolutions FILE.');
    process.exitCode = 2;
  }
} catch (error) {
  console.error('[migrate-legacy-users]', error instanceof Error ? error.message : 'Migration failed.');
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
}
