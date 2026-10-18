import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSeasonRaces } from "../jolpica-client";
import { formatGrandPrixName as gpName, getTeamColor as col } from "../f1-display";
import { buildReplay, carsAt } from "../race-replay";
import { CIRCUIT_TRACK_TYPES, TRACK_PATHS } from "./track-data";
import { Empty, SecLabel, Spinner, apiFetch, mono } from "./common";

const SPEEDS = [1, 2, 5, 10, 30, 60];
// Labels for every car bunch up on the grid, so only the front of the field is named on the track.
const LABELLED_POSITIONS = 10;

function isCompleted(race, now) {
  const start = new Date(`${race.date}T${race.time || "23:59:59Z"}`);
  return !Number.isNaN(start.getTime()) && start < now;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

/** Race clock as h:mm:ss. */
function raceClock(seconds) {
  const total = Math.floor(seconds);
  return `${Math.floor(total / 3600)}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function gapLabel(car, index) {
  if (car.status === "retired") return "OUT";
  if (index === 0) return car.status === "finished" ? "WINNER" : "LEADER";
  if (car.lapsDown > 0) return `+${car.lapsDown} LAP${car.lapsDown > 1 ? "S" : ""}`;
  return `+${car.gapToLeaderSec.toFixed(1)}s`;
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
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

function TrackMap({ path, cars, drivers }) {
  const pathRef = useRef(null);
  const [length, setLength] = useState(0);

  useEffect(() => {
    if (pathRef.current) setLength(pathRef.current.getTotalLength());
  }, [path]);

  const points = length && pathRef.current
    ? cars.map((car) => ({ car, point: pathRef.current.getPointAtLength(car.loopFraction * length) }))
    : [];

  return (
    <svg viewBox="-20 -20 540 540" preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto", maxHeight: 560 }}>
      <path d={path} fill="none" stroke="#161616" strokeWidth={26} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path} fill="none" stroke="#3a3a3a" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <path ref={pathRef} d={path} fill="none" stroke="none" />
      {[...points].reverse().map(({ car, point }) => {
        const driver = drivers.get(car.id);
        const color = col(driver?.constructorId);
        const faded = car.status !== "racing";
        return (
          <g key={car.id} opacity={faded ? 0.45 : 1}>
            <circle cx={point.x} cy={point.y} r={car.position <= 3 ? 8 : 6} fill={color} stroke="#000" strokeWidth={1.5} />
            {car.position <= LABELLED_POSITIONS && (
              <text x={point.x + 10} y={point.y + 4} fill={color} fontSize={13} fontWeight={700} fontFamily="monospace" style={{ paintOrder: "stroke", stroke: "#000", strokeWidth: 3 }}>
                {driver?.code || car.id}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function RaceReplayPage({ season, isMobile = false }) {
  const [races, setRaces] = useState(null);
  const [round, setRound] = useState("");
  const [story, setStory] = useState({ status: "idle", data: null });
  const [clockSec, setClockSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const clockRef = useRef(0);

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

  useEffect(() => {
    if (!round) return;
    let active = true;
    setStory({ status: "loading", data: null });
    apiFetch(`/api/race-story?season=${encodeURIComponent(season)}&round=${encodeURIComponent(round)}`, 60 * 60 * 1000)
      .then((data) => { if (active) setStory({ status: data.available ? "ready" : "unavailable", data }); })
      .catch(() => { if (active) setStory({ status: "error", data: null }); });
    return () => { active = false; };
  }, [season, round]);

  const payload = story.status === "ready" ? story.data : null;
  const replay = useMemo(() => (payload ? buildReplay(payload.story) : null), [payload]);
  const drivers = useMemo(() => new Map((payload?.drivers ?? []).map((d) => [d.driverId, d])), [payload]);
  const { cars, leaderLap } = useMemo(() => (replay ? carsAt(replay, clockSec) : { cars: [], leaderLap: 0 }), [replay, clockSec]);
  const trackType = payload?.circuitId ? CIRCUIT_TRACK_TYPES[payload.circuitId] : null;
  const path = trackType ? TRACK_PATHS[trackType] : null;

  // Start each race from the grid, paused.
  useEffect(() => {
    clockRef.current = 0;
    setClockSec(0);
    setPlaying(false);
  }, [payload]);

  // Playback advances the race clock by real time times the chosen speed.
  useEffect(() => {
    if (!playing || !replay) return undefined;
    let frame;
    let last = performance.now();
    const tick = (now) => {
      const elapsed = (now - last) / 1000;
      last = now;
      const next = Math.min(replay.durationSec, clockRef.current + elapsed * speed);
      clockRef.current = next;
      setClockSec(next);
      if (next >= replay.durationSec) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, replay]);

  const seek = (value) => {
    const next = Number(value);
    clockRef.current = next;
    setClockSec(next);
  };

  if (races === null) return <Spinner />;
  if (!races.length) return <Empty icon="🏁" msg={`No completed races in ${season} yet`} />;

  const raceOptions = races.map((r) => ({ value: String(r.round), label: `R${r.round} · ${gpName(r.raceName)}` }));
  const raceName = payload ? gpName(payload.raceName) : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end", background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18 }}>
        <Select label="Race" value={String(round)} onChange={setRound} options={raceOptions} />
      </div>

      {story.status === "loading" && <Spinner />}
      {story.status === "error" && <Empty icon="⚠️" msg="The race replay could not be loaded right now." />}
      {story.status === "unavailable" && <Empty icon="🏁" msg="Lap-by-lap timing is not available for this race." />}

      {payload && replay && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 300px", gap: 16, alignItems: "start" }}>
          <div style={{ background: "#080808", border: "1px solid #1a1a1a", borderRadius: 12, padding: 18, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: "#E10600", letterSpacing: 2, textTransform: "uppercase", ...mono }}>{season} · {raceName}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", ...mono }}>
                  LAP <span style={{ color: "#E10600" }}>{leaderLap}</span>
                  <span style={{ color: "#555", fontSize: 16 }}> / {replay.laps}</span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#888", ...mono }}>{raceClock(clockSec)} / {raceClock(replay.durationSec)}</div>
            </div>

            {path ? (
              <TrackMap path={path} cars={cars} drivers={drivers} />
            ) : (
              <div style={{ fontSize: 12, color: "#777", padding: "40px 0", textAlign: "center" }}>
                No track map is drawn for this venue yet. The running order and gaps are still shown.
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => {
                  if (clockSec >= replay.durationSec) {
                    clockRef.current = 0;
                    setClockSec(0);
                    setPlaying(true);
                  } else {
                    setPlaying((p) => !p);
                  }
                }}
                aria-label={playing ? "Pause" : "Play"}
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 800, border: "1px solid #E10600aa", background: playing ? "#E1060022" : "#E10600", color: "#fff", minWidth: 96 }}
              >
                {playing ? "❚❚ Pause" : clockSec >= replay.durationSec ? "↺ Replay" : "▶ Play"}
              </button>
              <div style={{ display: "flex", gap: 4 }}>
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSpeed(s)}
                    aria-pressed={speed === s}
                    style={{ padding: "6px 9px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, ...mono, border: `1px solid ${speed === s ? "#E10600" : "#222"}`, background: speed === s ? "#E1060022" : "transparent", color: speed === s ? "#fff" : "#777" }}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={replay.durationSec}
              step={1}
              value={clockSec}
              onChange={(e) => seek(e.target.value)}
              aria-label="Race time"
              style={{ width: "100%", marginTop: 12, accentColor: "#E10600" }}
            />
          </div>

          <div style={{ background: "#0b0b0b", border: "1px solid #1a1a1a", borderRadius: 12, padding: 16, minWidth: 0 }}>
            <SecLabel>Live order</SecLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {cars.map((car, index) => {
                const driver = drivers.get(car.id);
                const color = col(driver?.constructorId);
                return (
                  <div
                    key={car.id}
                    style={{ display: "grid", gridTemplateColumns: "26px 4px 1fr auto", gap: 10, alignItems: "center", padding: "7px 6px", borderRadius: 6, opacity: car.status === "racing" ? 1 : 0.5 }}
                  >
                    <span style={{ ...mono, fontSize: 12, color: "#888", textAlign: "right" }}>{car.position}</span>
                    <span style={{ width: 4, height: 24, borderRadius: 2, background: color }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", ...mono }}>{driver?.code || car.id}</div>
                      <div style={{ fontSize: 10, color: "#666", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{driver?.constructorName || ""}</div>
                    </div>
                    <span style={{ ...mono, fontSize: 11, color: car.status === "racing" && index > 0 ? "#bbb" : "#666" }}>{gapLabel(car, index)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
