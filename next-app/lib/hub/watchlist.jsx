import { useState, useEffect, useMemo } from "react";
import { getConstructorProfileMeta } from "../constructor-profile-data";
import { fetchSeasonResults, fetchSeasonStandingsBundle } from "../jolpica-client";
import { getTeamColor as col } from "../f1-display";
import { ConstructorLogo, DriverPhoto, Empty, PosBadge, SecLabel, Spinner, StarBtn, StatCard, apiFetch, asNum, buildDriverHeadshotLookup, buildLatestRaceWinnerContext, mono, resolveDriverHeadshotUrl } from "./common";


export function WatchlistPage({ season, watchlist, onToggle, trackedCount, watchlistReady, watchlistDisabled = false }) {
  const [drivers, setDrivers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [races, setRaces] = useState([]);
  const [headshots, setHeadshots] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setDrivers([]); setTeams([]); setRaces([]); setHeadshots([]);
    Promise.all([
      fetchSeasonStandingsBundle(season, {
        driverLimit: 100,
        constructorLimit: 15,
        fetcher: apiFetch,
      }),
      fetchSeasonResults(season, { limit: 600, fetcher: apiFetch }),
      apiFetch(`/api/drivers/headshots?season=${encodeURIComponent(season)}`, 300000),
    ])
      .then(([standingsBundle, seasonRaces, headshotPayload]) => {
        if (!active) return;
        setDrivers(standingsBundle.drivers || []);
        setTeams(standingsBundle.constructors || []);
        setRaces(seasonRaces || []);
        setHeadshots(Array.isArray(headshotPayload?.drivers) ? headshotPayload.drivers : []);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [season]);

  const watchedDrivers = useMemo(
    () => drivers.filter(d => watchlist.drivers.has(d.Driver.driverId)),
    [drivers, watchlist]
  );
  const watchedTeams = useMemo(
    () => teams.filter(t => watchlist.teams.has(t.Constructor?.constructorId)),
    [teams, watchlist]
  );
  const latestRaceContext = useMemo(() => buildLatestRaceWinnerContext(races), [races]);
  const headshotLookup = useMemo(() => buildDriverHeadshotLookup(headshots), [headshots]);
  const totalDriverPoints = watchedDrivers.reduce((sum, entry) => sum + asNum(entry.points), 0);
  const totalConstructorPoints = watchedTeams.reduce((sum, entry) => sum + asNum(entry.points), 0);
  const totalWins = watchedDrivers.reduce((sum, entry) => sum + asNum(entry.wins), 0)
    + watchedTeams.reduce((sum, entry) => sum + asNum(entry.wins), 0);
  const topDriver = watchedDrivers[0] || null;
  const topTeam = watchedTeams[0] || null;
  const latestWatchedDriver = latestRaceContext
    ? watchedDrivers.find((entry) => entry.Driver?.driverId === latestRaceContext.driverId) || null
    : null;
  const latestWatchedTeam = latestRaceContext
    ? watchedTeams.find((entry) => entry.Constructor?.name === latestRaceContext.teamName) || null
    : null;

  if (loading || !watchlistReady) return <Spinner />;
  if (!watchedDrivers.length && !watchedTeams.length) {
    return <Empty icon="⭐" msg="No favorites yet. Star drivers or constructors to track them here!" />;
  }

  return (
    <div>


      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Tracked Drivers" value={watchedDrivers.length} sub="Favorite drivers" accent="#27F4D2" />
        <StatCard label="Tracked Constructors" value={watchedTeams.length} sub="Favorite teams" accent="#64C4FF" />
        <StatCard label="Driver Points" value={totalDriverPoints} sub="Combined favorite drivers" accent="#FFD700" />
        <StatCard label="Constructor Points" value={totalConstructorPoints} sub="Combined favorite teams" accent="#a855f7" />
        <StatCard label="Top Driver" value={topDriver?.Driver?.familyName || "—"} sub={topDriver ? `P${topDriver.position} · ${topDriver.points} pts` : "No driver tracked"} accent={col(topDriver?.Constructors?.[0]?.constructorId)} />
        <StatCard label="Top Team" value={topTeam?.Constructor?.name || "—"} sub={topTeam ? `P${topTeam.position} · ${topTeam.points} pts` : "No constructor tracked"} accent={col(topTeam?.Constructor?.constructorId)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 24 }}>
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 16 }}>
          <SecLabel>Latest GP Watchlist Hit</SecLabel>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
            {latestWatchedDriver
              ? `${latestWatchedDriver.Driver.familyName} won`
              : latestWatchedTeam
                ? `${latestWatchedTeam.Constructor.name} won`
                : "No tracked winner"}
          </div>
          <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5 }}>
            {latestRaceContext
              ? latestWatchedDriver || latestWatchedTeam
                ? `${latestRaceContext.raceName} was won by one of your favorites.`
                : `${latestRaceContext.raceName} was won by ${latestRaceContext.driverName}.`
              : "No completed grand prix yet for this season."}
          </div>
        </div>

        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 16 }}>
          <SecLabel>Driver Spotlight</SecLabel>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
            {topDriver ? `${topDriver.Driver.givenName} ${topDriver.Driver.familyName}` : "No driver tracked"}
          </div>
          <div style={{ fontSize: 12, color: topDriver ? col(topDriver.Constructors?.[0]?.constructorId) : "#777", fontWeight: 700, marginBottom: 10 }}>
            {topDriver?.Constructors?.[0]?.name || "Track a driver to surface insights"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            {[
              ["Pos", topDriver ? `P${topDriver.position}` : "—", "#fff"],
              ["Points", topDriver?.points || "—", "#FFD700"],
              ["Wins", topDriver?.wins || "—", "#E10600"],
            ].map(([label, value, accent]) => (
              <div key={label} style={{ background: "#111", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: accent, ...mono }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 16 }}>
          <SecLabel>Constructor Spotlight</SecLabel>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
            {topTeam?.Constructor?.name || "No constructor tracked"}
          </div>
          <div style={{ fontSize: 12, color: "#777", lineHeight: 1.5, marginBottom: 10 }}>
            {topTeam
              ? `${getConstructorProfileMeta(topTeam.Constructor?.constructorId)?.principal || "Team principal unavailable"} · ${topTeam.wins} win${asNum(topTeam.wins) === 1 ? "" : "s"}`
              : "Track a constructor to see season snapshot highlights."}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            {[
              ["Pos", topTeam ? `P${topTeam.position}` : "—", "#fff"],
              ["Points", topTeam?.points || "—", "#FFD700"],
              ["Combined Wins", totalWins, "#27F4D2"],
            ].map(([label, value, accent]) => (
              <div key={label} style={{ background: "#111", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: accent, ...mono }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!!watchedDrivers.length && (
        <div style={{ marginBottom: 24 }}>
          <SecLabel>Tracked Drivers</SecLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
            {watchedDrivers.map((entry) => {
              const drv = entry.Driver;
              const team = entry.Constructors?.[0];
              const teamCol = col(team?.constructorId);
              const headshotUrl = resolveDriverHeadshotUrl(drv, headshotLookup);
              const isLatestWinner = latestRaceContext?.driverId === drv.driverId;
              return (
                <div key={drv.driverId} style={{ background: "#0f0f0f", border: `1px solid ${teamCol}33`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${teamCol}, ${teamCol}44, transparent)` }} />
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <PosBadge pos={entry.position} />
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{drv.givenName} {drv.familyName}</div>
                          <div style={{ fontSize: 12, color: teamCol, fontWeight: 700, marginTop: 4 }}>{team?.name || "Unknown team"}</div>
                        </div>
                      </div>
                      <StarBtn id={drv.driverId} watchlist={watchlist} onToggle={onToggle} itemType="driver" disabled={watchlistDisabled} />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: 12, alignItems: "end", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>{drv.nationality || "Unknown nationality"} · #{drv.permanentNumber || "—"}</div>
                        {isLatestWinner ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 999, background: "#FFD70014", border: "1px solid #FFD70033", color: "#FFD700", fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>
                            Latest GP winner · {latestRaceContext.raceName}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: "#555" }}>{asNum(entry.wins)} season win{asNum(entry.wins) === 1 ? "" : "s"}</div>
                        )}
                      </div>
                      <DriverPhoto
                        firstName={drv.givenName}
                        lastName={drv.familyName}
                        wikiUrl={drv.url}
                        headshotUrl={headshotUrl}
                        headshotVariant="6col"
                        teamColor={teamCol}
                        style={{ width: 96, height: 116, display: "block", objectFit: "contain", objectPosition: "center bottom", background: "transparent", border: "none", filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.38))" }}
                      />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
                      {[
                        ["Position", `P${entry.position}`, "#fff"],
                        ["Points", entry.points, "#FFD700"],
                        ["Wins", entry.wins, "#E10600"],
                      ].map(([label, value, accent]) => (
                        <div key={label} style={{ background: "#111", borderRadius: 8, padding: "9px 10px" }}>
                          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: accent, ...mono }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!!watchedTeams.length && (
        <div>
          <SecLabel>Tracked Constructors</SecLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
            {watchedTeams.map((entry) => {
              const team = entry.Constructor;
              const teamCol = col(team?.constructorId);
              const meta = getConstructorProfileMeta(team?.constructorId);
              const isLatestWinner = latestRaceContext?.teamName === team?.name;
              return (
                <div key={team.constructorId} style={{ background: "#0f0f0f", border: `1px solid ${teamCol}33`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ height: 4, background: `linear-gradient(90deg, ${teamCol}, ${teamCol}44, transparent)` }} />
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <PosBadge pos={entry.position} />
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{team?.name}</div>
                          <div style={{ fontSize: 12, color: "#777", marginTop: 4 }}>{team?.nationality || "Unknown nationality"}</div>
                        </div>
                      </div>
                      <StarBtn id={team.constructorId} watchlist={watchlist} onToggle={onToggle} itemType="team" disabled={watchlistDisabled} />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <ConstructorLogo
                        constructorId={team?.constructorId}
                        teamName={team?.name || "Constructor"}
                        meta={meta}
                        teamColor={teamCol}
                        height={88}
                        compact
                      />
                    </div>

                    <div style={{ fontSize: 12, color: teamCol, fontWeight: 700, marginBottom: 6 }}>TP · {meta?.principal || "Not available"}</div>
                    <div style={{ fontSize: 11, color: "#666", marginBottom: 10 }}>
                      {meta?.powerUnit || "Power unit unknown"} · {meta?.base || "Base unknown"}
                    </div>
                    {isLatestWinner && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px", borderRadius: 999, background: "#FFD70014", border: "1px solid #FFD70033", color: "#FFD700", fontSize: 10, fontWeight: 700, letterSpacing: 0.4, marginBottom: 12 }}>
                        Latest GP winning team · {latestRaceContext.raceName}
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
                      {[
                        ["Position", `P${entry.position}`, "#fff"],
                        ["Points", entry.points, "#FFD700"],
                        ["Wins", entry.wins, teamCol],
                      ].map(([label, value, accent]) => (
                        <div key={label} style={{ background: "#111", borderRadius: 8, padding: "9px 10px" }}>
                          <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: accent, ...mono }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
