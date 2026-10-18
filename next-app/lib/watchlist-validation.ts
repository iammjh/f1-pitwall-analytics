export const MAX_WATCHLIST_NAME_LENGTH = 100;
export const MAX_WATCHLIST_DESCRIPTION_LENGTH = 500;

export function validateWatchlistName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, error: 'Watchlist name is required.' };
  }
  if (raw.length > MAX_WATCHLIST_NAME_LENGTH) {
    return {
      ok: false,
      error: `Watchlist name must be ${MAX_WATCHLIST_NAME_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true, value: raw.trim() };
}

export function validateWatchlistDescription(
  raw: unknown,
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (raw === undefined) {
    return { ok: true, value: undefined };
  }
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Watchlist description must be a string.' };
  }
  if (raw.length > MAX_WATCHLIST_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `Watchlist description must be ${MAX_WATCHLIST_DESCRIPTION_LENGTH} characters or fewer.`,
    };
  }
  const trimmed = raw.trim();
  // Prisma ignores undefined on update; null explicitly clears its optional field.
  return { ok: true, value: trimmed || null };
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

type WatchlistInput = {
  name?: string;
  description?: string | null;
  drivers?: string[];
  teams?: string[];
  races?: string[];
  isPublic?: boolean;
};

function validateWatchlistItems(raw: unknown, field: string): ValidationResult<string[]> {
  let items = raw;
  // Accept older clients' JSON-array strings, but apply the same validation
  // after decoding. Invalid input must never turn into an empty stored array.
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      return { ok: false, error: `${field} must be an array of non-empty strings.` };
    }
  }
  if (!Array.isArray(items) || items.some(item => typeof item !== 'string' || !item.trim())) {
    return { ok: false, error: `${field} must be an array of non-empty strings.` };
  }
  return { ok: true, value: items.map(item => item.trim()) };
}

/** Shared POST/PUT validation. Omitted update fields remain absent from Prisma data. */
export function validateWatchlistInput(
  raw: unknown,
  mode: 'create' | 'update',
): ValidationResult<WatchlistInput> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const body = raw as Record<string, unknown>;
  const data: WatchlistInput = {};

  if (mode === 'create' || body.name !== undefined) {
    const result = validateWatchlistName(body.name === undefined ? 'My Watchlist' : body.name);
    if (!result.ok) return result;
    data.name = result.value;
  }

  if (body.description !== undefined) {
    const result = validateWatchlistDescription(body.description);
    if (!result.ok) return result;
    data.description = result.value;
  }

  for (const field of ['drivers', 'teams', 'races'] as const) {
    if (body[field] === undefined) {
      if (mode === 'create') data[field] = [];
      continue;
    }
    const result = validateWatchlistItems(body[field], field);
    if (!result.ok) return result;
    data[field] = result.value;
  }

  if (body.isPublic !== undefined) {
    if (typeof body.isPublic !== 'boolean') {
      return { ok: false, error: 'isPublic must be a boolean.' };
    }
    data.isPublic = body.isPublic;
  } else if (mode === 'create') {
    data.isPublic = false;
  }

  return { ok: true, value: data };
}
