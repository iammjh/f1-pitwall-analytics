import { formatGrandPrixName, getTeamColor } from './f1-display';

const points = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Keep sprint results separate from GP-only driver performance metrics. */
export function buildPointsProgressionData(standings = [], races = [], maxDrivers = 6, sprints = []) {
  const featured = standings.slice(0, maxDrivers).map((standing, index) => ({
    key: standing.Driver?.driverId || `driver-${index}`,
    name: standing.Driver?.familyName || `Driver ${index + 1}`,
    fullName: `${standing.Driver?.givenName || ''} ${standing.Driver?.familyName || ''}`.trim(),
    color: getTeamColor(standing.Constructors?.[0]?.constructorId),
    currentPoints: points(standing.points),
    wins: points(standing.wins),
  }));
  if (!featured.length) return { series: [], data: [] };

  const rounds = new Map();
  for (const race of races) {
    rounds.set(String(race.round), { ...race, Results: race.Results || [], SprintResults: race.SprintResults || [] });
  }
  for (const sprint of sprints) {
    const key = String(sprint.round);
    const race = rounds.get(key);
    rounds.set(key, { ...sprint, ...race, SprintResults: sprint.SprintResults || [] });
  }

  const totals = Object.fromEntries(featured.map((driver) => [driver.key, 0]));
  const data = [...rounds.values()]
    .filter((race) => race.Results?.length || race.SprintResults?.length)
    .sort((a, b) => points(a.round) - points(b.round))
    .map((race) => {
      for (const result of [...(race.Results || []), ...(race.SprintResults || [])]) {
        const driverId = result.Driver?.driverId;
        if (driverId && Object.hasOwn(totals, driverId)) totals[driverId] += points(result.points);
      }
      return {
        roundLabel: `R${race.round}${race.Results?.length ? '' : ' Sprint'}`,
        round: points(race.round),
        raceName: formatGrandPrixName(race.raceName || race.name || `Round ${race.round}`),
        ...totals,
      };
    });
  return { series: featured, data };
}

/** Prefer valid shared/current selections, with distinct season-local defaults. */
export function resolveHeadToHeadDrivers(driverIds, preferredLeft = '', preferredRight = '') {
  const ids = [...new Set(driverIds.filter(Boolean))];
  const left = ids.includes(preferredLeft) ? preferredLeft : ids[0] || '';
  const right = ids.includes(preferredRight) && preferredRight !== left
    ? preferredRight
    : ids.find((id) => id !== left) || '';
  return { left, right };
}
