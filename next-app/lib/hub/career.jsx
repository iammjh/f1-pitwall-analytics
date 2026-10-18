import { useEffect, useState } from "react";
import { SecLabel, apiFetch } from "./common";

const SEASON_ROWS = 10;

function Tile({ label, value, color }) {
  return (
    <div style={{ background: "#111", borderRadius: 6, padding: "8px 6px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || "#fff", fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

function formatPoints(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function DriverCareerBody({ data, accent }) {
  const { totals, seasons } = data;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
        <Tile label="Starts" value={totals.starts} />
        <Tile label="Wins" value={totals.wins} color="#E10600" />
        <Tile label="Podiums" value={totals.podiums} color="#a855f7" />
        <Tile label="Poles" value={totals.poles} color="#FFD700" />
        <Tile label="Fastest" value={totals.fastestLaps} color="#27F4D2" />
        <Tile label="Race pts" value={formatPoints(totals.points)} color="#FFD700" />
        <Tile label="DNFs" value={totals.dnfs} />
        <Tile label="Seasons" value={totals.seasons} />
      </div>
      <SeasonTable
        accent={accent}
        headers={["Season", "Team", "Races", "Pts", "W", "P"]}
        rows={seasons.slice(0, SEASON_ROWS).map((s) => [s.season, s.team, s.races, formatPoints(s.points), s.wins, s.podiums])}
        total={seasons.length}
      />
    </>
  );
}

function ConstructorCareerBody({ data, accent }) {
  const { totals, seasons } = data;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
        <Tile label="Entries" value={totals.entries} />
        <Tile label="Wins" value={totals.wins} color="#E10600" />
        <Tile label="Podiums" value={totals.podiums} color="#a855f7" />
        <Tile label="Poles" value={totals.poles} color="#FFD700" />
        <Tile label="Fastest" value={totals.fastestLaps} color="#27F4D2" />
        <Tile label="Race pts" value={formatPoints(totals.points)} color="#FFD700" />
        <Tile label="Seasons" value={totals.seasons} />
      </div>
      <SeasonTable
        accent={accent}
        headers={["Season", "Drivers", "Pts", "W", "P"]}
        rows={seasons.slice(0, SEASON_ROWS).map((s) => [s.season, s.drivers.join(", "), formatPoints(s.points), s.wins, s.podiums])}
        total={seasons.length}
      />
    </>
  );
}

function SeasonTable({ headers, rows, total, accent }) {
  return (
    <div style={{ border: "1px solid #1a1a1a", borderRadius: 8, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${accent}55` }}>
            {headers.map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "#666", fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #141414" }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "6px 8px", color: j === 0 ? "#fff" : "#aaa", fontFamily: j === 0 || typeof cell === "number" ? "monospace" : undefined }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > SEASON_ROWS && (
        <div style={{ padding: "6px 8px", fontSize: 10, color: "#555" }}>Showing the latest {SEASON_ROWS} of {total} seasons</div>
      )}
    </div>
  );
}

/** Career totals and season history for a driver or constructor, loaded from /api/career. */
export function CareerSection({ type, id, accent = "#E10600" }) {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null });
    apiFetch(`/api/career?type=${type}&id=${encodeURIComponent(id)}`, 60 * 60 * 1000)
      .then((data) => { if (active) setState({ status: "ready", data }); })
      .catch(() => { if (active) setState({ status: "error", data: null }); });
    return () => { active = false; };
  }, [type, id]);

  if (!id) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <SecLabel>Career</SecLabel>
      {state.status === "loading" && <div style={{ fontSize: 12, color: "#555" }}>Loading career history…</div>}
      {state.status === "error" && <div style={{ fontSize: 12, color: "#c66" }}>Career history is unavailable right now.</div>}
      {state.status === "ready" && (
        type === "driver"
          ? <DriverCareerBody data={state.data} accent={accent} />
          : <ConstructorCareerBody data={state.data} accent={accent} />
      )}
      {state.status === "ready" && (
        <div style={{ fontSize: 10, color: "#444", marginTop: 6 }}>Race points only; sprint points are not included.</div>
      )}
    </div>
  );
}
