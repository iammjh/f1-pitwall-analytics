import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchSeasonRaces } from "../jolpica-client";
import { formatGrandPrixName as gpName, getTeamColor as col } from "../f1-display";
import { Empty, SecLabel, Spinner, apiFetch, mono } from "./common";
import { ShareButton } from "./share";

const DEFAULT_FOCUS = 6;

function isCompleted(race, now) {
  const start = new Date(`${race.date}T${race.time || "23:59:59Z"}`);
  return !Number.isNaN(start.getTime()) && start < now;
}

function labelFor(driver) {
  return driver?.code || driver?.name?.split(" ").pop() || "—";
}

/** Same team, two cars: the second one is drawn dashed so the lines stay distinguishable. */
function lineStyles(ids, drivers) {
  const seen = new Map();
  return Object.fromEntries(ids.map((id) => {
    const team = drivers.find((d) => d.driverId === id)?.constructorId;
    const count = seen.get(team) || 0;
    seen.set(team, count + 1);
    return [id, { stroke: col(team), strokeDasharray: count ? "6 4" : undefined }];
  }));
}

function Chip({ active, color, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "5px 10px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700, ...mono,
        border: `1px solid ${active ? color : "#2a2a2a"}`, background: active ? `${color}22` : "transparent",
        color: active ? "#fff" : "#666",
      }}
    >
      {label}
    </button>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ flex: "1 1 180px", minWidth: 0 }}>
      <label style={{ display: "block", fontSize: 11, color: "#666", marginBottom: 6 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 6, padding: "8px 12px", color: "#fff", fontSize: 13 }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function RecapCard({ season, round }) {
  const [state, setState] = useState({ status: "idle", text: null, error: null });

  useEffect(() => {
    setState({ status: "idle", text: null, error: null });
  }, [season, round]);

  async function write() {
    setState({ status: "loading", text: null, error: null });
    try {
      const res = await fetch(`/api/race-recap?season=${encodeURIComponent(season)}&round=${encodeURIComponent(round)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
      setState({ status: "ready", text: body.text, error: null });
    } catch (err) {
      setState({ status: "error", text: null, error: err.message });
    }
  }

  return (
    <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <SecLabel>AI race recap</SecLabel>
        {state.status !== "ready" && (
          <button
            type="button"
            onClick={write}
            disabled={state.status === "loading"}
            style={{ padding: "7px 12px", borderRadius: 8, cursor: state.status === "loading" ? "default" : "pointer", fontSize: 12, fontWeight: 700, border: "1px solid #E10600aa", background: "#E1060014", color: "#fff", opacity: state.status === "loading" ? 0.6 : 1 }}
          >
            {state.status === "loading" ? "Writing…" : "Write AI recap"}
          </button>
        )}
      </div>
      {state.status === "idle" && (
        <div style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
          A short written recap of this race, built from its results, grid and lap timing. Signed-in users can write one per race.
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div style={{ marginTop: 12, fontSize: 14, color: "#ddd", lineHeight: 1.7 }}>
            {state.text.split("\n\n").map((para, i) => <p key={i} style={{ margin: i ? "10px 0 0" : 0 }}>{para}</p>)}
          </div>
          <div style={{ fontSize: 10, color: "#555", marginTop: 10 }}>Written by Claude from this race&apos;s facts. Check it against the charts below.</div>
        </>
      )}
      {state.status === "error" && <div style={{ fontSize: 12, color: "#c66", marginTop: 10 }}>{state.error}</div>}
    </div>
  );
}

const pct = (p) => `${Math.round(p * 100)}%`;

/** Podium chances from the grid and recent form, with the model's track record beside them. */
function PodiumModelCard({ season, round }) {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null });
    apiFetch(`/api/race-model?season=${encodeURIComponent(season)}&round=${encodeURIComponent(round)}`, 60 * 60 * 1000)
      .then((data) => { if (active) setState({ status: "ready", data }); })
      .catch((err) => { if (active) setState({ status: "error", data: null, error: err.message }); });
    return () => { active = false; };
  }, [season, round]);

  if (state.status === "loading") return null;
  if (state.status === "error") return null;
  const { data } = state;
  const ev = data.evaluation;
  const th = { textAlign: "right", padding: "8px 10px", fontSize: 10, color: "#555", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 };
  const td = { padding: "9px 10px", fontSize: 12, borderTop: "1px solid #161616" };

  return (
    <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
      <SecLabel>Podium model</SecLabel>
      <div style={{ fontSize: 12, color: "#888", lineHeight: 1.6 }}>
        Chance of a podium from the grid slot alone, using a logistic regression trained on races before the season being scored.
        Recent form and team points are shown for context. They did not beat grid position on the latest season. {data.sample.note}
      </div>
      <div style={{ fontSize: 12, color: "#bbb", marginTop: 10, ...mono }}>
        Brier score, lower is better. {ev.testSeason} out of sample: grid only {ev.brier.gridOnly.toFixed(3)} · with form and team {ev.brier.withFormAndTeam.toFixed(3)} · base rate {ev.brier.baseRate.toFixed(3)}
      </div>
      {data.latestSeasonCheck && (
        <div style={{ fontSize: 12, color: "#bbb", marginTop: 4, ...mono }}>
          {data.latestSeasonCheck.season} so far, {data.latestSeasonCheck.races} races out of sample: grid only {data.latestSeasonCheck.brier.gridOnly.toFixed(3)} · with form and team {data.latestSeasonCheck.brier.withFormAndTeam.toFixed(3)}
        </div>
      )}
      <div style={{ overflowX: "auto", marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left" }}>Driver</th>
              <th style={th}>Grid</th>
              <th style={th}>Form</th>
              <th style={th}>Team pts</th>
              <th style={th}>Podium chance (grid)</th>
              <th style={th}>Result</th>
            </tr>
          </thead>
          <tbody>
            {data.drivers.slice(0, 10).map((d) => (
              <tr key={d.driverId}>
                <td style={{ ...td, color: "#fff", fontWeight: 600 }}>{d.code || d.name}</td>
                <td style={{ ...td, textAlign: "right", ...mono, color: "#aaa" }}>{d.grid}</td>
                <td style={{ ...td, textAlign: "right", ...mono, color: "#aaa" }}>{d.formAvg.toFixed(1)}</td>
                <td style={{ ...td, textAlign: "right", ...mono, color: "#aaa" }}>{d.teamForm.toFixed(1)}</td>
                <td style={{ ...td, textAlign: "right", ...mono, color: "#27F4D2", fontWeight: 700 }}>{pct(d.probability)}</td>
                <td style={{ ...td, textAlign: "right", ...mono, color: d.podium ? "#FFD700" : "#666", fontWeight: d.podium ? 700 : 400 }}>
                  {d.finish === null ? "DNF" : `P${d.finish}`}{d.podium ? " ★" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: "#555", marginTop: 10, lineHeight: 1.6 }}>
        The chance uses the grid slot only. Form and team columns are context; on the latest season they added error rather than accuracy.
      </div>
    </div>
  );
}

export function RaceStoryPage({ season, isMobile = false }) {
  const [races, setRaces] = useState(null);
  const [round, setRound] = useState("");
  const [story, setStory] = useState({ status: "idle", data: null });
  const [focus, setFocus] = useState([]);
  const [gapA, setGapA] = useState("");
  const [gapB, setGapB] = useState("");

  useEffect(() => {
    let active = true;
    setRaces(null);
    fetchSeasonRaces(season, { limit: 40, fetcher: apiFetch })
      .then((list) => {
        if (!active) return;
        const now = new Date();
        const done = list.filter((r) => isCompleted(r, now));
        setRaces(done);
        setRound(done.length ? done[done.length - 1].round : "");
      })
      .catch(() => { if (active) setRaces([]); });
    return () => { active = false; };
  }, [season]);

  useEffect(() => {
    if (!round) return;
    let active = true;
    setStory({ status: "loading", data: null });
    apiFetch(`/api/race-story?season=${encodeURIComponent(season)}&round=${encodeURIComponent(round)}`, 60 * 60 * 1000)
      .then((data) => { if (active) setStory({ status: data.available ? "ready" : "unavailable", data }); })
      .catch(() => { if (active) setStory({ status: "error", data: null }); });
    return () => { active = false; };
  }, [season, round]);

  const data = story.status === "ready" ? story.data : null;
  const ids = data?.story.drivers ?? [];

  useEffect(() => {
    if (!data) return;
    setFocus(data.story.drivers.slice(0, DEFAULT_FOCUS));
    setGapA(data.story.drivers[0] ?? "");
    setGapB(data.story.drivers[1] ?? "");
  }, [data]);

  const styles = useMemo(() => (data ? lineStyles(focus, data.drivers) : {}), [data, focus]);

  const positionRows = useMemo(() => {
    if (!data) return [];
    return data.story.laps.map((lap, i) => {
      const row = { lap };
      for (const id of focus) row[id] = data.story.positions[id]?.[i] ?? null;
      return row;
    });
  }, [data, focus]);

  const positionTicks = useMemo(() => Array.from({ length: Math.max(data?.drivers.length ?? 0, 2) }, (_, i) => i + 1), [data]);

  const gapRows = useMemo(() => {
    if (!data || !gapA || !gapB) return [];
    return data.story.laps.map((lap, i) => {
      const a = data.story.gaps[gapA]?.[i];
      const b = data.story.gaps[gapB]?.[i];
      return { lap, delta: a == null || b == null ? null : Math.round((b - a) * 1000) / 1000 };
    });
  }, [data, gapA, gapB]);

  const finalDelta = [...gapRows].reverse().find((r) => r.delta !== null)?.delta;
  const nameOf = (id) => labelFor(data?.drivers.find((d) => d.driverId === id));
  const toggle = (id) => setFocus((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  if (races === null) return <Spinner />;
  if (!races.length) return <Empty icon="📈" msg={`No completed races in ${season} yet`} />;

  const raceOptions = races.map((r) => ({ value: r.round, label: `R${r.round} · ${gpName(r.raceName)}` }));
  const driverOptions = ids.map((id) => ({ value: id, label: `${nameOf(id)} (P${data.drivers.find((d) => d.driverId === id)?.finalPosition ?? "—"})` }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end", background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
        <Select label="Race" value={round} onChange={setRound} options={raceOptions} />
      </div>

      {story.status === "loading" && <Spinner />}
      {story.status === "error" && <Empty icon="⚠️" msg="The race story could not be loaded right now." />}
      {story.status === "unavailable" && <Empty icon="📈" msg="Lap-by-lap timing is not available for this race." />}

      {data && (
        <>
          <RecapCard season={season} round={round} />
          <PodiumModelCard season={season} round={round} />

          <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <SecLabel>Position by lap</SecLabel>
              <ShareButton path={`/share/race/${season}/${round}`} label="Share race card" accent="#27F4D2" />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "6px 0 14px" }}>
              {ids.map((id) => {
                const team = data.drivers.find((d) => d.driverId === id)?.constructorId;
                return <Chip key={id} active={focus.includes(id)} color={col(team)} label={labelFor(data.drivers.find((d) => d.driverId === id))} onClick={() => toggle(id)} />;
              })}
            </div>
            <div style={{ width: "100%", height: isMobile ? 300 : 380 }}>
              <ResponsiveContainer>
                <LineChart data={positionRows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                  <XAxis dataKey="lap" stroke="#666" tick={{ fontSize: 11 }} label={{ value: "Lap", position: "insideBottom", offset: -2, fill: "#666", fontSize: 11 }} />
                  <YAxis reversed domain={[1, Math.max(data.drivers.length, 2)]} ticks={positionTicks} allowDecimals={false} stroke="#666" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#0c0c0c", border: "1px solid #2a2a2a", fontSize: 12 }} labelFormatter={(v) => `Lap ${v}`} />
                  {focus.map((id) => (
                    <Line key={id} type="monotone" dataKey={id} name={nameOf(id)} dot={false} strokeWidth={2} connectNulls={false} stroke={styles[id]?.stroke} strokeDasharray={styles[id]?.strokeDasharray} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
            <SecLabel>Gap between two drivers</SecLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end", margin: "6px 0 14px" }}>
              <Select label="Driver A" value={gapA} onChange={setGapA} options={driverOptions} />
              <Select label="Driver B" value={gapB} onChange={setGapB} options={driverOptions} />
            </div>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 10 }}>
              {finalDelta === undefined
                ? "No shared timing for these two drivers."
                : finalDelta === 0
                  ? `${nameOf(gapA)} and ${nameOf(gapB)} finished level on time.`
                  : `${finalDelta > 0 ? nameOf(gapA) : nameOf(gapB)} finished ${Math.abs(finalDelta).toFixed(3)} s ahead of ${finalDelta > 0 ? nameOf(gapB) : nameOf(gapA)} on race time.`}
            </div>
            <div style={{ width: "100%", height: isMobile ? 260 : 320 }}>
              <ResponsiveContainer>
                <LineChart data={gapRows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                  <XAxis dataKey="lap" stroke="#666" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#666" tick={{ fontSize: 11 }} label={{ value: "seconds", angle: -90, position: "insideLeft", fill: "#666", fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#444" />
                  <Tooltip contentStyle={{ background: "#0c0c0c", border: "1px solid #2a2a2a", fontSize: 12 }} labelFormatter={(v) => `Lap ${v}`} formatter={(v) => [`${Math.abs(v).toFixed(3)} s ${v > 0 ? `· ${nameOf(gapA)} ahead` : v < 0 ? `· ${nameOf(gapB)} ahead` : ""}`, "Gap"]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={() => `${nameOf(gapA)} vs ${nameOf(gapB)} (above 0: ${nameOf(gapA)} ahead)`} />
                  <Line type="monotone" dataKey="delta" dot={false} strokeWidth={2} stroke="#27F4D2" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 10, color: "#444", marginTop: 8 }}>Gaps use cumulative lap times, so they include pit stops and grid-to-flag time.</div>
          </div>
        </>
      )}
    </div>
  );
}
