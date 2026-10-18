import { useState, useEffect, useMemo } from "react";
import { fetchDriverStandings, fetchSeasonResults } from "../jolpica-client";
import { buildDriverSeasonMetrics } from "../driver-season-metrics";
import { startScopedRequest } from "../scoped-request";
import { resolveHeadToHeadDrivers } from "../championship-progression";
import { DriverPhoto, Empty, SecLabel, Spinner, StatCard, apiFetch, buildDriverHeadshotLookup, buildHeadToHeadDuels, getComparisonWinner, resolveDriverHeadshotUrl, useShareableH2H } from "./common";


export function HeadToHeadPage({ season, isMobile }) {
  const [d1, setD1] = useState("");
  const [d2, setD2] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [races, setRaces] = useState([]);
  const [headshots, setHeadshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const { getParams, setParams } = useShareableH2H();

  useEffect(() => {
    setLoading(true);
    setDrivers([]); setRaces([]); setHeadshots([]);
    return startScopedRequest(() => Promise.all([
      fetchDriverStandings(season, { limit: 100, fetcher: apiFetch }),
      fetchSeasonResults(season, { limit: 600, fetcher: apiFetch }),
      apiFetch(`/api/drivers/headshots?season=${encodeURIComponent(season)}`, 300000),
    ]), {
      onSuccess: ([nextDrivers, nextRaces, headshotPayload]) => {
        setDrivers(nextDrivers);
        setRaces(nextRaces);
        setHeadshots(Array.isArray(headshotPayload?.drivers) ? headshotPayload.drivers : []);
        const params = getParams();
        const pair = resolveHeadToHeadDrivers(nextDrivers.map(driver => driver.Driver.driverId), params.d1, params.d2);
        setD1(pair.left);
        setD2(pair.right);
      },
      onSettled: () => setLoading(false),
    });
  }, [season, getParams]);

  useEffect(() => {
    if (!d1 && !d2) return;
    setParams(d1 || "", d2 || "");
  }, [d1, d2, setParams]);

  const driverMetrics = useMemo(() => buildDriverSeasonMetrics(drivers, races), [drivers, races]);
  const metricsById = useMemo(() => new Map(driverMetrics.map((driver) => [driver.driverId, driver])), [driverMetrics]);
  const leftMetric = metricsById.get(d1);
  const rightMetric = metricsById.get(d2);
  const duel = useMemo(() => buildHeadToHeadDuels(leftMetric, rightMetric), [leftMetric, rightMetric]);
  const headshotLookup = useMemo(() => buildDriverHeadshotLookup(headshots), [headshots]);

  if (loading) return <Spinner />;
  if (!driverMetrics.length) return <Empty icon="⚔️" msg="No head-to-head comparison data available" />;

  const comparisonRows = leftMetric && rightMetric ? [
    { label: "Championship Rank", left: leftMetric.standingsPosition, right: rightMetric.standingsPosition, direction: "lower" },
    { label: "Points", left: leftMetric.currentPoints, right: rightMetric.currentPoints, direction: "higher" },
    { label: "Wins", left: leftMetric.currentWins, right: rightMetric.currentWins, direction: "higher" },
    { label: "Podiums", left: leftMetric.podiums, right: rightMetric.podiums, direction: "higher" },
    { label: "Average Finish", left: leftMetric.averageFinish, right: rightMetric.averageFinish, direction: "lower" },
    { label: "Best Finish", left: leftMetric.bestFinish, right: rightMetric.bestFinish, direction: "lower" },
    { label: "Top 10 Rate", left: leftMetric.top10Rate, right: rightMetric.top10Rate, direction: "higher", suffix: "%" },
    { label: "DNFs", left: leftMetric.dnfs, right: rightMetric.dnfs, direction: "lower" },
  ] : [];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Driver 1</label>
          <select value={d1} onChange={e => {
            const pair = resolveHeadToHeadDrivers(driverMetrics.map(driver => driver.driverId), e.target.value, d2);
            setD1(pair.left); setD2(pair.right);
          }} style={{ width: "100%", padding: 10, background: "#111", border: "1px solid #1e1e1e", color: "#fff", borderRadius: 6, fontSize: 13 }}>
            <option value="">Select driver...</option>
            {driverMetrics.map(driver => <option key={driver.driverId} value={driver.driverId}>{driver.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, fontWeight: 600 }}>Driver 2</label>
          <select value={d2} onChange={e => {
            const pair = resolveHeadToHeadDrivers(driverMetrics.map(driver => driver.driverId), d1, e.target.value);
            setD1(pair.left); setD2(pair.right);
          }} style={{ width: "100%", padding: 10, background: "#111", border: "1px solid #1e1e1e", color: "#fff", borderRadius: 6, fontSize: 13 }}>
            <option value="">Select driver...</option>
            {driverMetrics.map(driver => <option key={driver.driverId} value={driver.driverId}>{driver.name}</option>)}
          </select>
        </div>
      </div>

      {(leftMetric && rightMetric) ? (
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            {[leftMetric, rightMetric].map((driver) => {
              const headshotUrl = resolveDriverHeadshotUrl({
                code: driver.code,
                permanentNumber: driver.number,
                familyName: driver.familyName,
                givenName: driver.name.split(" ")[0]
              }, headshotLookup);

              return (
                <div key={driver.driverId} style={{ background: "#0a0a0a", border: `1px solid ${driver.teamColor}44`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ height: 4, background: `linear-gradient(90deg,${driver.teamColor},${driver.teamColor}44,transparent)` }} />
                  <div style={{ padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                      <DriverPhoto firstName={driver.name.split(" ")[0] || driver.familyName} lastName={driver.familyName} wikiUrl={driver.wikiUrl} headshotUrl={headshotUrl} teamColor={driver.teamColor}
                        style={{ width: 68, height: 68, borderRadius: 10, display: "block", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: driver.teamColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{driver.teamName}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{driver.name}</div>
                        <div style={{ fontSize: 11, color: "#444", fontFamily: "monospace", marginTop: 3 }}>#{driver.number} · {driver.code}</div>
                      </div>
                      <div style={{ textAlign: "center", flexShrink: 0 }}>
                        <div style={{ fontSize: 34, fontWeight: 900, color: driver.teamColor, lineHeight: 1 }}>P{driver.standingsPosition}</div>
                        <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>rank</div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
                      {[
                        ["Points", driver.currentPoints, "#FFD700"],
                        ["Wins", driver.currentWins, "#E10600"],
                        ["Podiums", driver.podiums, "#27F4D2"],
                        ["Avg", driver.averageFinish ?? "—", "#a855f7"],
                      ].map(([label, val, accent]) => (
                        <div key={label} style={{ background: "#111", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: accent, fontFamily: "monospace" }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <StatCard
              label="Points Gap"
              value={`${Math.abs(leftMetric.currentPoints - rightMetric.currentPoints)} pts`}
              sub={leftMetric.currentPoints === rightMetric.currentPoints ? "Even on points" : `${leftMetric.currentPoints > rightMetric.currentPoints ? leftMetric.familyName : rightMetric.familyName} leads`}
              accent="#FFD700"
            />
            <StatCard
              label="Race Duel"
              value={`${duel.leftWins}-${duel.rightWins}`}
              sub={duel.commonRounds ? `${duel.commonRounds} shared race classifications` : "No shared classified races"}
              accent="#27F4D2"
            />
            <StatCard
              label="Podium Edge"
              value={Math.abs(leftMetric.podiums - rightMetric.podiums)}
              sub={leftMetric.podiums === rightMetric.podiums ? "Level on podiums" : `${leftMetric.podiums > rightMetric.podiums ? leftMetric.familyName : rightMetric.familyName} ahead`}
              accent="#a855f7"
            />
            <StatCard
              label="Reliability Edge"
              value={`${Math.min(leftMetric.dnfs, rightMetric.dnfs)} DNFs`}
              sub={leftMetric.dnfs === rightMetric.dnfs ? "Equal reliability" : `${leftMetric.dnfs < rightMetric.dnfs ? leftMetric.familyName : rightMetric.familyName} more reliable`}
              accent="#E10600"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1.1fr) minmax(0,0.95fr)", gap: 18, alignItems: "start" }}>
            <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18 }}>
              <SecLabel>Metric board</SecLabel>
              <div style={{ display: "grid", gap: 10 }}>
                {comparisonRows.map((row) => {
                  const winner = getComparisonWinner(row.left, row.right, row.direction);
                  const formatValue = (value) => value === null || value === undefined ? "—" : `${value}${row.suffix || ""}`;
                  return (
                    <div key={row.label} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12, background: "#111", border: "1px solid #1c1c1c", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ textAlign: "left", fontSize: 18, fontWeight: 800, color: winner === "left" ? leftMetric.teamColor : "#bbb", fontFamily: "monospace" }}>{formatValue(row.left)}</div>
                      <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 700 }}>{row.label}</div>
                      <div style={{ textAlign: "right", fontSize: 18, fontWeight: 800, color: winner === "right" ? rightMetric.teamColor : "#bbb", fontFamily: "monospace" }}>{formatValue(row.right)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gap: 18 }}>
              <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18 }}>
                <SecLabel>Recent form</SecLabel>
                {[leftMetric, rightMetric].map((driver) => (
                  <div key={driver.driverId} style={{ marginBottom: driver.driverId === rightMetric.driverId ? 0 : 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{driver.name}</div>
                      <div style={{ fontSize: 11, color: driver.teamColor }}>{driver.teamName}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {driver.recentResults.length ? driver.recentResults.map((result) => (
                        <div key={`${driver.driverId}-${result.round}`} style={{ padding: "8px 10px", borderRadius: 8, background: `${result.tone}16`, border: `1px solid ${result.tone}33`, minWidth: 68 }}>
                          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>R{result.round}</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: result.tone, fontFamily: "monospace" }}>{result.label}</div>
                        </div>
                      )) : <div style={{ fontSize: 12, color: "#555" }}>No recent race form available.</div>}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18 }}>
                <SecLabel>Race-by-race duel</SecLabel>
                {duel.recent.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {duel.recent.map((entry) => (
                      <div key={entry.round} style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{entry.raceName}</div>
                          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.2 }}>Round {entry.round}</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
                          <div style={{ textAlign: "left", fontSize: 15, fontWeight: 800, color: entry.winner === "left" ? leftMetric.teamColor : "#ccc", fontFamily: "monospace" }}>{entry.left.label}</div>
                          <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.3 }}>{entry.winner === "tie" ? "Even" : `${entry.winner === "left" ? leftMetric.familyName : rightMetric.familyName} edge`}</div>
                          <div style={{ textAlign: "right", fontSize: 15, fontWeight: 800, color: entry.winner === "right" ? rightMetric.teamColor : "#ccc", fontFamily: "monospace" }}>{entry.right.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty icon="🏁" msg="No shared race results yet for this comparison." />
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#333", fontSize: 14 }}>
          Select both drivers above to unlock the full comparison board
        </div>
      )}
    </div>
  );
}
