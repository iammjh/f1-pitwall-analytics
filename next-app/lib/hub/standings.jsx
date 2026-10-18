import { useState, useEffect } from "react";
import { fetchConstructorStandings, fetchDriverStandings, fetchSeasonResults } from "../jolpica-client";
import { getTeamColor as col } from "../f1-display";
import { startScopedRequest } from "../scoped-request";
import { Empty, PosBadge, PtsBar, Spinner, StatCard, TH, TRow, Tabs, apiFetch, buildLatestRaceWinnerContext, mono } from "./common";


export function DriverStandings({ season }) {
  const [data, setData] = useState([]);
  const [races, setRaces] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setData([]);
    setRaces([]);
    return startScopedRequest(() => Promise.all([
      fetchDriverStandings(season, { limit: 100, fetcher: apiFetch }),
      fetchSeasonResults(season, { limit: 600, fetcher: apiFetch }),
    ]), {
      onSuccess: ([standings, seasonRaces]) => {
        setData(standings);
        setRaces(seasonRaces);
      },
      onSettled: () => setLoading(false),
    });
  }, [season]);
  if (loading) return <Spinner />;
  if (!data.length) return <Empty />;
  const max = Number(data[0]?.points) || 1;
  const leaderPts = Number(data[0]?.points) || 0;
  const leader = data[0];
  const tc = col(leader?.Constructors?.[0]?.constructorId);
  const latestRaceContext = buildLatestRaceWinnerContext(races);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 24 }}>
        <StatCard label="Leader" value={leader?.Driver?.familyName} sub={leader?.Constructors?.[0]?.name} accent={tc} delay={0} />
        <StatCard label="Points" value={leader?.points} sub="championship pts" accent="#FFD700" delay={60} />
        <StatCard label="Season Wins" value={leader?.wins} sub="race victories so far" accent="#E10600" delay={120} />
        <StatCard label="Latest GP Winner" value={latestRaceContext?.driverFamilyName || "—"} sub={latestRaceContext?.raceName || "No completed race yet"} accent={latestRaceContext?.teamColor} delay={180} />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
          <thead><tr style={{ borderBottom: "1px solid #E10600" }}>
            <TH>Pos</TH><TH>Driver</TH><TH>Team</TH><TH right>Wins</TH><TH right>Gap</TH><TH>Points</TH>
          </tr></thead>
          <tbody>
            {data.map(d => {
              const drv = d.Driver, team = d.Constructors?.[0], tc = col(team?.constructorId);
              const gap = leaderPts - Number(d.points);
              return (
                <TRow key={drv.driverId}>
                  <td style={{ padding: "11px 12px" }}><PosBadge pos={d.position} /></td>
                  <td style={{ padding: "11px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 3, height: 28, borderRadius: 2, background: tc, flexShrink: 0 }} />
                      <div>
                        <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{drv.givenName} <span style={{ color: "#aaa" }}>{drv.familyName}</span></div>
                        <div style={{ color: "#444", fontSize: 11, ...mono }}>#{drv.permanentNumber}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "11px 12px", color: tc, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>{team?.name || "—"}</td>
                  <td style={{ padding: "11px 12px", textAlign: "right", ...mono, color: "#fff" }}>{d.wins}</td>
                  <td style={{ padding: "11px 12px", textAlign: "right", ...mono, fontSize: 12, color: gap === 0 ? "#FFD700" : "#666" }}>
                    {gap === 0 ? "—" : `-${gap}`}
                  </td>
                  <td style={{ padding: "11px 12px", minWidth: 130 }}><PtsBar points={Number(d.points)} max={max} /></td>
                </TRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export function ConstructorStandings({ season }) {
  const [data, setData] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setData([]);
    return startScopedRequest(() => fetchConstructorStandings(season, { limit: 15, fetcher: apiFetch }), {
      onSuccess: setData,
      onSettled: () => setLoading(false),
    });
  }, [season]);
  if (loading) return <Spinner />;
  if (!data.length) return <Empty />;
  const max = Number(data[0]?.points) || 1;
  const leaderPts = Number(data[0]?.points) || 0;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 400 }}>
        <thead><tr style={{ borderBottom: "1px solid #E10600" }}>
          <TH>Pos</TH><TH>Constructor</TH><TH right>Wins</TH><TH right>Gap</TH><TH>Points</TH>
        </tr></thead>
        <tbody>
          {data.map(c => {
            const team = c.Constructor, tc = col(team?.constructorId);
            const gap = leaderPts - Number(c.points);
            return (
              <TRow key={team.constructorId}>
                <td style={{ padding: "11px 12px" }}><PosBadge pos={c.position} /></td>
                <td style={{ padding: "11px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 14, height: 14, borderRadius: "50%", background: tc, flexShrink: 0 }} />
                    <span style={{ color: "#fff", fontWeight: 600 }}>{team.name}</span>
                  </div>
                </td>
                <td style={{ padding: "11px 12px", textAlign: "right", ...mono, color: "#fff" }}>{c.wins}</td>
                <td style={{ padding: "11px 12px", textAlign: "right", ...mono, fontSize: 12, color: gap === 0 ? "#FFD700" : "#666" }}>{gap === 0 ? "—" : `-${gap}`}</td>
                <td style={{ padding: "11px 12px", minWidth: 130 }}><PtsBar points={Number(c.points)} max={max} color={tc} /></td>
              </TRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


export function StandingsPage({ season }) {
  const [tab, setTab] = useState("drivers");
  return (
    <div>
      <Tabs tabs={[["drivers", "Driver Championship"], ["constructors", "Constructor Championship"]]} active={tab} onSelect={setTab} />
      {tab === "drivers" ? <DriverStandings season={season} /> : <ConstructorStandings season={season} />}
    </div>
  );
}


