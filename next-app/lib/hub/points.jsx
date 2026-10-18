import { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { fetchDriverStandings, fetchSeasonResults, fetchSeasonSprintResults } from "../jolpica-client";
import { startScopedRequest } from "../scoped-request";
import { buildDriverSeasonMetrics } from "../driver-season-metrics";
import { buildPointsProgressionData } from "../championship-progression";
import { Empty, SecLabel, Spinner, StatCard, apiFetch, asNum } from "./common";


export function PointsChartPage({ season, isMobile = false }) {
  const [standings, setStandings] = useState([]);
  const [races, setRaces] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setStandings([]); setRaces([]); setSprints([]);
    return startScopedRequest(() => Promise.all([
      fetchDriverStandings(season, { limit: 100, fetcher: apiFetch }),
      fetchSeasonResults(season, { limit: 600, fetcher: apiFetch }),
      fetchSeasonSprintResults(season, { limit: 100, fetcher: apiFetch }),
    ]), {
      onSuccess: ([nextStandings, nextRaces, nextSprints]) => {
        setStandings(nextStandings);
        setRaces(nextRaces);
        setSprints(nextSprints);
      },
      onSettled: () => setLoading(false),
    });
  }, [season]);

  const driverMetrics = useMemo(() => buildDriverSeasonMetrics(standings, races), [standings, races]);
  const progression = useMemo(() => buildPointsProgressionData(standings, races, 6, sprints), [standings, races, sprints]);
  const featuredMetrics = useMemo(() => {
    const ids = new Set(progression.series.map((item) => item.key));
    return driverMetrics.filter((metric) => ids.has(metric.driverId));
  }, [driverMetrics, progression.series]);
  const leader = featuredMetrics[0];
  const closestGap =
    featuredMetrics.length > 1
      ? Math.abs(asNum(featuredMetrics[0]?.currentPoints) - asNum(featuredMetrics[1]?.currentPoints))
      : 0;

  if (loading) return <Spinner />;
  if (!standings.length) return <Empty icon="📈" msg="No championship progression data available" />;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 22 }}>
        <StatCard label="Leader" value={leader?.familyName || "—"} sub={leader ? `${leader.currentPoints} pts` : undefined} accent={leader?.teamColor} />
        <StatCard label="Closest Gap" value={`${closestGap} pts`} sub={featuredMetrics.length > 1 ? `${featuredMetrics[0]?.familyName} vs ${featuredMetrics[1]?.familyName}` : "Single driver snapshot"} accent="#FFD700" />
        <StatCard label="Rounds Tracked" value={progression.data.length || 0} sub="Race and sprint points" accent="#27F4D2" />
        <StatCard label="Featured Drivers" value={progression.series.length} sub="Main chart lines" accent="#a855f7" />
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 18,
        alignItems: "start",
      }}>
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18, minWidth: 0 }}>
          <SecLabel>Round-by-round championship evolution</SecLabel>
          {progression.data.length ? (
            <div style={{ height: isMobile ? 280 : 410 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progression.data} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}>
                  <CartesianGrid stroke="#1a1a1a" />
                  <XAxis dataKey="roundLabel" stroke="#666" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#666" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #E10600", borderRadius: 8 }}
                    labelFormatter={(value, payload) => {
                      const raceName = payload?.[0]?.payload?.raceName;
                      return raceName ? `${value} · ${raceName}` : value;
                    }}
                    formatter={(value) => [`${value} pts`, "Points"]}
                  />
                  <Legend wrapperStyle={{ color: "#888", fontSize: 11, paddingTop: 10 }} />
                  {progression.series.map((driver) => (
                    <Line
                      key={driver.key}
                      type="monotone"
                      dataKey={driver.key}
                      name={driver.fullName || driver.name}
                      stroke={driver.color}
                      dot={false}
                      strokeWidth={2.4}
                      activeDot={{ r: 5, stroke: driver.color, fill: "#080808" }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty icon="🟰" msg="No completed rounds yet. Current standings will populate a progression chart once races are run." />
          )}
        </div>

      </div>
    </div>
  );
}
