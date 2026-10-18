import { createHash } from 'node:crypto';

const MAPPING_COLLECTION = '_F1LegacyWatchlistMap';
const OBJECT_ID = /^[a-f\d]{24}$/i;

/**
 * @typedef {{name: string, description: string|null, drivers: string[], teams: string[], races: string[], isPublic: boolean}} WatchlistSnapshot
 * @typedef {{sourceUserId: string, sourceId: string, targetUserId: string, source: WatchlistSnapshot,
 * candidates: Array<WatchlistSnapshot & {id: string}>, snapshot: string, decision: string|null, targetId: string|null}} ResolutionEntry
 */

export function legacyId(value) {
  if (typeof value === 'string' && value.length) return value;
  if (value && typeof value.$oid === 'string' && value.$oid.length) return value.$oid;
  throw new Error('Unsupported legacy identifier; existing records were preserved.');
}

/** Independent queries avoid MongoDB cursor/session affinity in $runCommandRaw. */
export async function readLegacyCollection(prisma, collection) {
  const documents = [];
  let lastId;
  for (;;) {
    const result = await prisma.$runCommandRaw({
      find: collection, filter: lastId === undefined ? {} : { _id: { $gt: lastId } },
      sort: { _id: 1 }, limit: 100, batchSize: 100, singleBatch: true,
    });
    const batch = result.cursor?.firstBatch;
    if (!Array.isArray(batch)) throw new Error(`Invalid legacy batch from ${collection}.`);
    if (!batch.length) return documents;
    const nextId = batch[batch.length - 1]._id;
    if (nextId === undefined || JSON.stringify(nextId) === JSON.stringify(lastId)) {
      throw new Error(`Legacy pagination did not advance for ${collection}.`);
    }
    documents.push(...batch);
    lastId = nextId;
  }
}

function objectId(value) {
  return OBJECT_ID.test(value) ? value.toLowerCase()
    : createHash('sha256').update(`f1-legacy:${value}`).digest('hex').slice(0, 24);
}

function items(value) {
  if (value == null) return [];
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(parsed) || parsed.some(item => !['string', 'number'].includes(typeof item))) {
    throw new Error('Invalid legacy watchlist array; existing data was preserved.');
  }
  return parsed.map(String);
}

function watchlistData(source) {
  const name = source.name ?? 'My Favorites';
  const description = source.description ?? null;
  if (typeof name !== 'string' || (description !== null && typeof description !== 'string')) {
    throw new Error('Invalid legacy watchlist text; existing data was preserved.');
  }
  return { name, description, drivers: items(source.drivers), teams: items(source.teams),
    races: items(source.races), isPublic: source.isPublic === true };
}

function signature(value) {
  const data = watchlistData(value);
  return JSON.stringify({ ...data, drivers: [...data.drivers].sort(), teams: [...data.teams].sort(), races: [...data.races].sort() });
}

