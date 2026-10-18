import { describe, expect, it, vi } from 'vitest';
import { migrateLegacyUsers, readLegacyCollection } from '../scripts/legacy-migration.mjs';

type Doc = Record<string, any>;
const id = (n: number) => n.toString(16).padStart(24, '0');
const rawId = (value: any) => typeof value === 'string' ? value : value.$oid;

function database(count = 1, secondList = false) {
  const users: Doc[] = [];
  const targets: Doc[] = [];
  const collections: Record<string, Doc[]> = {
    users: Array.from({ length: count }, (_, i) => ({ _id: { $oid: id(i + 1) }, email: `driver${i}@example.com`, password: 'legacy-hash' })),
    watchlists: Array.from({ length: count }, (_, i) => ({ _id: { $oid: id(1000 + i) }, userId: { $oid: id(i + 1) }, name: 'Legacy favorites', drivers: ['driver-a'], races: [1] })),
    _F1LegacyWatchlistMap: [],
  };
  if (secondList) collections.watchlists.push({ _id: { $oid: id(2000) }, userId: { $oid: id(1) }, name: 'Missing list', teams: ['ferrari'] });
  const prisma = {
    $runCommandRaw: vi.fn(async (command: Doc) => {
      if (command.find) {
        const boundary = command.filter?._id?.$gt;
        const rows = collections[command.find]
          .filter(row => boundary === undefined || rawId(row._id) > rawId(boundary))
          .sort((a, b) => rawId(a._id).localeCompare(rawId(b._id)))
          .slice(0, command.limit);
        return { cursor: { id: 0, firstBatch: rows } };
      }
      if (command.update) {
        for (const update of command.updates) {
          const rows = collections[command.update];
          const found = rows.find(row => row._id === update.q._id);
          if (found) {
            if (!Object.entries(update.q).every(([key, value]) => found[key] === value)) return { ok: 1, writeErrors: [{ code: 11000 }] };
          } else rows.push({ ...update.q, ...update.u.$setOnInsert });
        }
        return { ok: 1 };
      }
      throw new Error('Unexpected raw command');
    }),
    user: {
      findUnique: vi.fn(async ({ where }: Doc) => users.find(user => where.id ? user.id === where.id : user.email === where.email) ?? null),
      create: vi.fn(async ({ data }: Doc) => { const user = { ...data }; users.push(user); return user; }),
    },
    watchlist: {
      findUnique: vi.fn(async ({ where }: Doc) => targets.find(list => list.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: Doc) => targets.filter(list => list.userId === where.userId)),
      create: vi.fn(async ({ data }: Doc) => {
        if (targets.some(list => list.id === data.id)) throw new Error('Duplicate ID');
        const list = { id: `generated-${targets.length}`, ...data };
        targets.push(list); return list;
      }),
    },
  };
  return { prisma, users, targets, collections };
}

