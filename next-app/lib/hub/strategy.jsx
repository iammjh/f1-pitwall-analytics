import { useState, useEffect } from "react";
import { startScopedRequest } from "../scoped-request";
import { fetchRoundPitStops, fetchRoundResultRace, fetchSeasonRaces, getCompletedRaces } from "../jolpica-client";
import { formatGrandPrixName as gpName, getTeamColor as col } from "../f1-display";
import { Empty, STINT_PAL, Spinner, apiFetch, buildStintsFromPits } from "./common";


export function StrategyPage({ season }) {
  const [races, setRaces] = useState([]);
  const [round, setRound] = useState(null);
  const [stintData, setStintData] = useState([]);
  const [totalLaps, setTotalLaps] = useState(60);
  const [selRace, setSelRace] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dl, setDl] = useState(false);

  // Load completed races for the season
  useEffect(() => {
    setLoading(true);
    setRaces([]); setRound(null); setSelRace(null); setStintData([]);
    return startScopedRequest(() => fetchSeasonRaces(season, { limit: 30, fetcher: apiFetch }), {
      onSuccess: all => {
        const done = getCompletedRaces(all);
        setRaces(done);
        if (done.length) {
          const last = done[done.length - 1];
          setRound(last.round);
          setSelRace(last);
        }
      },
      onSettled: () => setLoading(false),
    });
  }, [season]);

  // Load pit stops + results whenever round changes
  useEffect(() => {
    if (!round) return;
    setDl(true); setStintData([]);
    return startScopedRequest(() => Promise.all([
      fetchRoundResultRace(season, round, { limit: 25, fetcher: apiFetch }),
      fetchRoundPitStops(season, round, { limit: 200, fetcher: apiFetch }),
    ]), { onSuccess: ([race, pitstops]) => {
      const results = race?.Results || [];
      if (!results.length) { setDl(false); return; }
      const laps = Number(results[0]?.laps) || 60;
      setTotalLaps(laps);
      // Group pit stops by driverId
      const byDrv = {};
      pitstops.forEach(p => {
        if (!byDrv[p.driverId]) byDrv[p.driverId] = [];
        byDrv[p.driverId].push(p);
      });
      const rows = results.slice(0, 20).map(r => ({
        id: r.Driver.driverId,
        name: `${r.Driver.givenName[0]}. ${r.Driver.familyName}`,
        pos: r.position,
        tc: col(r.Constructor?.constructorId),
        team: r.Constructor?.name,
        stints: buildStintsFromPits(byDrv[r.Driver.driverId] || [], r.laps || laps),
        stops: (byDrv[r.Driver.driverId] || []).length,
      }));
      setStintData(rows);
    }, onSettled: () => setDl(false) });
  }, [round, season]);

  if (loading) return <Spinner />;
  if (!races.length) return <Empty icon="🎯" msg="No completed races found for this season" />;

  const avgStop = stintData.length
    ? stintData.reduce((a, d) => a + d.stops, 0) / stintData.length
    : 0;

  return (
    <div>
      {/* Race selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <select
          value={round || ""}
          onChange={e => {
            const r = races.find(x => x.round === e.target.value);
            setRound(e.target.value);
            setSelRace(r || null);
          }}
          style={{ background: "#111", border: "1px solid #1e1e1e", color: "#fff", padding: "9px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", minWidth: 240 }}
        >
          {races.map(r => (
            <option key={r.round} value={r.round}>R{r.round} — {gpName(r.raceName)}</option>
          ))}
        </select>
        {selRace && (
          <span style={{ fontSize: 12, color: "#444" }}>
            {selRace.Circuit?.circuitName} · {selRace.date}
          </span>
        )}
      </div>

      {dl ? <Spinner /> : !stintData.length ? (
        <Empty icon="🔧" msg="No pit stop data for this race" />
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 22 }}>
            {[
              ["Race", gpName(selRace?.raceName), undefined],
              ["Laps", totalLaps, undefined],
              ["Most Stops", Math.max(...stintData.map(d => d.stops)), "#E10600"],
              ["Avg Stops", avgStop.toFixed(1), undefined],
              ["1-Stoppers", stintData.filter(d => d.stops === 1).length, "#27F4D2"],
            ].map(([label, val, accent]) => (
              <div key={label} style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: accent || "#fff", fontFamily: "monospace" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Stint legend */}
          <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            {STINT_PAL.slice(0, 4).map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 18, height: 10, borderRadius: 2, background: c }} />
                <span style={{ fontSize: 11, color: "#555" }}>Stint {i + 1}</span>
              </div>
            ))}
            <span style={{ fontSize: 11, color: "#2a2a2a", marginLeft: "auto" }}>Hover a row to isolate · bar width = laps in stint</span>
          </div>

          {/* Stint chart */}
          <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", borderRadius: 10, padding: "16px 16px 10px", overflowX: "auto" }}>
            <div style={{ minWidth: 480 }}>
              {/* Lap ruler */}
              <div style={{ display: "flex", paddingLeft: 162, marginBottom: 10 }}>
                <div style={{ position: "relative", flex: 1, height: 16 }}>
                  {[0, 10, 20, 30, 40, 50, 60, 70].filter(l => l <= totalLaps).map(l => (
                    <div key={l} style={{ position: "absolute", left: `${(l / totalLaps) * 100}%`, fontSize: 9, color: "#2a2a2a", transform: "translateX(-50%)" }}>{l}</div>
                  ))}
                </div>
              </div>

              {stintData.map(driver => (
                <div
                  key={driver.id}
                  onMouseEnter={() => setHovered(driver.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7, opacity: hovered && hovered !== driver.id ? 0.2 : 1, transition: "opacity 0.18s" }}
                >
                  {/* Driver label */}
                  <div style={{ width: 155, flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 3, height: 22, background: driver.tc, borderRadius: 2, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#ccc", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{driver.name}</div>
                      <div style={{ fontSize: 10, color: "#3a3a3a", fontFamily: "monospace" }}>P{driver.pos} · {driver.stops} stop{driver.stops !== 1 ? "s" : ""}</div>
                    </div>
                  </div>

                  {/* Stint bars */}
                  <div style={{ flex: 1, height: 26, position: "relative", borderRadius: 4, overflow: "hidden", background: "#111" }}>
                    {driver.stints.map((st, idx) => {
                      const startPct = ((st.start - 1) / totalLaps) * 100;
                      const widthPct = ((st.end - st.start + 1) / totalLaps) * 100;
                      const color = STINT_PAL[Math.min(st.i, STINT_PAL.length - 1)];
                      const lapCount = st.end - st.start + 1;
                      return (
                        <div
                          key={idx}
                          title={`Stint ${st.i + 1}: L${st.start}–L${st.end} (${lapCount} laps)${st.dur ? ` · ${st.dur}s stop` : ""}`}
                          style={{
                            position: "absolute", left: `${startPct}%`, width: `${widthPct}%`,
                            height: "100%", background: color, opacity: 0.88,
                            borderRight: idx < driver.stints.length - 1 ? "2px solid #0a0a0a" : "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxSizing: "border-box",
                          }}
                        >
                          {widthPct > 7 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(0,0,0,0.7)", userSelect: "none" }}>
                              {lapCount}L
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {/* Pit stop markers */}
                    {driver.stints.slice(0, -1).map((st, idx) => (
                      <div
                        key={`pit-${idx}`}
                        style={{ position: "absolute", left: `${(st.end / totalLaps) * 100}%`, top: 0, width: 2, height: "100%", background: "#0a0a0a", zIndex: 2 }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: 9, color: "#1e1e1e", textAlign: "center", marginTop: 10 }}>← Lap number →</div>
            </div>
          </div>

          {/* Raw pit stop table */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 10, color: "#333", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12, fontWeight: 600 }}>All Pit Stops — Sorted by Lap</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #E10600" }}>
                    {["Driver", "Stop", "Lap", "Time of Day", "Duration"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", color: "#555", fontWeight: 500, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stintData
                    .flatMap(d => (d.stints.slice(0, -1).map((st, i) => ({ driverId: d.id, name: d.name, tc: d.tc, stop: i + 1, lap: st.end, dur: st.dur }))))
                    .sort((a, b) => a.lap - b.lap)
                    .map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #141414" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#0d0d0d"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <td style={{ padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 3, height: 18, background: p.tc, borderRadius: 2, flexShrink: 0 }} />
                            <span style={{ color: "#ccc", fontWeight: 500 }}>{p.name}</span>
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#555" }}>#{p.stop}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#888" }}>L{p.lap}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#555", fontSize: 12 }}>—</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{
                            fontFamily: "monospace", fontSize: 13, fontWeight: 600,
                            color: p.dur && parseFloat(p.dur) < 23 ? "#27F4D2" : p.dur && parseFloat(p.dur) < 28 ? "#FFD700" : "#888"
                          }}>
                            {p.dur ? `${p.dur}s` : "—"}
                          </span>
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
