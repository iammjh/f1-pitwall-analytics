import { useState, useEffect } from "react";
import { startScopedRequest } from "../scoped-request";
import { fetchDriverStandings, fetchSeasonResults } from "../jolpica-client";
import { getTeamColor as col } from "../f1-display";
import { DriverPhoto, Empty, PanelHeader, SecLabel, Spinner, StarBtn, apiFetch, buildDriverHeadshotLookup, buildLatestRaceWinnerContext, resolveDriverHeadshotUrl } from "./common";
import { CareerSection } from "./career";
import { ShareButton } from "./share";


export function DrvCard({ drv, standing, headshotUrl = null, latestRaceContext, watchlist, onToggle, onClick, watchlistDisabled = false }) {
  const team = standing.Constructors?.[0];
  const teamCol = col(team?.constructorId);
  const medal = ["1", "2", "3"].includes(standing.position);
  const isLatestWinner = latestRaceContext?.driverId === drv.driverId;

  return (
    <div
      onClick={onClick}
      style={{
        background: "#0a0a0a", border: `1px solid #1a1a1a`,
        borderRadius: 12, overflow: "hidden", cursor: "pointer",
        transition: "all 0.2s ease", position: "relative",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = teamCol;
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = `0 8px 24px ${teamCol}22`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = "#1a1a1a";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Photo area */}
      <div style={{ position: "relative", height: 160, overflow: "hidden", background: `radial-gradient(circle at top left, ${teamCol}22, transparent 45%), linear-gradient(135deg, #101010 0%, #0a0a0a 72%)` }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${teamCol}10, transparent 55%)` }} />
        <div style={{
          position: "absolute",
          left: 12,
          top: 12,
          fontSize: 56,
          fontWeight: 900,
          letterSpacing: -3,
          color: teamCol,
          opacity: 0.9,
          lineHeight: 0.9,
          pointerEvents: "none",
        }}>
          {`${drv.givenName?.[0] || ""}${drv.familyName?.[0] || ""}` || "F1"}
        </div>
        <div style={{
          position: "absolute",
          right: 12,
          bottom: 0,
          width: 106,
          height: 148,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          pointerEvents: "none",
        }}>
          <DriverPhoto
            firstName={drv.givenName}
            lastName={drv.familyName}
            wikiUrl={drv.url}
            headshotUrl={headshotUrl}
            headshotVariant="6col"
            teamColor={teamCol}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              objectFit: "contain",
              objectPosition: "center bottom",
              filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.42))",
              background: "transparent",
              border: "none",
            }}
          />
        </div>
        {/* gradient overlay */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, rgba(0,0,0,0) 45%, rgba(10,10,10,0.94) 100%)` }} />
        {/* Top-left position badge */}
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: medal ? (standing.position === "1" ? "#FFD700" : standing.position === "2" ? "#C0C0C0" : "#CD7F32") : "rgba(0,0,0,0.7)",
          color: medal ? "#000" : "#fff",
          width: 26, height: 26, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, fontFamily: "monospace",
          border: medal ? "none" : "1px solid #333",
        }}>{standing.position}</div>
        {/* Top-right star */}
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <StarBtn id={drv.driverId} watchlist={watchlist} onToggle={onToggle} itemType="driver" disabled={watchlistDisabled} />
        </div>
        {/* Team color bar at bottom of photo */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${teamCol}, ${teamCol}88)` }} />
      </div>

      {/* Info */}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 2 }}>{drv.givenName}</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: 0.3 }}>{drv.familyName}</div>
        <div style={{ fontSize: 11, color: teamCol, marginTop: 4, fontWeight: 600 }}>{team?.name}</div>
        {isLatestWinner && (
          <div style={{
            marginTop: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 999,
            background: "#FFD70014",
            border: "1px solid #FFD70033",
            color: "#FFD700",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.4,
          }}>
            <span>Latest GP winner</span>
            <span style={{ color: "#888", fontWeight: 600 }}>{latestRaceContext.raceName}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid #141414" }}>
          <span style={{ fontSize: 10, color: "#333", fontFamily: "monospace" }}>#{drv.permanentNumber}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#FFD700", fontFamily: "monospace" }}>{standing.points} <span style={{ fontSize: 10, color: "#555", fontWeight: 400 }}>pts</span></span>
        </div>
      </div>
    </div>
  );
}


// Jolpica reports dateOfBirth as YYYY-MM-DD; show it in the same style as the rest of the panel.
function formatBirthDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function DrvPanel({ standing, headshotUrl = null, latestRaceContext, onClose, isMobile }) {
  if (!standing) return null;
  const drv = standing.Driver;
  const team = standing.Constructors?.[0];
  const teamCol = col(team?.constructorId);
  const medal = ["1", "2", "3"].includes(standing.position);
  const isLatestWinner = latestRaceContext?.driverId === drv.driverId;

  return (
    <div
      style={{
        width: isMobile ? "100%" : 360,
        flexShrink: 0,
        background: "#0a0a0a",
        border: "1px solid #1c1c1c",
        borderRadius: 12,
        overflow: "hidden",
        alignSelf: "flex-start",
        position: isMobile ? "relative" : "sticky",
        top: 0,
        maxHeight: isMobile ? "none" : "calc(100vh - 140px)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <PanelHeader title={`${drv.givenName} ${drv.familyName}`} accent={teamCol} onClose={onClose} />
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, overscrollBehavior: "contain" }}>
        {/* Hero photo */}
        <div style={{ position: "relative", height: 280, overflow: "hidden" }}>
          <DriverPhoto
            firstName={drv.givenName} lastName={drv.familyName} wikiUrl={drv.url} headshotUrl={headshotUrl} headshotVariant="12col"
            teamColor={teamCol}
            style={{ width: "100%", height: 280, display: "block", objectFit: headshotUrl ? "contain" : "cover", objectPosition: headshotUrl ? "center bottom" : "center top", background: headshotUrl ? `radial-gradient(circle at top left, ${teamCol}18, transparent 42%), linear-gradient(135deg, #111, #0a0a0a 78%)` : undefined, border: headshotUrl ? "none" : undefined }}
          />
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, transparent 50%, #0a0a0a 100%)` }} />
          {/* Race number overlay */}
          <div style={{ position: "absolute", bottom: 14, left: 18, fontFamily: "monospace", fontSize: 52, fontWeight: 900, color: teamCol, opacity: 0.25, lineHeight: 1 }}>
            {drv.permanentNumber}
          </div>
          {/* Championship position */}
          <div style={{
            position: "absolute", bottom: 14, right: 18,
            background: medal ? (standing.position === "1" ? "#FFD700" : standing.position === "2" ? "#C0C0C0" : "#CD7F32") : "#111",
            color: medal ? "#000" : "#fff",
            padding: "4px 12px", borderRadius: 20,
            fontFamily: "monospace", fontWeight: 800, fontSize: 13,
            border: medal ? "none" : "1px solid #2a2a2a",
          }}>P{standing.position}</div>
        </div>

        {/* Team color bar */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${teamCol}, ${teamCol}44, transparent)` }} />

        <div style={{ padding: "16px" }}>
          {/* Season stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 18 }}>
            {[
              ["Points", standing.points, "#FFD700"],
              ["Season Wins", standing.wins, "#E10600"],
              ["Podiums", standing.podiums, "#a855f7"],
            ].map(([l, v, ac]) => (
              <div key={l} style={{ background: "#111", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: ac, fontFamily: "monospace" }}>{v ?? "—"}</div>
              </div>
            ))}
          </div>

          <SecLabel>Driver Info</SecLabel>
          <div style={{ background: "#0f0f0f", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 }}>
            {[
              ["Nationality", drv.nationality],
              ["Date of Birth", formatBirthDate(drv.dateOfBirth)],
              ["Car Number", `#${drv.permanentNumber}`],
              ["Code", drv.code || "—"],
              ["Team", team?.name || "—"],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #141414" }}>
                <span style={{ color: "#555", fontSize: 12 }}>{label}</span>
                <span style={{ color: label === "Team" ? teamCol : "#ccc", fontWeight: label === "Team" ? 600 : 400, fontSize: 12 }}>{val}</span>
              </div>
            ))}
          </div>

          {latestRaceContext && (
            <>
              <SecLabel>Latest Grand Prix Context</SecLabel>
              <div style={{ background: "#0f0f0f", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 }}>
                {isLatestWinner && (
                  <div style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#FFD70014",
                    border: "1px solid #FFD70033",
                    color: "#FFD700",
                    fontWeight: 700,
                    marginBottom: 10,
                  }}>
                    Won the most recent race: {latestRaceContext.raceName}
                  </div>
                )}
                {[
                  ["Latest GP", latestRaceContext.raceName],
                  ["Race Winner", latestRaceContext.driverName],
                  ["Winning Team", latestRaceContext.teamName],
                  ["Race Date", latestRaceContext.date || "—"],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #141414" }}>
                    <span style={{ color: "#555", fontSize: 12 }}>{label}</span>
                    <span style={{ color: label === "Winning Team" ? latestRaceContext.teamColor : "#ccc", fontWeight: label === "Winning Team" ? 600 : 400, fontSize: 12, textAlign: "right" }}>{val}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ marginBottom: 14 }}>
            <ShareButton path={`/share/driver/${drv.driverId}`} accent={teamCol} />
          </div>

          <CareerSection type="driver" id={drv.driverId} accent={teamCol} />

        </div>
      </div>
    </div>
  );
}