describe('legacy migration recovery', () => {
  it('migrates every record beyond the first batch and is safe to rerun', async () => {
    const db = database(205);
    const result = await migrateLegacyUsers(db.prisma);
    expect(result).toMatchObject({ migratedUsers: 205, recoveredWatchlists: 205, needsReview: [] });
    expect(db.users).toHaveLength(205);
    expect(db.targets).toHaveLength(205);
    expect(db.prisma.$runCommandRaw.mock.calls.some(([command]) => command.find === 'users' && command.filter?._id?.$gt)).toBe(true);
    expect(await migrateLegacyUsers(db.prisma)).toMatchObject({ migratedUsers: 0, recoveredWatchlists: 0, needsReview: [] });
    expect(db.targets).toHaveLength(205);
  });

  it('recognizes old random-ID imports and recovers missing lists without duplicates', async () => {
    const db = database(1, true);
    db.users.push({ id: id(1), email: 'driver0@example.com', password: 'preserve-this-password' });
    db.targets.push({ id: id(9999), userId: id(1), name: 'Legacy favorites', drivers: ['driver-a'], teams: [], races: ['1'] });
    expect(await migrateLegacyUsers(db.prisma)).toMatchObject({ migratedUsers: 0, recoveredWatchlists: 1, needsReview: [] });
    expect(db.users[0].password).toBe('preserve-this-password');
    db.targets[0].name = 'Edited after import';
    expect(await migrateLegacyUsers(db.prisma)).toMatchObject({ recoveredWatchlists: 0, needsReview: [] });
    expect(db.targets).toHaveLength(2);
    expect(db.targets[0].name).toBe('Edited after import');
  });

  it('preserves intentional deletions of mapped lists', async () => {
    const db = database();
    await migrateLegacyUsers(db.prisma);
    db.targets.length = 0;
    expect(await migrateLegacyUsers(db.prisma)).toMatchObject({ recoveredWatchlists: 0, needsReview: [] });
    expect(db.targets).toHaveLength(0);
  });

  it('reports ambiguous old edited lists instead of duplicating or overwriting them', async () => {
    const db = database();
    db.users.push({ id: id(1), email: 'driver0@example.com', password: 'keep' });
    db.targets.push({ id: id(9999), userId: id(1), name: 'Unidentifiable edited list', drivers: ['driver-b'] });
    const before = JSON.stringify(db.targets);
    const result = await migrateLegacyUsers(db.prisma);
    expect(result.needsReview).toHaveLength(1);
    expect(result.recoveredWatchlists).toBe(0);
    expect(JSON.stringify(db.targets)).toBe(before);
  });

  it('does not merge legacy data into an unrelated account sharing an email', async () => {
    const db = database();
    db.users.push({ id: id(9999), email: 'driver0@example.com', password: 'keep' });
    expect((await migrateLegacyUsers(db.prisma)).needsReview).toHaveLength(1);
    expect(db.prisma.watchlist.create).not.toHaveBeenCalled();
  });

  function ambiguous(secondList = false) {
    const db = database(1, secondList);
    db.users.push({ id: id(1), email: 'driver0@example.com', password: 'keep' });
    db.targets.push({ id: id(9999), userId: id(1), name: 'Edited after the old import', drivers: ['driver-b'] });
    return db;
  }

  function expectNoWrites(db: ReturnType<typeof database>) {
    expect(db.prisma.user.create).not.toHaveBeenCalled();
    expect(db.prisma.watchlist.create).not.toHaveBeenCalled();
    expect(db.prisma.$runCommandRaw.mock.calls.filter(([command]) => command.update)).toHaveLength(0);
  }

  it('dry runs produce a reviewable manifest without creating users, watchlists, or provenance', async () => {
    const fresh = database(2);
    expect(await migrateLegacyUsers(fresh.prisma, { dryRun: true })).toMatchObject({ migratedUsers: 2, recoveredWatchlists: 2, dryRun: true });
    expectNoWrites(fresh);
    const db = ambiguous();
    const result = await migrateLegacyUsers(db.prisma, { dryRun: true });
    expect(result.resolutionManifest).toMatchObject({ version: 1, entries: [{
      sourceUserId: id(1), sourceId: id(1000), targetUserId: id(1), decision: null, targetId: null,
      source: { name: 'Legacy favorites' }, candidates: [{ id: id(9999), name: 'Edited after the old import' }],
    }] });
    expect(JSON.stringify(result)).not.toContain('legacy-hash');
    expectNoWrites(db);
  });

  it('maps an explicitly chosen edited list without changing it and preserves its later deletion', async () => {
    const db = ambiguous();
    const { resolutionManifest } = await migrateLegacyUsers(db.prisma, { dryRun: true });
    Object.assign(resolutionManifest.entries[0], { decision: 'map', targetId: id(9999) });
    const before = JSON.stringify(db.targets);
    expect(await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).toMatchObject({ mappedWatchlists: 1, needsReview: [] });
    expect(JSON.stringify(db.targets)).toBe(before);
    expect(db.collections._F1LegacyWatchlistMap[0]).toMatchObject({ targetId: id(9999), decision: 'map' });
    db.targets[0].name = 'Edited again';
    expect(await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).toMatchObject({ mappedWatchlists: 0, recoveredWatchlists: 0 });
    db.targets.length = 0;
    await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest });
    await migrateLegacyUsers(db.prisma);
    expect(db.targets).toHaveLength(0);
  });

  it('imports a separate list with a deterministic ID when explicitly selected and does not duplicate it', async () => {
    const db = ambiguous();
    const { resolutionManifest } = await migrateLegacyUsers(db.prisma, { dryRun: true });
    resolutionManifest.entries[0].decision = 'import';
    expect(await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest, dryRun: true })).toMatchObject({ recoveredWatchlists: 1 });
    expectNoWrites(db);
    expect(await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).toMatchObject({ recoveredWatchlists: 1, needsReview: [] });
    expect(db.targets).toHaveLength(2);
    expect(db.targets[0].name).toBe('Edited after the old import');
    expect(db.targets[1]).toMatchObject({ id: id(1000), userId: id(1), name: 'Legacy favorites' });
    await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest });
    await migrateLegacyUsers(db.prisma);
    expect(db.targets).toHaveLength(2);
    db.targets.splice(1, 1);
    await migrateLegacyUsers(db.prisma);
    expect(db.targets).toHaveLength(1);
  });

  it('records an explicit skip permanently, including when all edited targets are later deleted', async () => {
    const db = ambiguous();
    const { resolutionManifest } = await migrateLegacyUsers(db.prisma, { dryRun: true });
    resolutionManifest.entries[0].decision = 'skip';
    expect(await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).toMatchObject({ skippedWatchlists: 1, needsReview: [] });
    expect(db.collections._F1LegacyWatchlistMap[0]).toMatchObject({ targetId: null, decision: 'skip' });
    db.targets.length = 0;
    await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest });
    await migrateLegacyUsers(db.prisma);
    expect(db.targets).toHaveLength(0);
  });

  it('rejects cross-owner targets and invalid later decisions before any earlier import is written', async () => {
    const db = ambiguous(true);
    db.targets.push({ id: id(8888), userId: id(2), name: 'Private foreign list' });
    const { resolutionManifest } = await migrateLegacyUsers(db.prisma, { dryRun: true });
    Object.assign(resolutionManifest.entries[0], { decision: 'import', targetId: null });
    Object.assign(resolutionManifest.entries[1], { decision: 'map', targetId: id(8888) });
    await expect(migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).rejects.toThrow('owned by the same account');
    expectNoWrites(db);
  });

  it('requires every ambiguous entry and refuses duplicate or unknown sources before writes', async () => {
    const db = ambiguous(true);
    const { resolutionManifest } = await migrateLegacyUsers(db.prisma, { dryRun: true });
    for (const entry of resolutionManifest.entries) entry.decision = 'import';
    await expect(migrateLegacyUsers(db.prisma, { resolutions: { ...resolutionManifest, entries: resolutionManifest.entries.slice(0, 1) } }))
      .rejects.toThrow('decide every ambiguous source');
    await expect(migrateLegacyUsers(db.prisma, { resolutions: { ...resolutionManifest, entries: [resolutionManifest.entries[0], resolutionManifest.entries[0]] } }))
      .rejects.toThrow('Duplicate');
    const unrelated = structuredClone(resolutionManifest);
    unrelated.entries[0].sourceUserId = id(2);
    await expect(migrateLegacyUsers(db.prisma, { resolutions: unrelated })).rejects.toThrow();
    const invalid = structuredClone(resolutionManifest);
    invalid.entries[0].decision = 'guess';
    await expect(migrateLegacyUsers(db.prisma, { resolutions: invalid })).rejects.toThrow('map, import, or skip');
    expectNoWrites(db);
  });

  it('rejects a stale source or candidate snapshot without writes', async () => {
    const db = ambiguous();
    const { resolutionManifest } = await migrateLegacyUsers(db.prisma, { dryRun: true });
    resolutionManifest.entries[0].decision = 'import';
    db.targets[0].name = 'A newer edit';
    await expect(migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).rejects.toThrow('stale or altered');
    db.targets[0].name = 'Edited after the old import';
    db.collections.watchlists[0].drivers.push('new-driver');
    await expect(migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).rejects.toThrow('stale or altered');
    expectNoWrites(db);
  });

  it('prevents two resolution entries from claiming the same edited target', async () => {
    const db = ambiguous(true);
    const { resolutionManifest } = await migrateLegacyUsers(db.prisma, { dryRun: true });
    for (const entry of resolutionManifest.entries) Object.assign(entry, { decision: 'map', targetId: id(9999) });
    await expect(migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).rejects.toThrow('unclaimed');
    expectNoWrites(db);
  });

  it('refuses to replace a decision that was already applied', async () => {
    const db = ambiguous();
    const { resolutionManifest } = await migrateLegacyUsers(db.prisma, { dryRun: true });
    resolutionManifest.entries[0].decision = 'skip';
    await migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest });
    resolutionManifest.entries[0].decision = 'import';
    await expect(migrateLegacyUsers(db.prisma, { resolutions: resolutionManifest })).rejects.toThrow('already recorded');
    expect(db.targets).toHaveLength(1);
  });

  it('blocks deterministic ID and existing provenance collisions across owners before creating accounts', async () => {
    const db = database(2);
    db.targets.push({ id: id(1001), userId: id(9999), name: 'Foreign list' });
    await expect(migrateLegacyUsers(db.prisma)).rejects.toThrow('another account');
    expectNoWrites(db);
    const mapped = database();
    mapped.users.push({ id: id(1), email: 'driver0@example.com' });
    mapped.targets.push({ id: id(9999), userId: id(2), name: 'Foreign list' });
    mapped.collections._F1LegacyWatchlistMap.push({ _id: `${id(1)}:${id(1000)}`, sourceUserId: id(1), sourceId: id(1000), targetId: id(9999) });
    await expect(migrateLegacyUsers(mapped.prisma)).rejects.toThrow('another account');
    expectNoWrites(mapped);
  });

  it('rejects duplicate legacy emails before creating any account', async () => {
    const db = database(2);
    db.collections.users[1].email = ' DRIVER0@EXAMPLE.COM ';
    await expect(migrateLegacyUsers(db.prisma)).rejects.toThrow('share the same email');
    expectNoWrites(db);
  });

  it('does not arbitrarily choose one of several identical existing candidates', async () => {
    const db = ambiguous();
    const source = db.collections.watchlists[0];
    db.targets[0] = { id: id(9999), userId: id(1), name: source.name, drivers: ['driver-a'], races: ['1'] };
    db.targets.push({ ...db.targets[0], id: id(9998) });
    const result = await migrateLegacyUsers(db.prisma);
    expect(result.needsReview).toHaveLength(1);
    expect(result.resolutionManifest.entries[0].candidates).toHaveLength(2);
    expectNoWrites(db);
  });

  it('fails visibly if independent keyset queries stop advancing', async () => {
    const prisma = { $runCommandRaw: vi.fn(async () => ({ cursor: { firstBatch: [{ _id: { $oid: id(1) } }] } })) };
    await expect(readLegacyCollection(prisma, 'users')).rejects.toThrow('did not advance');
  });
});
