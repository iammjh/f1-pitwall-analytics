import { useState, useEffect, useMemo } from "react";
import { fetchConstructorStandings, fetchDriverStandings, fetchSeasonResults } from "../jolpica-client";
import { buildDriverSeasonMetrics } from "../driver-season-metrics";
import { startScopedRequest } from "../scoped-request";
import { Empty, PosBadge, SecLabel, Spinner, StatCard, TH, TRow, apiFetch, buildConstructorSeasonMetrics, mono } from "./common";


export function SeasonRecordsPage({ season, isMobile = false }) {
  const [drivers, setDrivers] = useState([]);
  const [constructors, setConstructors] = useState([]);
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setDrivers([]); setConstructors([]); setRaces([]);
    return startScopedRequest(() => Promise.all([
      fetchDriverStandings(season, { limit: 100, fetcher: apiFetch }),
      fetchConstructorStandings(season, { limit: 15, fetcher: apiFetch }),
      fetchSeasonResults(season, { limit: 600, fetcher: apiFetch }),
    ]), { onSuccess: ([nextDrivers, nextConstructors, nextRaces]) => {
      setDrivers(nextDrivers);
      setConstructors(nextConstructors);
      setRaces(nextRaces);
    }, onSettled: () => setLoading(false) });
  }, [season]);

  const driverMetrics = useMemo(() => buildDriverSeasonMetrics(drivers, races), [drivers, races]);
  const constructorMetrics = useMemo(() => buildConstructorSeasonMetrics(constructors, races), [constructors, races]);
  const uniqueWinners = new Set(races.map((race) => race.Results?.[0]?.Driver?.driverId).filter(Boolean)).size;
  const totalDnfs = driverMetrics.reduce((sum, driver) => sum + driver.dnfs, 0);
  const mostConsistent = [...driverMetrics]
    .filter((driver) => driver.finishedRaces >= 3)
    .sort((a, b) => (a.averageFinish ?? 999) - (b.averageFinish ?? 999))[0];
  const mostPodiums = [...driverMetrics].sort((a, b) => b.podiums - a.podiums)[0];
  const constructorLeader = constructorMetrics[0];

  if (loading) return <Spinner />;
  if (!driverMetrics.length) return <Empty icon="🥇" msg="No season records available for this year" />;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 22 }}>
        <StatCard label="Completed Rounds" value={races.length || 0} sub="Results processed" accent="#27F4D2" />
        <StatCard label="Unique Winners" value={uniqueWinners || "—"} sub="Different race winners" accent="#E10600" />
        <StatCard label="Most Podiums" value={mostPodiums?.familyName || "—"} sub={mostPodiums ? `${mostPodiums.podiums} podiums` : undefined} accent={mostPodiums?.teamColor} />
        <StatCard label="Most Consistent" value={mostConsistent?.familyName || "—"} sub={mostConsistent?.averageFinish ? `Avg finish ${mostConsistent.averageFinish}` : "No benchmark yet"} accent="#a855f7" />
        <StatCard label="Constructor Leader" value={constructorLeader?.name || "—"} sub={constructorLeader ? `${constructorLeader.currentPoints} pts` : undefined} accent={constructorLeader?.color} />
        <StatCard label="Total DNFs" value={totalDnfs} sub="Across tracked drivers" accent="#FFD700" />
      </div>

      <div style={{
        display: "grid",
        // Two columns only when each side has room for the leader tables; otherwise stack (e.g. iPad widths).
        gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
        gap: 18,
        alignItems: "start",
      }}>
        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18 }}>
            <SecLabel>Driver leaders</SecLabel>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #E10600" }}>
                    <TH>Pos</TH><TH>Driver</TH><TH>Team</TH><TH right>Pts</TH><TH right>Wins</TH><TH right>Podiums</TH>
                  </tr>
                </thead>
                <tbody>
                  {driverMetrics.slice(0, 6).map((driver) => (
                    <TRow key={driver.driverId}>
                      <td style={{ padding: "10px 12px" }}><PosBadge pos={driver.standingsPosition} /></td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "#fff" }}>{driver.name}</td>
                      <td style={{ padding: "10px 12px", color: driver.teamColor }}>{driver.teamName}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", ...mono, fontWeight: 700, color: "#FFD700" }}>{driver.currentPoints}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", ...mono, color: "#E10600" }}>{driver.currentWins}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", ...mono, color: "#27F4D2" }}>{driver.podiums}</td>
                    </TRow>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18 }}>
            <SecLabel>Consistency and attrition</SecLabel>
            <div style={{ display: "grid", gap: 10 }}>
              {[...driverMetrics]
                .filter((driver) => driver.races > 0)
                .sort((a, b) => {
                  if ((a.averageFinish ?? 999) !== (b.averageFinish ?? 999)) {
                    return (a.averageFinish ?? 999) - (b.averageFinish ?? 999);
                  }
                  return a.dnfs - b.dnfs;
                })
                .slice(0, 5)
                .map((driver) => (
                  <div key={driver.driverId} style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 4, height: 24, borderRadius: 999, background: driver.teamColor }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{driver.name}</div>
                          <div style={{ fontSize: 11, color: "#555" }}>{driver.teamName}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#a855f7", ...mono }}>{driver.averageFinish ?? "—"}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
                      {[
                        ["Finish Rate", `${driver.finishRate}%`, "#27F4D2"],
                        ["Top 10 Rate", `${driver.top10Rate}%`, "#64C4FF"],
                        ["DNFs", driver.dnfs, driver.dnfs ? "#E10600" : "#FFD700"],
                      ].map(([label, value, accent]) => (
                        <div key={label} style={{ background: "#0d0d0d", borderRadius: 8, padding: "8px 9px" }}>
                          <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: accent, ...mono }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
          <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18 }}>
            <SecLabel>Constructor leaderboard</SecLabel>
            <div style={{ display: "grid", gap: 10 }}>
              {constructorMetrics.slice(0, 5).map((team) => (
                <div key={team.constructorId} style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <PosBadge pos={team.standingsPosition} />
                      <div style={{ width: 4, height: 24, borderRadius: 999, background: team.color }} />
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{team.name}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#FFD700", ...mono }}>{team.currentPoints}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
                    {[
                      ["Wins", team.currentWins, "#E10600"],
                      ["Podiums", team.podiums, "#27F4D2"],
                      ["Avg Finish", team.averageFinish ?? "—", "#64C4FF"],
                    ].map(([label, value, accent]) => (
                      <div key={label} style={{ background: "#0d0d0d", borderRadius: 8, padding: "8px 9px" }}>
                        <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: accent, ...mono }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18 }}>
            <SecLabel>Season highlights</SecLabel>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                {
                  label: "Best one-lap to flag consistency",
                  driver: mostConsistent?.name || "—",
                  value: mostConsistent?.averageFinish ? `Avg finish ${mostConsistent.averageFinish}` : "No consistent finisher yet",
                  accent: "#a855f7",
                },
                {
                  label: "Most podium pressure",
                  driver: mostPodiums?.name || "—",
                  value: mostPodiums ? `${mostPodiums.podiums} podiums across ${mostPodiums.races} starts` : "No podium trend yet",
                  accent: "#27F4D2",
                },
                {
                  label: "Toughest reliability story",
                  driver: [...driverMetrics].sort((a, b) => b.dnfs - a.dnfs)[0]?.name || "—",
                  value: `${[...driverMetrics].sort((a, b) => b.dnfs - a.dnfs)[0]?.dnfs || 0} DNFs`,
                  accent: "#E10600",
                },
              ].map((item) => (
                <div key={item.label} style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.3, marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: item.accent, marginBottom: 4 }}>{item.driver}</div>
                  <div style={{ fontSize: 12, color: "#777" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
