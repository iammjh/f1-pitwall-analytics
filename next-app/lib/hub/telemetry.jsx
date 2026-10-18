import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, ComposedChart, CartesianGrid } from "recharts";
import { getTelemetryPresentation } from "../live-telemetry";
import { DEFAULT_SEASON } from "../seasons";
import { Empty, Spinner, apiFetch, mono } from "./common";
import { formatEventDateTime } from "./live";


export function TelemetryMetricCard({ label, value, unit, color }) {
  return (
    <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
      <p style={{ fontSize: 10, color: "#555", textTransform: "uppercase", marginBottom: 8, letterSpacing: 1 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 700, color: color || "#fff", ...mono }}>{value}</p>
      <p style={{ fontSize: 10, color: "#444", marginTop: 4 }}>{unit}</p>
    </div>
  );
}


export function TelemetryPage({ season = DEFAULT_SEASON, isMobile = false }) {
  const [telemetryData, setTelemetryData] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState("VER");
  const [currentMetrics, setCurrentMetrics] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [availableSessions, setAvailableSessions] = useState([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState("");

  // Load available sessions for the season
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSelectedSessionKey("");
    setAvailableSessions([]);
    setPayload(null); setTelemetryData([]); setCurrentMetrics(null);

    const loadSessions = async () => {
      try {
        const res = await fetch(`/api/sessions?season=${encodeURIComponent(season)}`);
        if (!res.ok) {
          const problem = await res.json().catch(() => ({}));
          throw new Error(problem.error || "Failed to load session list");
        }
        const list = await res.json();
        if (!active) return;

        const now = new Date();
        const sorted = (Array.isArray(list) ? list : [])
          .filter(s => s.session_key && s.location && s.date_start && new Date(s.date_start) <= now)
          .sort((a, b) => new Date(b.date_start || 0) - new Date(a.date_start || 0));

        setAvailableSessions(sorted);

        // Default to the first session (latest completed/active one)
        if (sorted.length > 0) {
          setSelectedSessionKey(String(sorted[0].session_key));
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load session list from OpenF1", err);
        if (active) {
          setAvailableSessions([]);
          setSelectedSessionKey("");
          setError(err?.message || "Failed to load session list");
          setLoading(false);
        }
      }
    };

    loadSessions();
    return () => { active = false; };
  }, [season]);

  // Load telemetry when selectedSessionKey or selectedDriver changes
  useEffect(() => {
    if (availableSessions.length > 0 && !selectedSessionKey) return;

    let active = true;
    setLoading(true);

    const loadTelemetry = async () => {
      try {
        const keyQuery = selectedSessionKey ? `&sessionKey=${selectedSessionKey}` : "";
        const data = await apiFetch(`/api/telemetry?season=${encodeURIComponent(season)}&driver=${encodeURIComponent(selectedDriver)}${keyQuery}`, 15000);
        if (!active) return;
        setPayload(data);
        setDrivers(data.drivers || []);
        setTelemetryData(data.samples || []);
        setCurrentMetrics(data.currentMetrics || null);
        setError(null);
        setLoading(false);

        if (data.selectedDriver?.code && data.selectedDriver.code !== selectedDriver) {
          setSelectedDriver(data.selectedDriver.code);
        }
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Failed to load telemetry data");
        setLoading(false);
      }
    };

    loadTelemetry();
    const poller = setInterval(loadTelemetry, 45000);
    return () => {
      active = false;
      clearInterval(poller);
    };
  }, [season, selectedDriver, selectedSessionKey, availableSessions.length]);

  if (loading) return <Spinner />;
  if (error) return <Empty icon="⚠️" msg={error} />;

  const sessionContext = payload?.session || null;
  const usingEstimatedTelemetry = payload?.source === "lap-data";
  const telemetryPresentation = getTelemetryPresentation(payload?.source);
  const { sourceLabel, speedLabel, speedChartTitle, axisKey, axisLabel } = telemetryPresentation;
  const drsReported = telemetryData.some((sample) => sample.drs !== null && sample.drs !== undefined);
  const drsOpenCount = telemetryData.filter((sample) => sample.drs === 100).length;
  const telemetryContextRows = [
    ["Session", sessionContext?.sessionName || "—"],
    ["Circuit", sessionContext?.circuit || "—"],
    ["Country", sessionContext?.country || "—"],
    ["Session Start", formatEventDateTime(sessionContext?.startTime)],
    ["Data Source", sourceLabel],
  ];

  return (
    <div>
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, marginBottom: 20 }}>
        {availableSessions.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>Select GP & Session</div>
            <select
              value={selectedSessionKey}
              onChange={e => {
                setSelectedSessionKey(e.target.value);
                setLoading(true);
              }}
              style={{ background: "#111", border: "1px solid #1e1e1e", color: "#fff", padding: "8px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", width: "100%" }}
            >
              {availableSessions.map(s => {
                const dateStr = s.date_start ? new Date(s.date_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : "";
                return (
                  <option key={s.session_key} value={s.session_key}>
                    {s.location} GP ({s.session_name}){dateStr ? ` · ${dateStr}` : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>Select Driver</div>
          <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)} style={{ background: "#111", border: "1px solid #1e1e1e", color: "#fff", padding: "8px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", ...mono, width: "100%" }}>
            {drivers.map(d => <option key={d.code} value={d.code}>{d.name} ({d.code})</option>)}
          </select>
        </div>
      </div>

      <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1.4, fontWeight: 700, marginBottom: 8 }}>Telemetry Session</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.1, marginBottom: 6 }}>
              {sessionContext?.meetingName || sessionContext?.circuit || "Telemetry Feed"}
            </div>
            <div style={{ fontSize: 12, color: "#777" }}>
              {[sessionContext?.sessionName, sessionContext?.circuit, sessionContext?.country].filter(Boolean).join(" • ")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{
              display: "inline-flex",
              padding: "6px 10px",
              borderRadius: 999,
              border: `1px solid ${usingEstimatedTelemetry ? "#FFD70033" : "#27F4D233"}`,
              background: usingEstimatedTelemetry ? "#FFD70014" : "#27F4D214",
              color: usingEstimatedTelemetry ? "#FFD700" : "#27F4D2",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1.1,
            }}>
              {sourceLabel}
            </div>
            <div style={{
              display: "inline-flex",
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #1f1f1f",
              background: "#111",
              color: "#aaa",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1.1,
            }}>
              Driver · {payload?.selectedDriver?.code || selectedDriver}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 16 }}>
          {telemetryContextRows.map(([label, value]) => (
            <div key={label} style={{ background: "#111", border: "1px solid #1d1d1d", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 5 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#fff", fontWeight: 700, wordBreak: "break-word" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {payload?.derivedMetricsNotice && (
        <div style={{ marginBottom: 20, padding: "10px 12px", borderRadius: 10, background: "#FFD70010", border: "1px solid #FFD70022", fontSize: 11, color: "#C9B46B", lineHeight: 1.5 }}>
          <strong style={{ color: "#FFD700" }}>Modeled metrics:</strong> {payload.derivedMetricsNotice}
        </div>
      )}

      {currentMetrics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 24 }}>
          <TelemetryMetricCard label={speedLabel} value={currentMetrics.speed.toFixed(0)} unit="km/h" color="#E10600" />
          <TelemetryMetricCard label="Throttle" value={currentMetrics.throttle.toFixed(0)} unit="%" color="#27F4D2" />
          <TelemetryMetricCard label="Brake" value={currentMetrics.braking.toFixed(0)} unit="%" color="#FF6B6B" />
          <TelemetryMetricCard label="Gear" value={currentMetrics.gear} unit="" color="#FFD700" />
          <TelemetryMetricCard label="RPM" value={Math.round(currentMetrics.rpm / 100)} unit="x100" color="#4AFF00" />
          <TelemetryMetricCard label="Position" value={currentMetrics.position ?? "—"} unit="" color="#64C4FF" />
          <TelemetryMetricCard label="Lap" value={currentMetrics.lap ?? "—"} unit="" color="#a855f7" />
        </div>
      )}

      <p style={{ color: "#888", fontSize: 11, marginBottom: 12 }}>Chart horizontal axis: {axisLabel}.</p>
      {/* Charts Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 20, marginBottom: 24 }}>
        {/* Speed Chart */}
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>{speedChartTitle}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={telemetryData}>
              <CartesianGrid stroke="#1a1a1a" />
              <XAxis dataKey={axisKey} name={axisLabel} tickFormatter={value => usingEstimatedTelemetry ? String(value) : String(value || "").slice(11, 19)} stroke="#666" tick={{ fontSize: 11 }} />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0c0c0c", border: "1px solid #E10600", borderRadius: 4, color: "#fff" }} />
              <Line type="monotone" dataKey="speed" stroke="#E10600" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Throttle & Brake */}
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Throttle & Brake</h3>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={telemetryData}>
              <CartesianGrid stroke="#1a1a1a" />
              <XAxis dataKey={axisKey} name={axisLabel} tickFormatter={value => usingEstimatedTelemetry ? String(value) : String(value || "").slice(11, 19)} stroke="#666" tick={{ fontSize: 11 }} />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0c0c0c", border: "1px solid #E10600", borderRadius: 4, color: "#fff" }} />
              <Line type="monotone" dataKey="throttle" stroke="#27F4D2" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="braking" stroke="#FF6B6B" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Gear Selection */}
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Gear Selection</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={telemetryData}>
              <CartesianGrid stroke="#1a1a1a" />
              <XAxis dataKey={axisKey} name={axisLabel} tickFormatter={value => usingEstimatedTelemetry ? String(value) : String(value || "").slice(11, 19)} stroke="#666" tick={{ fontSize: 11 }} />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0c0c0c", border: "1px solid #E10600", borderRadius: 4, color: "#fff" }} />
              <Bar dataKey="gear" fill="#27F4D2" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* RPM Curve */}
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>Engine RPM</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={telemetryData}>
              <CartesianGrid stroke="#1a1a1a" />
              <XAxis dataKey={axisKey} name={axisLabel} tickFormatter={value => usingEstimatedTelemetry ? String(value) : String(value || "").slice(11, 19)} stroke="#666" tick={{ fontSize: 11 }} />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0c0c0c", border: "1px solid #E10600", borderRadius: 4, color: "#fff" }} />
              <Line type="monotone" dataKey="rpm" stroke="#7C3AED" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* DRS Status */}
      <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 8, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 }}>DRS Status</h3>
        {!drsReported && (
          <div style={{ fontSize: 13, color: "#777", padding: "48px 0", textAlign: "center" }}>
            OpenF1 has no DRS reading for this session. From 2026 the cars use active aero instead of the DRS flap,
            and the feed does not publish that state, so there is nothing to chart.
          </div>
        )}
        {drsReported && drsOpenCount === 0 && (
          <div style={{ fontSize: 12, color: "#777", marginBottom: 8 }}>DRS stayed closed in this window. It only opens on straights inside a detection zone.</div>
        )}
        {drsReported && (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={telemetryData}>
              <CartesianGrid stroke="#1a1a1a" />
              <XAxis dataKey={axisKey} name={axisLabel} tickFormatter={value => usingEstimatedTelemetry ? String(value) : String(value || "").slice(11, 19)} stroke="#666" tick={{ fontSize: 11 }} />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#0c0c0c", border: "1px solid #E10600", borderRadius: 4, color: "#fff" }} formatter={v => v > 0 ? "OPEN" : "CLOSED"} />
              <Bar dataKey="drs" fill="#4AFF00" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
