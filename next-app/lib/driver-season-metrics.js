import { formatGrandPrixName as gpName, getTeamColor as col } from "./f1-display";

function asNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getFinishPosition(result) {
  const raw = result?.position;
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function isRaceFinish(status) {
  const label = String(status || "").trim();
  return label === "Finished" || /^\+\d+ Laps?$/.test(label);
}

export function isDnfResult(result) {
  const label = String(result?.status || "").trim();
  if (!label) return false;
  return !isRaceFinish(label);
}

export function getResultTone(result) {
  if (isDnfResult(result)) return "#E10600";
  const position = getFinishPosition(result);
  if (position === 1) return "#FFD700";
  if (position !== null && position <= 3) return "#27F4D2";
  if (position !== null && position <= 10) return "#64C4FF";
  return "#666";
}

export function getResultLabel(result) {
  if (isDnfResult(result)) return "DNF";
  const position = getFinishPosition(result);
  if (position !== null) return `P${position}`;
  return result?.status || "—";
}

export function buildDriverSeasonMetrics(standings = [], races = []) {
  const byId = new Map();

  const ensureMetric = (driver, team, standing) => {
    const driverId = driver?.driverId;
    if (!driverId) return null;

    if (!byId.has(driverId)) {
      byId.set(driverId, {
        driverId,
        code: driver?.code || driver?.driverId?.slice(0, 3)?.toUpperCase() || "DRV",
        number: driver?.permanentNumber || "—",
        name: `${driver?.givenName || ""} ${driver?.familyName || ""}`.trim() || driverId,
        familyName: driver?.familyName || driverId,
        wikiUrl: driver?.url || null,
        teamName: team?.name || "Unknown team",
        teamColor: col(team?.constructorId),
        standingsPosition: 999,
        currentPoints: 0,
        currentWins: 0,
        podiums: 0,
        dnfs: 0,
        top10: 0,
        races: 0,
        finishedRaces: 0,
        classifiedResults: 0,
        finishTotal: 0,
        bestFinish: null,
        totalRacePoints: 0,
        roundResults: [],
      });
    }

    const metric = byId.get(driverId);
    if (driver?.url) metric.wikiUrl = driver.url;
    if (team?.name) metric.teamName = team.name;
    if (team?.constructorId) metric.teamColor = col(team.constructorId);
    if (standing) {
      metric.standingsPosition = asNum(standing.position, metric.standingsPosition);
      metric.currentPoints = asNum(standing.points, metric.currentPoints);
      metric.currentWins = asNum(standing.wins, metric.currentWins);
    }
    return metric;
  };

  standings.forEach((standing) => {
    ensureMetric(standing.Driver, standing.Constructors?.[0], standing);
  });

  [...races]
    .sort((a, b) => asNum(a.round) - asNum(b.round))
    .forEach((race) => {
      const round = asNum(race.round);
      const raceName = gpName(race.raceName || race.name || `Round ${round}`);

      (race.Results || []).forEach((result) => {
        const metric = ensureMetric(result.Driver, result.Constructor, null);
        if (!metric) return;

        const finishPosition = getFinishPosition(result);
        metric.races += 1;
        metric.totalRacePoints += asNum(result.points);

        // Numeric classifications also exist for retirees; only status establishes a finish.
        if (isRaceFinish(result.status)) metric.finishedRaces += 1;

        if (finishPosition !== null) {
          metric.classifiedResults += 1;
          metric.finishTotal += finishPosition;
          metric.bestFinish = metric.bestFinish === null ? finishPosition : Math.min(metric.bestFinish, finishPosition);
          if (finishPosition <= 3) metric.podiums += 1;
          if (finishPosition <= 10) metric.top10 += 1;
        }

        if (isDnfResult(result)) {
          metric.dnfs += 1;
        }

        metric.roundResults.push({
          round,
          raceName,
          points: asNum(result.points),
          finishPosition,
          status: result.status || "—",
          label: getResultLabel(result),
          tone: getResultTone(result),
        });
      });
    });

  return [...byId.values()]
    .map((metric) => ({
      ...metric,
      averageFinish: metric.classifiedResults ? Number((metric.finishTotal / metric.classifiedResults).toFixed(1)) : null,
      finishRate: metric.races ? Number(((metric.finishedRaces / metric.races) * 100).toFixed(0)) : 0,
      top10Rate: metric.races ? Number(((metric.top10 / metric.races) * 100).toFixed(0)) : 0,
      lastResult: metric.roundResults[metric.roundResults.length - 1] || null,
      recentResults: metric.roundResults.slice(-5).reverse(),
    }))
    .sort((a, b) => {
      if (a.standingsPosition !== b.standingsPosition) return a.standingsPosition - b.standingsPosition;
      return b.currentPoints - a.currentPoints;
    });
}

