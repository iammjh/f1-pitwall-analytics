import { useState, useEffect } from "react";
import { startScopedRequest } from "../scoped-request";
import { fetchCircuitResults, fetchSeasonRaces } from "../jolpica-client";
import { getTeamColor as col } from "../f1-display";
import { CIRCUIT_META, CircuitImage, Empty, Spinner, apiFetch, buildSeasonCircuitList, flagOf, getCircuitDisplayName } from "./common";



export function CircuitsPage({ season, isMobile }) {
  const [circuits, setCircuits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [dl, setDl] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true); setSel(null); setCircuits([]); setDetail(null);
    return startScopedRequest(() => fetchSeasonRaces(season, { limit: 40, fetcher: apiFetch }), {
      onSuccess: (races) => {
        setCircuits(buildSeasonCircuitList(races));
      },
      onSettled: () => setLoading(false),
    });
  }, [season]);

  useEffect(() => {
    if (!sel) return;
    setDl(true); setDetail(null);
    return startScopedRequest(() => fetchCircuitResults(sel.circuitId, { season, limit: 5, fetcher: apiFetch }), {
      onSuccess: (recent) => setDetail(recent[0] || null),
      onSettled: () => setDl(false),
    });
  }, [sel, season]);

  if (loading) return <Spinner />;
  if (!circuits.length) return <Empty />;

  const filtered = circuits.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    const displayName = getCircuitDisplayName(c).toLowerCase();
    return displayName.includes(q) ||
      c.circuitName?.toLowerCase().includes(q) ||
      c.Location?.country?.toLowerCase().includes(q) ||
      c.Location?.locality?.toLowerCase().includes(q);
  });

  const meta = sel ? CIRCUIT_META[sel.circuitId] : null;

  return (
    <div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, minHeight: 500 }}>

        {/* ── Circuit grid ──────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Search */}
          <div style={{ position: "relative", marginBottom: 16 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#444", fontSize: 13, pointerEvents: "none" }}>🔍</span>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search circuits or countries…"
              style={{ width: "100%", background: "#0f0f0f", border: "1px solid #1e1e1e", color: "#fff", padding: "9px 12px 9px 32px", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill,minmax(190px,1fr))", gap: 10 }}>
            {filtered.map((c, idx) => {
              const isSel = sel?.circuitId === c.circuitId;
              return (
                <div
                  key={c.circuitId}
                  onClick={() => setSel(isSel ? null : c)}
                  style={{
                    background: isSel ? "linear-gradient(180deg, #141414 0%, #080808 100%)" : "#060606",
                    border: `1px solid ${isSel ? "#27F4D2" : "#1a1a1a"}`,
                    borderRadius: 10, padding: "10px 10px 12px",
                    cursor: "pointer", transition: "all 0.22s ease",
                    position: "relative", overflow: "hidden",
                    boxShadow: isSel ? "0 0 16px rgba(39, 244, 210, 0.25)" : "none",
                  }}
                  onMouseEnter={e => { if (!isSel) { e.currentTarget.style.borderColor = "#27F4D2"; e.currentTarget.style.background = "#0e0e0e"; e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(39, 244, 210, 0.15)"; } }}
                  onMouseLeave={e => { if (!isSel) { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.background = "#060606"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; } }}
                >
                  {/* Round badge */}
                  {c.round && <span style={{ position: "absolute", top: 8, right: 8, fontFamily: "monospace", fontSize: 9, color: isSel ? "#27F4D2" : "#444", fontWeight: 700, zIndex: 2 }}>R{c.round}</span>}

                  {/* Wikipedia circuit layout image */}
                  <div style={{ borderRadius: 6, overflow: "hidden", marginBottom: 10, border: `1px solid ${isSel ? "rgba(39, 244, 210, 0.3)" : "#121212"}` }}>
                    <CircuitImage
                      circuitId={c.circuitId}
                      circuitName={c.circuitName}
                      wikiUrl={c.url}
                      locality={c.Location?.locality}
                      country={c.Location?.country}
                      height={isMobile ? 90 : 110}
                    />
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: isSel ? "#fff" : "#bbb", marginBottom: 3, lineHeight: 1.2 }}>{getCircuitDisplayName(c)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{flagOf(c.Location?.country)}</span>
                    <span style={{ fontSize: 11, color: "#666" }}>{c.Location?.locality}, {c.Location?.country}</span>
                  </div>
                  {CIRCUIT_META[c.circuitId] && (
                    <div style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#27F4D2",
                      background: "rgba(39, 244, 210, 0.06)",
                      border: "1px solid rgba(39, 244, 210, 0.12)",
                      padding: "2px 6px",
                      borderRadius: 4,
                      display: "inline-block",
                      fontFamily: "monospace",
                      marginTop: 6
                    }}>
                      {CIRCUIT_META[c.circuitId].lap} · {CIRCUIT_META[c.circuitId].turns} turns
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Detail panel ──────────────────────────────────────── */}
        {sel && (
          <div style={{
            width: isMobile ? "100%" : 340,
            flexShrink: 0, background: "#080808",
            border: "1px solid #1a1a1a", borderRadius: 12,
            overflow: "hidden", alignSelf: "flex-start",
            position: isMobile ? "relative" : "sticky", top: 0,
            maxHeight: isMobile ? "none" : "calc(100vh - 140px)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          }}>
            {/* Header */}
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #141414", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#fff" }}>Circuit Detail</span>
              <button
                onClick={() => setSel(null)}
                style={{
                  background: "transparent", border: "1px solid #222", color: "#999",
                  width: 26, height: 26, borderRadius: 6, cursor: "pointer",
                  fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease"
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#27F4D2"; e.currentTarget.style.color = "#27F4D2"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.color = "#666"; }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "18px", overflowY: "auto", flex: 1, minHeight: 0, overscrollBehavior: "contain" }}>
              {/* Large Wikipedia circuit layout */}
              <div style={{ background: "#060606", borderRadius: 10, overflow: "hidden", marginBottom: 16, border: "1px solid rgba(39, 244, 210, 0.2)" }}>
                <CircuitImage
                  circuitId={sel.circuitId}
                  circuitName={sel.circuitName}
                  wikiUrl={sel.url}
                  locality={sel.Location?.locality}
                  country={sel.Location?.country}
                  height={200}
                />
              </div>

              {/* Name + location */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 22 }}>{flagOf(sel.Location?.country)}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{getCircuitDisplayName(sel)}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{sel.Location?.locality} · {sel.Location?.country}</div>
                  </div>
                </div>
                <a href={sel.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#27F4D2", textDecoration: "none", fontWeight: 600 }}>
                  Wikipedia →
                </a>
              </div>

              {/* Stats grid */}
              {meta && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                  {[
                    ["Lap Length", meta.lap],
                    ["Turns", meta.turns],
                    ["DRS Zones", meta.drs],
                    ["First GP", meta.est],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background: "linear-gradient(135deg, #111 0%, #0c0c0c 100%)", border: "1px solid #1a1a1a", borderRadius: 7, padding: "10px 12px" }}>
                      <div style={{ fontSize: 10, color: "#27F4D2", opacity: 0.8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent race result */}
              {dl ? <Spinner /> : detail ? (
                <>
                  <div style={{ fontSize: 10, color: "#27F4D2", opacity: 0.9, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10, fontWeight: 600 }}>
                    {season} Race · {detail.date}
                  </div>
                  <div style={{ fontSize: 13, color: "#888", marginBottom: 10, fontWeight: 500 }}>{detail.raceName}</div>
                  {(detail.Results || []).slice(0, 5).map(r => (
                    <div key={r.Driver.driverId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #141414" }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                        background: r.position === "1" ? "#FFD700" : r.position === "2" ? "#C0C0C0" : r.position === "3" ? "#CD7F32" : "transparent",
                        border: ["1", "2", "3"].includes(r.position) ? "none" : "1px solid #222",
                        fontSize: 11, fontWeight: 700, color: ["1", "2", "3"].includes(r.position) ? "#000" : "#888",
                        fontFamily: "monospace", flexShrink: 0,
                      }}>{r.position}</div>
                      <div style={{ width: 3, height: 18, background: col(r.Constructor?.constructorId), borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ flex: 1, color: "#ccc", fontSize: 13 }}>{r.Driver.givenName[0]}. {r.Driver.familyName}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#888" }}>{r.Time?.time || r.status}</span>
                    </div>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