export function DriversPage({ season, watchlist, onToggle, watchlistDisabled = false, isMobile = false }) {
  const [drivers, setDrivers] = useState([]);
  const [races, setRaces] = useState([]);
  const [headshots, setHeadshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState(null);
  useEffect(() => {
    setLoading(true);
    setDrivers([]); setRaces([]); setHeadshots([]); setSelectedDriver(null);
    return startScopedRequest(() => Promise.all([
      fetchDriverStandings(season, { limit: 100, fetcher: apiFetch }),
      fetchSeasonResults(season, { limit: 600, fetcher: apiFetch }),
      apiFetch(`/api/drivers/headshots?season=${encodeURIComponent(season)}`, 300000),
    ]), {
      onSuccess: ([standings, seasonRaces, headshotPayload]) => {
        setDrivers(standings);
        setRaces(seasonRaces);
        setHeadshots(Array.isArray(headshotPayload?.drivers) ? headshotPayload.drivers : []);
      },
      onSettled: () => setLoading(false),
    });
  }, [season]);
  if (loading) return <Spinner />;
  if (!drivers.length) return <Empty />;
  const latestRaceContext = buildLatestRaceWinnerContext(races);
  const headshotLookup = buildDriverHeadshotLookup(headshots);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, minHeight: 520 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 14 }}>
            {drivers.map((d, i) => (
              <div key={d.Driver.driverId} style={{ animation: `cardIn 0.25s ease-out ${i * 30}ms both` }}>
                <DrvCard
                  drv={d.Driver}
                  standing={d}
                  headshotUrl={resolveDriverHeadshotUrl(d.Driver, headshotLookup)}
                  latestRaceContext={latestRaceContext}
                  watchlist={watchlist}
                  onToggle={onToggle}
                  onClick={() => setSelectedDriver(d)}
                  watchlistDisabled={watchlistDisabled}
                />
              </div>
            ))}
          </div>
        </div>
        {selectedDriver && (
          <DrvPanel
            standing={selectedDriver}
            headshotUrl={resolveDriverHeadshotUrl(selectedDriver.Driver, headshotLookup)}
            latestRaceContext={latestRaceContext}
            onClose={() => setSelectedDriver(null)}
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  );
}