// Canonical keys make edited JSON formatting irrelevant to the review receipt.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function reviewEntry(sourceUserId, targetUserId, source, candidates) {
  const snapshot = {
    sourceUserId, sourceId: source.sourceId, targetUserId, source: source.data,
    candidates: candidates.map(target => ({ id: target.id, ...watchlistData(target) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return { ...snapshot, snapshot: fingerprint(snapshot), decision: null, targetId: null };
}

function entryKey(entry) {
  if (typeof entry?.sourceUserId !== 'string' || typeof entry?.sourceId !== 'string') {
    throw new Error('Every resolution must identify a legacy user and watchlist.');
  }
  return JSON.stringify([entry.sourceUserId, entry.sourceId]);
}

function resolutionEntries(manifest) {
  if (manifest === undefined) return undefined;
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error('Invalid resolution manifest: expected version 1 and an entries array.');
  }
  const entries = new Map();
  for (const entry of manifest.entries) {
    const key = entryKey(entry);
    if (entries.has(key)) throw new Error('Duplicate legacy watchlist resolution.');
    if (!['map', 'import', 'skip'].includes(entry.decision)) {
      throw new Error('Each resolution decision must be map, import, or skip.');
    }
    if (entry.decision === 'map' ? !OBJECT_ID.test(entry.targetId ?? '') : entry.targetId !== null) {
      throw new Error('Only map decisions may specify a targetId; import and skip require null.');
    }
    entries.set(key, entry);
  }
  return entries;
}

async function remember(prisma, mapping) {
  // A concurrent, different mapping must fail on the unique _id instead of replacing provenance.
  const result = await prisma.$runCommandRaw({ update: MAPPING_COLLECTION,
    updates: [{ q: mapping, u: { $setOnInsert: mapping }, upsert: true }],
  });
  if (result.ok !== 1 || result.writeErrors?.length) throw new Error('Could not record legacy migration provenance.');
}

/**
 * Plan and validate the complete run before any writes. No account or list contents are overwritten.
 * @param {any} prisma
 * @param {{dryRun?: boolean, resolutions?: unknown}} [options]
 */
export async function migrateLegacyUsers(prisma, { dryRun = false, resolutions } = {}) {
  const supplied = resolutionEntries(resolutions);
  const [users, lists, mappings] = await Promise.all([
    readLegacyCollection(prisma, 'users'), readLegacyCollection(prisma, 'watchlists'), readLegacyCollection(prisma, MAPPING_COLLECTION),
  ]);
  const summary = { migratedUsers: 0, recoveredWatchlists: 0, skippedUsers: 0, needsReview: [],
    dryRun, mappedWatchlists: 0, skippedWatchlists: 0,
    resolutionManifest: { version: 1, entries: /** @type {ResolutionEntry[]} */ ([]) } };
  const listsByUser = new Map();
  for (const list of lists) {
    const userId = legacyId(list.userId);
    if (!listsByUser.has(userId)) listsByUser.set(userId, []);
    listsByUser.get(userId).push(list);
  }
  const mappingById = new Map(mappings.map(mapping => [String(mapping._id), mapping]));
  const actions = [];
  const consumed = new Set();
  const sourcesSeen = new Set();
  const userIdsSeen = new Set();
  const emailsSeen = new Set();
  const plannedMappingIds = new Set();
  const targetCache = new Map();
  const targetById = async targetId => {
    if (!targetCache.has(targetId)) {
      targetCache.set(targetId, await prisma.watchlist.findUnique({ where: { id: targetId } }));
    }
    return targetCache.get(targetId);
  };
  const reserveImport = async (source, userId) => {
    const existing = await targetById(source.stableId);
    if (existing) throw new Error('Deterministic legacy watchlist ID is already in use; existing data was preserved.');
    targetCache.set(source.stableId, { id: source.stableId, userId, ...source.data });
  };
  const addMapping = (sourceUserId, source, targetId, decision = 'map', receipt) => {
    const mapping = { _id: `${sourceUserId}:${source.sourceId}`, sourceUserId, sourceId: source.sourceId, targetId, decision };
    if (plannedMappingIds.has(mapping._id)) throw new Error('Legacy source identifiers collide in migration provenance.');
    plannedMappingIds.add(mapping._id);
    if (receipt) mapping.resolutionFingerprint = fingerprint(receipt);
    actions.push({ type: 'mapping', mapping });
  };

  for (const legacy of users) {
    const sourceUserId = legacyId(legacy._id);
    const email = legacy.email?.toLowerCase().trim();
    if (!email || !legacy.password) { summary.skippedUsers++; continue; }
    if (emailsSeen.has(email)) throw new Error('Multiple legacy accounts share the same email; ownership must be reviewed before importing.');
    emailsSeen.add(email);
    const expectedUserId = objectId(sourceUserId);
    if (userIdsSeen.has(expectedUserId)) throw new Error('Multiple legacy accounts resolve to the same user ID.');
    userIdsSeen.add(expectedUserId);
    const sourceLists = listsByUser.get(sourceUserId) || [];
    const prepared = sourceLists.map(source => {
      const sourceId = legacyId(source._id);
      const key = entryKey({ sourceUserId, sourceId });
      if (sourcesSeen.has(key)) throw new Error('Duplicate legacy watchlist source.');
      sourcesSeen.add(key);
      return { sourceId, data: watchlistData(source), stableId: objectId(sourceId) };
    });
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      if (await prisma.user.findUnique({ where: { id: expectedUserId } })) {
        throw new Error('Legacy account ID belongs to another account; existing data was preserved.');
      }
      const createdAt = legacy.createdAt == null ? undefined : new Date(legacy.createdAt.$date ?? legacy.createdAt);
      if (createdAt && !Number.isFinite(createdAt.getTime())) throw new Error('Invalid legacy account creation date.');
      user = { id: expectedUserId, email };
      actions.push({ type: 'user', data: {
        id: user.id, email, name: legacy.username ?? email.split('@')[0], password: legacy.password, createdAt,
        preferences: { create: {
          favoriteTeam: legacy.favoriteTeam ?? null, favoriteDriver: legacy.favoriteDriver ?? null,
          emailNotifications: legacy.emailNotifications ?? true, pushNotifications: legacy.pushNotifications ?? true,
          notifyRaceStart: sourceLists[0]?.notifications?.raceStart ?? true,
          notifyQualifying: sourceLists[0]?.notifications?.qualifyingStart ?? true,
          notifyPractice: sourceLists[0]?.notifications?.practiceStart ?? false,
        } },
      } });
      summary.migratedUsers++;
      if (!prepared.length) {
        const source = { stableId: objectId(`default:${sourceUserId}`), data: { name: 'My Favorites', drivers: [], teams: [], races: [] } };
        await reserveImport(source, user.id);
        actions.push({ type: 'watchlist', data: { id: source.stableId, userId: user.id, ...source.data } });
      }
    } else if (user.id !== expectedUserId) {
      summary.needsReview.push({ userId: sourceUserId, reason: 'Existing account has a different ID. Account ownership must be verified separately.' });
      continue;
    }
    const targets = await prisma.watchlist.findMany({ where: { userId: user.id } });
    const claimed = new Set();
    const pending = [];
    // Reserve recorded targets first, including intentionally deleted lists and skipped sources.
    for (const source of prepared) {
      const known = mappingById.get(`${sourceUserId}:${source.sourceId}`);
      if (!known) continue;
      if (known.sourceUserId !== sourceUserId || known.sourceId !== source.sourceId) {
        throw new Error('Invalid legacy mapping provenance; existing data was preserved.');
      }
      if (known.targetId !== null) {
        if (!OBJECT_ID.test(known.targetId ?? '')) throw new Error('Invalid mapped watchlist ID.');
        const target = await targetById(known.targetId);
        if (target && target.userId !== user.id) throw new Error('Mapped watchlist belongs to another account.');
        if (claimed.has(known.targetId)) throw new Error('Several legacy lists claim the same existing watchlist.');
        claimed.add(known.targetId);
      } else if (known.decision !== 'skip') throw new Error('Invalid skipped legacy mapping.');
      const key = entryKey({ sourceUserId, sourceId: source.sourceId });
      const replay = supplied?.get(key);
      if (replay) {
        if (known.resolutionFingerprint !== fingerprint(replay)) {
          throw new Error('A resolution cannot replace an already recorded migration decision.');
        }
        consumed.add(key);
      }
    }
    for (const source of prepared) {
      if (mappingById.has(`${sourceUserId}:${source.sourceId}`)) continue;
      const stableTarget = await targetById(source.stableId);
      if (stableTarget && stableTarget.userId !== user.id) throw new Error('Legacy watchlist ID belongs to another account.');
      const exact = targets.filter(target => !claimed.has(target.id) && signature(target) === signature(source.data));
      const match = stableTarget && !claimed.has(stableTarget.id) ? stableTarget : exact.length === 1 ? exact[0] : null;
      if (match) {
        claimed.add(match.id);
        addMapping(sourceUserId, source, match.id);
        summary.mappedWatchlists++;
      } else pending.push(source);
    }
    const candidates = targets.filter(target => !claimed.has(target.id));
    if (pending.length && candidates.length) {
      for (const source of pending) {
        const entry = reviewEntry(sourceUserId, user.id, source, candidates);
        const key = entryKey(entry);
        const resolution = supplied?.get(key);
        if (!resolution) {
          if (supplied) throw new Error('Resolution manifest must decide every ambiguous source before any writes.');
          summary.resolutionManifest.entries.push(entry);
          continue;
        }
        const { decision, targetId, ...snapshot } = resolution;
        const { decision: unusedDecision, targetId: unusedTargetId, ...expected } = entry;
        if (fingerprint(snapshot) !== fingerprint(expected)) {
          throw new Error('Resolution manifest is stale or altered; generate a fresh dry-run report before applying.');
        }
        if (decision === 'map') {
          if (!candidates.some(target => target.id === targetId) || claimed.has(targetId)) {
            throw new Error('Resolution target must be an unclaimed watchlist owned by the same account.');
          }
          claimed.add(targetId);
          addMapping(sourceUserId, source, targetId, 'map', resolution);
          summary.mappedWatchlists++;
        } else if (decision === 'import') {
          await reserveImport(source, user.id);
          actions.push({ type: 'watchlist', data: { id: source.stableId, userId: user.id, ...source.data } });
          addMapping(sourceUserId, source, source.stableId, 'import', resolution);
          summary.recoveredWatchlists++;
        } else {
          addMapping(sourceUserId, source, null, 'skip', resolution);
          summary.skippedWatchlists++;
        }
        consumed.add(key);
      }
      if (!supplied) summary.needsReview.push({ userId: sourceUserId, watchlistIds: pending.map(source => source.sourceId),
        reason: 'Choose map, import, or skip for every entry in the dry-run resolution manifest.' });
    } else {
      for (const source of pending) {
        await reserveImport(source, user.id);
        actions.push({ type: 'watchlist', data: { id: source.stableId, userId: user.id, ...source.data } });
        addMapping(sourceUserId, source, source.stableId, 'import');
        summary.recoveredWatchlists++;
      }
    }
  }
  if (supplied && consumed.size !== supplied.size) {
    throw new Error('Resolution manifest contains an unknown, unrelated, or no longer ambiguous source.');
  }
  if (!dryRun) {
    for (const action of actions) {
      if (action.type === 'user') await prisma.user.create({ data: action.data });
      else if (action.type === 'watchlist') await prisma.watchlist.create({ data: action.data });
      else await remember(prisma, action.mapping);
    }
  }
  return summary;
}
