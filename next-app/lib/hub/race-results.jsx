import { useState, useEffect } from "react";
import { fetchSeasonRaces, fetchSeasonResults } from "../jolpica-client";
import { formatGrandPrixName as gpName, getTeamColor as col } from "../f1-display";
import { startScopedRequest } from "../scoped-request";
import { Empty, Spinner, TH, TRow, apiFetch, flagOf, mono } from "./common";


export function RaceResultsPage({ season, isMobile }) {
  const [races, setRaces] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setRaces([]);
    return startScopedRequest(() => Promise.all([
      fetchSeasonRaces(season, { limit: 40, fetcher: apiFetch }),
      fetchSeasonResults(season, { limit: 1000, fetcher: apiFetch }),
    ]), {
      onSuccess: ([calendar, results]) => {
        const resultsMap = new Map(results.map(r => [r.round, r]));
        const merged = calendar.map(c => {
          if (resultsMap.has(c.round)) {
            return resultsMap.get(c.round);
          }
          return c;
        });
        const todayStr = new Date().toISOString().split('T')[0];
        const filtered = merged.filter(r => {
          if (r.Results && r.Results.length > 0) return true;
          return r.date && r.date <= todayStr;
        });
        setRaces(filtered);
      },
      onSettled: () => setLoading(false),
    });
  }, [season]);

  if (loading) return <Spinner />;
  if (!races.length) return <Empty msg="No races found" />;
  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 700 }}>
          <thead><tr style={{ borderBottom: "1px solid #E10600" }}>
            <TH>Round</TH><TH>Grand Prix</TH><TH>Circuit</TH><TH>Location</TH><TH>Date</TH><TH>Winner</TH>
          </tr></thead>
          <tbody>
            {races.map(r => (
              <TRow key={r.round}>
                <td style={{ padding: "11px 12px" }}>
                  <span style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    fontSize: 11,
                    fontWeight: 800,
                    background: "rgba(225, 6, 0, 0.1)",
                    color: "#FF3830",
                    border: "1px solid rgba(225, 6, 0, 0.35)",
                    boxShadow: "0 0 8px rgba(225, 6, 0, 0.1)",
                    ...mono
                  }}>
                    {r.round}
                  </span>
                </td>
                <td style={{ padding: "11px 12px", fontWeight: 600, minWidth: 120 }}>{gpName(r.raceName)}</td>
                <td style={{ padding: "11px 12px", color: "#FFD700", fontWeight: 500, minWidth: 100 }}>{r.Circuit?.circuitName || "—"}</td>
                <td style={{ padding: "11px 12px", color: "#888", fontSize: 11 }}>{r.Circuit?.Location?.country} {flagOf(r.Circuit?.Location?.country)}</td>
                <td style={{ padding: "11px 12px", ...mono, fontSize: 11, color: "#666" }}>{r.date}</td>
                <td style={{ padding: "11px 12px", fontWeight: 600, color: r.Results?.[0]?.Constructor?.constructorId ? col(r.Results[0].Constructor.constructorId) : "#666", minWidth: 80 }}>
                  {r.Results?.[0]?.Driver?.familyName ? (
                    r.Results[0].Driver.familyName
                  ) : (
                    (() => {
                      const now = new Date();
                      const raceDate = new Date(`${r.date}T${r.time || "12:00:00Z"}`);
                      if (raceDate > now) {
                        return <span style={{ color: "#555", fontSize: 11, fontWeight: 500, letterSpacing: 0.5 }}>Upcoming</span>;
                      }
                      return <span style={{ color: "#FFD700", fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>Pending</span>;
                    })()
                  )}
                </td>
              </TRow>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
