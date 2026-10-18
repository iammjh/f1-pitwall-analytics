import { useState, useEffect } from "react";
import { startScopedRequest } from "../scoped-request";
import { getConstructorProfileMeta } from "../constructor-profile-data";
import { fetchConstructorStandings } from "../jolpica-client";
import { getTeamColor as col } from "../f1-display";
import { ConstructorLogo, Empty, PanelHeader, PosBadge, SecLabel, Spinner, StarBtn, apiFetch } from "./common";
import { CareerSection } from "./career";


export function ConCard({ standing, meta, watchlist, onToggle, onClick, watchlistDisabled = false }) {
  const team = standing.Constructor;
  const tc = col(team?.constructorId);
  return (
    <div
      onClick={onClick}
      style={{
        background: "#0a0a0a", border: `1px solid ${tc}44`,
        borderRadius: 12, overflow: "hidden", cursor: "pointer",
        transition: "transform 0.18s, box-shadow 0.18s",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 28px ${tc}28`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ height: 5, background: `linear-gradient(90deg, ${tc}, ${tc}66, transparent)` }} />
      <div style={{ padding: "16px 18px" }}>
        <div style={{ marginBottom: 14 }}>
          <ConstructorLogo
            constructorId={team?.constructorId}
            teamName={team?.name || "Constructor"}
            meta={meta}
            teamColor={tc}
            height={88}
            compact
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <PosBadge pos={standing.position} />
          {watchlist && <StarBtn id={team.constructorId} watchlist={watchlist} onToggle={onToggle} itemType="team" disabled={watchlistDisabled} />}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 3, letterSpacing: -0.3 }}>{team.name}</div>
        <div style={{ fontSize: 11, color: "#444", marginBottom: 6 }}>{team.nationality}</div>
        {!!meta?.principal && <div style={{ fontSize: 11, color: tc, marginBottom: 14, fontWeight: 600 }}>TP · {meta.principal}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: `${tc}11`, border: `1px solid ${tc}22`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Wins</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: tc, fontFamily: "monospace" }}>{standing.wins}</div>
          </div>
          <div style={{ background: "#FFD70011", border: "1px solid #FFD70022", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Points</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#FFD700", fontFamily: "monospace" }}>{standing.points}</div>
          </div>
        </div>
      </div>
    </div>
  );
}


export function ConPanel({ standing, isMobile, onClose }) {
  if (!standing) return null;

  const team = standing.Constructor;
  const tc = col(team?.constructorId);
  const meta = getConstructorProfileMeta(team?.constructorId);

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
      <PanelHeader title={team?.name || "Constructor"} accent={tc} onClose={onClose} />
      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, overscrollBehavior: "contain" }}>
        <div style={{ padding: "18px" }}>
          <div style={{ marginBottom: 16 }}>
            <ConstructorLogo
              constructorId={team?.constructorId}
              teamName={team?.name || "Constructor"}
              meta={meta}
              teamColor={tc}
              height={230}
            />
          </div>

          <div style={{ background: "#111", border: `1px solid ${tc}33`, borderRadius: 12, padding: "18px 16px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${tc}, ${tc}44, transparent)` }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: tc, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>{team?.nationality}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{team?.name}</div>
                {meta?.base && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{meta.base}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: tc, lineHeight: 1 }}>P{standing.position}</div>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>championship</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {[
                ["Points", standing.points, "#FFD700"],
                ["Wins", standing.wins, tc],
                ["Titles", meta?.constructorsTitles || "0", "#a855f7"],
              ].map(([label, value, accent]) => (
                <div key={label} style={{ background: "#0c0c0c", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "#444", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: accent, fontFamily: "monospace" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <SecLabel>Constructor Info</SecLabel>
          <div style={{ background: "#0f0f0f", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 }}>
            {[
              ["Championship Position", `P${standing.position}`],
              ["Constructor", team?.name || "—"],
              ["Nationality", team?.nationality || "—"],
              ["Wikipedia", team?.url || "—"],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #141414", gap: 10 }}>
                <span style={{ color: "#555", fontSize: 12 }}>{label}</span>
                <span style={{ color: "#ccc", fontWeight: 500, fontSize: 12, textAlign: "right", wordBreak: "break-word" }}>{val}</span>
              </div>
            ))}
          </div>

          <CareerSection type="constructor" id={team?.constructorId} accent={tc} />

          <SecLabel>Team Structure</SecLabel>
          <div style={{ background: "#0f0f0f", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 }}>
            {[
              ["Team Principal", meta?.principal || "Not available"],
              ["Technical Chief", meta?.technicalChief || "Not available"],
              ["Founder / Origin", meta?.founder || "Not available"],
              ["Base", meta?.base || "Not available"],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #141414", gap: 10 }}>
                <span style={{ color: "#555", fontSize: 12 }}>{label}</span>
                <span style={{ color: "#ccc", fontWeight: 500, fontSize: 12, textAlign: "right", wordBreak: "break-word" }}>{val}</span>
              </div>
            ))}
          </div>

          <SecLabel>Technical Package</SecLabel>
          <div style={{ background: "#0f0f0f", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 13 }}>
            {[
              ["Power Unit", meta?.powerUnit || "Not available"],
              ["Chassis", meta?.chassis || "Not available"],
              ["Debut Year", meta?.debutYear || "Not available"],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #141414", gap: 10 }}>
                <span style={{ color: "#555", fontSize: 12 }}>{label}</span>
                <span style={{ color: "#ccc", fontWeight: 500, fontSize: 12, textAlign: "right", wordBreak: "break-word" }}>{val}</span>
              </div>
            ))}
          </div>

          <SecLabel>Race Engineers</SecLabel>
          <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            {(meta?.raceEngineers?.length ? meta.raceEngineers : ["Not available"]).map((entry) => (
              <div key={entry} style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, color: "#ddd", fontWeight: 600 }}>{entry}</div>
              </div>
            ))}
          </div>

          <SecLabel>Championship Heritage</SecLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Constructors&apos; Titles</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: tc, fontFamily: "monospace" }}>{meta?.constructorsTitles || "0"}</div>
            </div>
            <div style={{ background: "#111", border: "1px solid #1c1c1c", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>Drivers&apos; Titles</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#FFD700", fontFamily: "monospace" }}>{meta?.driversTitles || "0"}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}


export function ConstructorsPage({ season, watchlist, onToggle, watchlistDisabled = false, isMobile = false }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  useEffect(() => {
    setLoading(true);
    setTeams([]); setSelectedTeam(null);
    return startScopedRequest(() => fetchConstructorStandings(season, { limit: 15, fetcher: apiFetch }), {
      onSuccess: setTeams,
      onSettled: () => setLoading(false),
    });
  }, [season]);
  if (loading) return <Spinner />;
  if (!teams.length) return <Empty />;
  return (
    <div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, minHeight: 520 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
            {teams.map((t, i) => {
              const team = t.Constructor;
              const meta = getConstructorProfileMeta(team?.constructorId);
              return (
                <div key={team.constructorId} style={{ animation: `cardIn 0.25s ease-out ${i * 40}ms both` }}>
                  <ConCard
                    standing={t}
                    meta={meta}
                    watchlist={watchlist}
                    onToggle={onToggle}
                    onClick={() => setSelectedTeam(t)}
                    watchlistDisabled={watchlistDisabled}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {selectedTeam && (
          <ConPanel standing={selectedTeam} isMobile={isMobile} onClose={() => setSelectedTeam(null)} />
        )}
      </div>
    </div>
  );
}
