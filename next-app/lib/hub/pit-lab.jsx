import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchSeasonRaces } from "../jolpica-client";
import { formatGrandPrixName as gpName } from "../f1-display";
import { MAX_PLANNED_STOPS, normaliseStops, segmentsFor, simulateStrategy } from "../pit-strategy";
import { Empty, SecLabel, Spinner, apiFetch, mono } from "./common";

const COMPOUND_COLORS = {
  SOFT: "#E8002D",
  MEDIUM: "#FFD700",
  HARD: "#d4d4d4",
  INTERMEDIATE: "#43b02a",
  WET: "#2f7fff",
  UNKNOWN: "#666",
};
const DEFAULT_DRIVER = "VER";

function isCompleted(race, now) {
  const start = new Date(`${race.date}T${race.time || "23:59:59Z"}`);
  return !Number.isNaN(start.getTime()) && start < now;
}

function compoundColor(compound) {
  return COMPOUND_COLORS[compound] ?? COMPOUND_COLORS.UNKNOWN;
}

function StintBar({ segments, totalLaps }) {
  return (
    <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", border: "1px solid #1a1a1a" }}>
      {segments.map((seg, i) => (
        <div
          key={i}
          title={`${seg.compound} · ${seg.laps} lap${seg.laps === 1 ? "" : "s"}`}
          style={{
            flex: `${seg.laps} 0 0`, background: compoundColor(seg.compound), color: seg.compound === "MEDIUM" || seg.compound === "HARD" ? "#000" : "#fff",
            fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap",
          }}
        >
          {seg.laps / totalLaps > 0.12 ? `${seg.compound[0]} · ${seg.laps}` : ""}
        </div>
      ))}
    </div>
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

function StopEditor({ stops, totalLaps, compounds, startCompound, onChange }) {
  const update = (index, patch) => onChange(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const remove = (index) => onChange(stops.filter((_, i) => i !== index));

  function add() {
    // Put the new stop in the middle of the longest current stint, on a different compound from the one before it.
    const segments = segmentsFor({ compound: startCompound }, stops, totalLaps);
    let from = 1;
    let best = { laps: -1, from: 1, index: 0 };
    segments.forEach((seg, index) => {
      if (seg.laps > best.laps) best = { laps: seg.laps, from, index };
      from += seg.laps;
    });
    const lap = Math.max(1, Math.min(totalLaps - 1, best.from + Math.floor(best.laps / 2) - 1));
    const previous = stops.filter((s) => s.lap < lap).at(-1)?.compound ?? startCompound;
    const compound = compounds.find((c) => c !== previous) ?? compounds[0];
    onChange(normaliseStops([...stops, { lap, compound }], totalLaps));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {stops.length === 0 && <div style={{ fontSize: 12, color: "#666" }}>No stops: a one-stop or no-stop plan is shown as the start tyre all race.</div>}
      {stops.map((stop, index) => (
        <div key={index} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 8, padding: 10 }}>
          <span style={{ ...mono, fontSize: 12, color: "#888", minWidth: 60 }}>Stop {index + 1}</span>
          <input
            type="range"
            min={1}
            max={totalLaps - 1}
            value={stop.lap}
            onChange={(e) => update(index, { lap: Number(e.target.value) })}
            aria-label={`Stop ${index + 1} lap`}
            style={{ flex: "1 1 160px", accentColor: "#E10600" }}
          />
          <span style={{ ...mono, fontSize: 13, minWidth: 56 }}>Lap {stop.lap}</span>
          <select
            value={stop.compound}
            onChange={(e) => update(index, { compound: e.target.value })}
            aria-label={`Stop ${index + 1} compound`}
            style={{ background: "#000", border: "1px solid #1a1a1a", borderRadius: 6, padding: "6px 10px", color: "#fff", fontSize: 12 }}
          >
            {compounds.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={() => remove(index)} style={{ background: "transparent", border: "1px solid #2a2a2a", borderRadius: 6, color: "#888", padding: "5px 10px", cursor: "pointer", fontSize: 12 }}>
            Remove
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={add}
          disabled={stops.length >= MAX_PLANNED_STOPS || totalLaps < 3 || compounds.length === 0}
          style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: "1px solid #E10600aa", background: "#E1060014", color: "#fff" }}
        >
          Add stop
        </button>
      </div>
    </div>
  );
}

export function PitLabPage({ season, isMobile = false }) {
  const [races, setRaces] = useState(null);
  const [round, setRound] = useState("");
  const [driver, setDriver] = useState(DEFAULT_DRIVER);
  const [lab, setLab] = useState({ status: "idle", data: null, error: null });
  const [planned, setPlanned] = useState([]);

  useEffect(() => {
    let active = true;
    setRaces(null);
    fetchSeasonRaces(season, { limit: 40, fetcher: apiFetch })
      .then((list) => {
        if (!active) return;
        const done = list.filter((r) => isCompleted(r, new Date()));
        setRaces(done);
        setRound(done.length ? done[done.length - 1].round : "");
      })
      .catch(() => { if (active) setRaces([]); });
    return () => { active = false; };
  }, [season]);

  const raceDate = races?.find((r) => String(r.round) === String(round))?.date ?? null;

  useEffect(() => {
    if (!raceDate) return;
    let active = true;
    setLab({ status: "loading", data: null, error: null });
    const url = `/api/pit-lab?season=${encodeURIComponent(season)}&date=${encodeURIComponent(raceDate)}&driver=${encodeURIComponent(driver)}`;
    apiFetch(url, 60 * 60 * 1000)
      .then((data) => { if (active) setLab({ status: data.available ? "ready" : "unavailable", data, error: null }); })
      .catch((err) => { if (active) setLab({ status: "error", data: null, error: err.message }); });
    return () => { active = false; };
  }, [season, raceDate, driver]);

  const data = lab.data;
  const roster = useMemo(() => data?.roster ?? [], [data]);

  // A driver from the previous race may not have started this one: fall back to the first driver in the roster.
  useEffect(() => {
    if (roster.length && !roster.some((d) => d.code === driver)) setDriver(roster[0].code);
  }, [roster, driver]);

  useEffect(() => {
    if (data?.available) setPlanned(data.actualStops.map((s) => ({ ...s })));
  }, [data]);

  const ready = lab.status === "ready" ? data : null;
  const totalLaps = ready?.totalLaps ?? 0;
  const compounds = useMemo(() => (ready ? Object.keys(ready.model.offsetByCompound) : []), [ready]);
  const stops = useMemo(() => (ready ? normaliseStops(planned, totalLaps) : []), [ready, planned, totalLaps]);

  const comparison = useMemo(() => {
    if (!ready) return null;
    const actual = simulateStrategy(ready.model, ready.start, ready.actualStops);
    const plan = simulateStrategy(ready.model, ready.start, stops);
    const deltaSec = plan.totalSec - actual.totalSec;
    const rows = actual.laps.map((lap, i) => ({
      lap: lap.lap,
      recorded: ready.laps[i]?.durationSec ?? null,
      plan: plan.laps[i]?.sec ?? null,
    }));
    return { deltaSec, rows, planSegments: segmentsFor(ready.start, stops, ready.totalLaps), actualSegments: segmentsFor(ready.start, ready.actualStops, ready.totalLaps) };
  }, [ready, stops]);

  if (races === null) return <Spinner />;
  if (!races.length) return <Empty icon="🛞" msg={`No completed races in ${season} yet`} />;

  const raceOptions = races.map((r) => ({ value: String(r.round), label: `R${r.round} · ${gpName(r.raceName)}` }));
  const driverOptions = roster.map((d) => ({ value: d.code, label: `${d.code} · ${d.name}` }));
  const delta = comparison?.deltaSec ?? 0;
  const deltaText = Math.abs(delta) < 0.05
    ? "Same as the real strategy"
    : `${Math.abs(delta).toFixed(1)} s ${delta < 0 ? "faster" : "slower"} than the real strategy`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end", background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
        <Select label="Race" value={String(round)} onChange={setRound} options={raceOptions} />
        {roster.length > 0 && <Select label="Driver" value={driver} onChange={setDriver} options={driverOptions} />}
      </div>

      {lab.status === "loading" && <Spinner />}
      {lab.status === "error" && <Empty icon="⚠️" msg={lab.error || "The pit lab could not be loaded right now."} />}
      {lab.status === "unavailable" && <Empty icon="🛞" msg="Stint and lap data are not available for this race and driver." />}

      {ready && (
        <>
          {ready.lowConfidenceCompounds.length > 0 && (
            <div style={{ background: "#2a2000", border: "1px solid #FFD70055", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#e8d27a" }}>
              Few clean laps on {ready.lowConfidenceCompounds.join(", ")} in this race, so its wear rate is a rough guess.
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20 }}>
            <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
              <SecLabel>Real strategy</SecLabel>
              <StintBar segments={comparison.actualSegments} totalLaps={totalLaps} />
              <div style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
                {ready.actualStops.length ? ready.actualStops.map((s) => `Lap ${s.lap} → ${s.compound}`).join(" · ") : "No stops"}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Recorded race time {formatRaceTime(ready.actualTotalSec)}</div>
            </div>

            <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
              <SecLabel>Your plan</SecLabel>
              <StintBar segments={comparison.planSegments} totalLaps={totalLaps} />
              <div style={{ marginTop: 12, fontSize: 18, fontWeight: 700, color: Math.abs(delta) < 0.05 ? "#ccc" : delta < 0 ? "#27F4D2" : "#ff6b6b" }}>
                {deltaText}
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                Estimated race time {formatRaceTime(ready.actualTotalSec + delta)}
              </div>
            </div>
          </div>

          <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
            <SecLabel>Change the stops</SecLabel>
            {compounds.length === 0
              ? <div style={{ fontSize: 12, color: "#666" }}>This race has no compound data to plan with.</div>
              : <StopEditor stops={stops} totalLaps={totalLaps} compounds={compounds} startCompound={ready.start.compound} onChange={setPlanned} />}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setPlanned(ready.actualStops.map((s) => ({ ...s })))}
                style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, border: "1px solid #2a2a2a", background: "transparent", color: "#ccc" }}
              >
                Reset to real strategy
              </button>
            </div>
          </div>

          <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
            <SecLabel>Lap times: recorded vs your plan</SecLabel>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={comparison.rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#1a1a1a" strokeDasharray="3 3" />
                  <XAxis dataKey="lap" stroke="#555" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#555" tick={{ fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) => formatLap(v)} width={70} />
                  <Tooltip
                    contentStyle={{ background: "#000", border: "1px solid #222", fontSize: 12 }}
                    formatter={(value, name) => [value == null ? "—" : formatLap(value), name]}
                    labelFormatter={(lap) => `Lap ${lap}`}
                  />
                  <Line type="monotone" dataKey="recorded" name="Recorded" stroke="#777" strokeWidth={1.5} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="plan" name="Your plan (model)" stroke="#E10600" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
            <SecLabel>How the model sees this race</SecLabel>
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 10 }}>Pit loss {ready.model.pitLossSec.toFixed(1)} s, from the out-lap of the real stops.</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {Object.keys(ready.model.offsetByCompound).map((c) => (
                <div key={c} style={{ background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 8, padding: 10, fontSize: 12, color: "#999" }}>
                  <div style={{ color: compoundColor(c), fontWeight: 700, marginBottom: 4 }}>{c}</div>
                  <div>Wear +{ready.model.slopeByCompound[c].toFixed(3)} s per tyre-lap</div>
                  <div style={{ color: "#666", fontSize: 11 }}>{wearSourceLabel(ready, c)}</div>
                  <div style={{ fontSize: 11, color: ready.circuitWear?.[c] ? "#27F4D2" : "#555", marginTop: 4 }}>
                    {circuitWearLabel(ready, c)}
                  </div>
                  <div>Pace {ready.model.offsetByCompound[c] >= 0 ? "+" : ""}{ready.model.offsetByCompound[c].toFixed(2)} s vs the field</div>
                  <div>{ready.model.samplesByCompound[c]} clean laps used</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 6 }}>Published wear at this circuit</div>
              {Object.keys(ready.circuitWear ?? {}).length === 0 ? (
                <div style={{ fontSize: 12, color: "#666" }}>No compound here has three races of history yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, ...mono }}>
                  <thead>
                    <tr style={{ color: "#555", textAlign: "left" }}>
                      <th style={{ padding: "6px 8px", fontWeight: 400 }}>Compound</th>
                      <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Median s per tyre-lap</th>
                      <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Range</th>
                      <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>Races</th>
                      <th style={{ padding: "6px 8px", fontWeight: 400, textAlign: "right" }}>In this race</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(ready.circuitWear).map(([c, w]) => (
                      <tr key={c} style={{ borderTop: "1px solid #161616", color: "#ccc" }}>
                        <td style={{ padding: "6px 8px", color: compoundColor(c), fontWeight: 700 }}>{c}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{w.slopeSecPerLap.toFixed(3)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{w.slopeRange[0].toFixed(3)} to {w.slopeRange[1].toFixed(3)}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{w.races}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", color: ready.model.samplesByCompound[c] ? "#27F4D2" : "#555" }}>
                          {ready.model.samplesByCompound[c] ? "yes" : "no"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 10 }}>
              Wear is the slope of lap time against tyre age, so a compound that barely degrades can make a late stop look cheap. Check the clean-lap count before trusting a small difference.
            </div>
          </div>

          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.6 }}>
            An estimate, not a race simulator. The model fits this driver&apos;s tyre wear and fuel effect from the race itself, sets the
            base pace so the real strategy matches the recorded time, and uses the pit loss measured on the out-lap. It ignores traffic,
            safety cars, DRS, and pit-crew variation, so treat differences of a few tenths as noise.
          </div>
        </>
      )}
    </div>
  );
}

/** The circuit's published wear for a compound, across every race held there since 2023. */
function circuitWearLabel(ready, compound) {
  const wear = ready.circuitWear?.[compound];
  if (!wear) return "Circuit: not enough races yet (a compound needs three races at the circuit)";
  return `Circuit: +${wear.slopeSecPerLap.toFixed(3)} s per tyre-lap, ${wear.races} races, range ${wear.slopeRange[0].toFixed(3)} to ${wear.slopeRange[1].toFixed(3)}`;
}

/** Where a compound's wear rate came from: this race, the circuit's history, or a fixed default. */
function wearSourceLabel(ready, compound) {
  const source = ready.slopeSource?.[compound];
  if (source === "circuit") {
    const range = ready.circuitWear?.[compound]?.slopeRange;
    const races = ready.circuitWear?.[compound]?.races;
    return `Too few clean laps here, so circuit history: ${races} races${range ? `, ${range[0].toFixed(3)} to ${range[1].toFixed(3)}` : ""}`;
  }
  if (source === "default") return "Too few clean laps, and no circuit history yet: default rate";
  return "Fitted from this race";
}

function formatLap(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

function formatRaceTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds - h * 3600 - m * 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}` : `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
