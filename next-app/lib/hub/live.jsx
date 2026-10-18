import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatGrandPrixName as gpName } from "../f1-display";
import { DriverPhoto, Empty, PosBadge, SecLabel, Spinner, apiFetch, mono, pad2 } from "./common";


export const F1_TV_URL = "https://f1tv.formula1.com/";

export const F1_TV_INFO_URL = "https://www.formula1.com/en-us/subscribe-to-f1-tv";

export const F1_BROADCAST_INFO_URL = "https://www.formula1.com/en/information/f1-broadcast-information.45y3LNsT1D6VoK0ZmX8ciJ";


export function splitDriverName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}


export function formatEventDateTime(value) {
  if (!value) return "Start time unavailable";
  try {
    return new Date(value).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Start time unavailable";
  }
}


export function getLiveStatusMeta(status) {
  if (status === "live") {
    return {
      label: "Live Now",
      accent: "#E10600",
      chipBg: "#E1060014",
      chipBorder: "#E1060033",
      summary: "Official watch links and current timing snapshot",
    };
  }

  if (status === "recent") {
    return {
      label: "Recent Session",
      accent: "#FFD700",
      chipBg: "#FFD70014",
      chipBorder: "#FFD70033",
      summary: "Latest completed session with official replay/watch options",
    };
  }

  if (status === "upcoming") {
    return {
      label: "Upcoming Race",
      accent: "#27F4D2",
      chipBg: "#27F4D214",
      chipBorder: "#27F4D233",
      summary: "Countdown, official watch options, and next race planning",
    };
  }

  return {
    label: "Unavailable",
    accent: "#888",
    chipBg: "#88888814",
    chipBorder: "#88888833",
    summary: "Official links are available even when live timing is offline",
  };
}


export function CountdownBlocks({ countdown, accent = "#27F4D2" }) {
  if (!countdown) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
      {[
        ["Days", countdown.d],
        ["Hours", countdown.h],
        ["Mins", countdown.m],
        ["Secs", countdown.s],
      ].map(([label, value]) => (
        <div key={label} style={{ background: "#111", border: `1px solid ${accent}22`, borderRadius: 10, padding: "10px 6px", textAlign: "center", minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 4, fontWeight: 600 }}>{label}</div>
          <div style={{ fontSize: "clamp(18px, 4vw, 22px)", fontWeight: 800, color: "#fff", ...mono }}>{pad2(value)}</div>
        </div>
      ))}
    </div>
  );
}


export function WatchCoverageStrip({ compact = false }) {
  const links = [
    { href: F1_TV_URL, label: "F1 TV", accent: "#E10600" },
    { href: F1_BROADCAST_INFO_URL, label: "Find Broadcaster", accent: "#27F4D2" },
    { href: F1_TV_INFO_URL, label: "F1 TV Plans", accent: "#FFD700" },
  ];

  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      gap: compact ? 8 : 10,
      alignItems: "center",
    }}>
      {links.map((link) => {
        const isPrimary = link.accent === "#E10600";
        return (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: compact ? "9px 12px" : "10px 14px",
              borderRadius: 10,
              border: `1px solid ${link.accent}33`,
              background: isPrimary ? "#E10600" : "#111",
              color: isPrimary ? "#fff" : "#ddd",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 700,
              flex: "1 1 160px",
              justifyContent: "center",
              transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s, background 0.18s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = `0 8px 24px ${link.accent}22`;
              e.currentTarget.style.borderColor = `${link.accent}66`;
              if (!isPrimary) {
                e.currentTarget.style.background = "#161616";
                e.currentTarget.style.color = "#fff";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = `${link.accent}33`;
              if (!isPrimary) {
                e.currentTarget.style.background = "#111";
                e.currentTarget.style.color = "#ddd";
              }
            }}
          >
            {link.label}
          </a>
        );
      })}
    </div>
  );
}


export function SessionContextContent({ liveData, statusMeta, heading, subtitle, sessionLabel, locationLabel, leader }) {
  const isUpcoming = liveData.status === "upcoming";

  return (
    <>
      <div style={{ display: "inline-flex", padding: "6px 12px", borderRadius: 999, border: `1px solid ${statusMeta.chipBorder}`, background: statusMeta.chipBg, fontSize: 10, color: statusMeta.accent, textTransform: "uppercase", letterSpacing: 1.6, fontWeight: 700, marginBottom: 14 }}>
        {statusMeta.label}
      </div>
      <div style={{ fontSize: "clamp(22px, 5vw, 30px)", fontWeight: 800, marginBottom: 8, color: "#fff", lineHeight: 1.05 }}>{heading}</div>
      <div style={{ fontSize: 13, color: "#aaa", marginBottom: 8 }}>{subtitle || "Latest timing summary"}</div>
      <div style={{ fontSize: 12, color: "#666", marginBottom: 18, lineHeight: 1.6 }}>{liveData.message}</div>

      {!isUpcoming ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>
            {liveData.status === "live" ? "Live Session" : "Latest Session"}
          </div>
          <div style={{ fontSize: 12, color: "#777", marginBottom: 4, lineHeight: 1.5 }}>
            {[locationLabel, formatEventDateTime(liveData.session?.startTime)].filter(Boolean).join(" • ")}
          </div>
          {[
            ["Status", statusMeta.label],
            ["Session", sessionLabel],
            ["Leading Driver", leader?.name || "No timing leader"],
            ["Latest Lap", leader?.lastLap != null ? `${leader.lastLap.toFixed(3)}s` : "No lap yet"],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "#111", border: "1px solid #1d1d1d" }}>
              <span style={{ fontSize: 11, color: "#666", textTransform: "uppercase", letterSpacing: 1.1 }}>{label}</span>
              <span style={{ fontSize: 12, color: "#fff", fontWeight: 700, textAlign: "right" }}>{value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#777", lineHeight: 1.6 }}>
          Countdown and start time are shown in the next race panel below.
        </div>
      )}
    </>
  );
}


export function NextRaceHubCard({ race, countdown, prominent = false, embedded = false }) {
  if (!race) return null;

  const raceName = gpName(race.raceName || "Upcoming Race");
  const location = [race.locality, race.country].filter(Boolean).join(" · ");
  const startLabel = formatEventDateTime(race.startTime);

  return (
    <div style={{
      background: embedded ? "transparent" : "linear-gradient(135deg, #121212 0%, #0d0d0d 100%)",
      border: embedded ? "none" : "1px solid #27F4D233",
      borderRadius: embedded ? 0 : 14,
      padding: embedded ? 0 : (prominent ? 20 : 16),
      position: "relative",
      overflow: "hidden",
    }}>
      {!embedded ? (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #27F4D2, #27F4D255, transparent)" }} />
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: "#27F4D2", textTransform: "uppercase", letterSpacing: 1.3, fontWeight: 700, marginBottom: 4 }}>Next Grand Prix</div>
          <div style={{ fontSize: prominent ? 24 : 20, fontWeight: 800, color: "#fff", lineHeight: 1.1, marginBottom: 2 }}>{raceName}</div>
          <div style={{ fontSize: 12, color: "#888" }}>{race.circuitName || "Circuit TBA"}</div>
        </div>
        {race.round ? (
          <div style={{ padding: "6px 10px", borderRadius: 999, background: "#27F4D214", border: "1px solid #27F4D233", fontSize: 11, fontWeight: 800, color: "#27F4D2", ...mono, flexShrink: 0 }}>
            R{race.round}
          </div>
        ) : null}
      </div>

      {countdown ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 6, fontWeight: 600 }}>Race starts in</div>
          <CountdownBlocks countdown={countdown} />
        </div>
      ) : (
        <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#111", border: "1px solid #1d1d1d", fontSize: 12, color: "#888" }}>
          Start time will appear once the schedule is confirmed.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <div style={{ flex: "1 1 140px", background: "#111", border: "1px solid #1d1d1d", borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 2 }}>Location</div>
          <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, lineHeight: 1.35 }}>{location || "TBA"}</div>
        </div>
        <div style={{ flex: "1 1 140px", background: "#111", border: "1px solid #1d1d1d", borderRadius: 10, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 2 }}>Race Start</div>
          <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, lineHeight: 1.35 }}>{startLabel}</div>
        </div>
      </div>
    </div>
  );
}


export function CompactLeaderboardSnippet({ leaderboard = [] }) {
  if (!leaderboard.length) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1d1d1d" }}>
      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>Quick Timing</div>
      <div style={{ display: "grid", gap: 8 }}>
        {leaderboard.slice(0, 3).map((driver) => (
          <div key={`${driver.driverNumber}-${driver.code}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "#111", border: "1px solid #1d1d1d" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <PosBadge pos={driver.position ?? "—"} />
              <span style={{ fontSize: 12, color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{driver.code}</span>
            </div>
            <span style={{ fontSize: 11, color: driver.teamColor, fontWeight: 700, ...mono, flexShrink: 0 }}>
              {driver.lastLap != null ? `${driver.lastLap.toFixed(3)}s` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}


export function LiveWeekendHub({
  liveData,
  statusMeta,
  heading,
  subtitle,
  sessionLabel,
  locationLabel,
  leader,
  countdown,
  showSessionPanel,
  isMobile = false,
}) {
  const hasNextRace = Boolean(liveData.nextRace);

  const cardShell = {
    background: "#0f0f0f",
    border: "1px solid #1e1e1e",
    borderRadius: 14,
    overflow: "hidden",
    padding: 20,
    position: "relative",
    minWidth: 0,
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: showSessionPanel && hasNextRace && !isMobile ? "repeat(2, minmax(0, 1fr))" : "1fr",
        gap: 18,
        alignItems: "stretch",
      }}>
        {showSessionPanel ? (
          <div style={cardShell}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${statusMeta.accent}, ${statusMeta.accent}55, transparent)` }} />
            <SessionContextContent
              liveData={liveData}
              statusMeta={statusMeta}
              heading={heading}
              subtitle={subtitle}
              sessionLabel={sessionLabel}
              locationLabel={locationLabel}
              leader={leader}
            />
          </div>
        ) : null}

        {hasNextRace ? (
          <div style={{
            ...cardShell,
            display: "flex",
            flexDirection: "column",
            minHeight: "100%",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, #27F4D2, #27F4D255, transparent)" }} />
            {!showSessionPanel ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "inline-flex", padding: "6px 12px", borderRadius: 999, border: `1px solid ${statusMeta.chipBorder}`, background: statusMeta.chipBg, fontSize: 10, color: statusMeta.accent, textTransform: "uppercase", letterSpacing: 1.6, fontWeight: 700, marginBottom: 10 }}>
                  {statusMeta.label}
                </div>
                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>{liveData.message}</div>
              </div>
            ) : null}
            <NextRaceHubCard
              race={liveData.nextRace}
              countdown={countdown}
              prominent={!showSessionPanel}
              embedded
            />
            {showSessionPanel ? (
              <CompactLeaderboardSnippet leaderboard={liveData.leaderboard} />
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{
        marginTop: 18,
        padding: "16px 20px",
        background: "#0f0f0f",
        border: "1px solid #1e1e1e",
        borderRadius: 14,
      }}>
        <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: 1.3, fontWeight: 700, marginBottom: 10 }}>Watch & Coverage</div>
        <WatchCoverageStrip compact />
        <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5, marginTop: 10 }}>
          Official links only. Availability varies by territory.
        </div>
      </div>
    </div>
  );
}


export function LivePage({ isMobile = false }) {
  const [liveData, setLiveData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(null);

  useEffect(() => {
    let active = true;

    const loadLiveRace = async () => {
      try {
        const data = await apiFetch("/api/live/race", 60000);
        if (!active) return;
        setLiveData(data);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Failed to load live race data");
        setLoading(false);
      }
    };

    loadLiveRace();
    const poller = setInterval(loadLiveRace, 60000);
    return () => {
      active = false;
      clearInterval(poller);
    };
  }, []);

  useEffect(() => {
    const target = liveData?.nextRace?.startTime;
    if (!target) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      try {
        const raceDate = new Date(target);
        const now = new Date();
        const diff = raceDate - now;

        if (diff > 0) {
          setCountdown({
            d: Math.floor(diff / (1000 * 60 * 60 * 24)),
            h: Math.floor((diff / (1000 * 60 * 60)) % 24),
            m: Math.floor((diff / (1000 * 60)) % 60),
            s: Math.floor((diff / 1000) % 60),
          });
        } else {
          setCountdown(null);
        }
      } catch {
        setCountdown(null);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [liveData?.nextRace?.startTime]);

  if (loading) return <Spinner />;
  if (error) return <Empty icon="⚠️" msg={error} />;
  if (!liveData) return <Empty msg="No live race data available" />;

  const statusMeta = getLiveStatusMeta(liveData.status);
  const heading = liveData.session?.meetingName || gpName(liveData.nextRace?.raceName || "Upcoming Race");
  const subtitle = liveData.status === "upcoming"
    ? liveData.nextRace?.circuitName || "Next race schedule"
    : [liveData.session?.sessionName, liveData.session?.circuit].filter(Boolean).join(" · ");
  const sessionLabel = liveData.session?.sessionName || "No live session";
  const locationLabel =
    liveData.status === "upcoming"
      ? [liveData.nextRace?.locality, liveData.nextRace?.country].filter(Boolean).join(" · ")
      : [liveData.session?.circuit, liveData.session?.country].filter(Boolean).join(" · ");
  const leader = liveData.leaderboard?.[0] || null;
  const isUpcoming = liveData.status === "upcoming";
  const showSessionPanel = !isUpcoming;

  return (
    <div>
      <LiveWeekendHub
        liveData={liveData}
        statusMeta={statusMeta}
        heading={heading}
        subtitle={subtitle}
        sessionLabel={sessionLabel}
        locationLabel={locationLabel}
        leader={leader}
        countdown={countdown}
        showSessionPanel={showSessionPanel}
        isMobile={isMobile}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18, alignItems: "start", marginBottom: 20 }}>
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20 }}>
          <SecLabel>{liveData.leaderboard?.length ? "Live Leaderboard" : "Timing Snapshot"}</SecLabel>
          {liveData.leaderboard?.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {liveData.leaderboard.slice(0, 6).map((driver) => {
                const { firstName, lastName } = splitDriverName(driver.name);
                return (
                  <div key={`${driver.driverNumber}-${driver.code}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "#111", border: "1px solid #1e1e1e", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      <PosBadge pos={driver.position ?? "—"} />
                      <DriverPhoto
                        firstName={firstName}
                        lastName={lastName}
                        headshotUrl={driver.headshotUrl}
                        teamColor={driver.teamColor}
                        headshotVariant="2col"
                        style={{ width: 44, height: 52, display: "block", objectFit: "contain", objectPosition: "center bottom", background: "transparent", border: "none", flexShrink: 0 }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{driver.name}</div>
                        <div style={{ fontSize: 11, color: "#666" }}>{driver.team} • {driver.code}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: driver.teamColor, ...mono }}>
                        {driver.lastLap != null ? `${driver.lastLap.toFixed(3)}s` : "No lap yet"}
                      </div>
                      <div style={{ fontSize: 11, color: "#555" }}>{driver.lapCount} laps</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="⏱️" msg="No session timing entries available yet." />}
        </div>

        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <SecLabel>Lap Time Progression</SecLabel>
              <div style={{ fontSize: 11, color: "#666" }}>Top timing trend from the current or latest official timing snapshot</div>
            </div>
            {leader ? (
              <div style={{ fontSize: 11, color: "#666" }}>
                Leader: <span style={{ color: leader.teamColor, fontWeight: 700 }}>{leader.name}</span>
              </div>
            ) : null}
          </div>
          {liveData.lapSeries?.length && liveData.lapSeriesDrivers?.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={liveData.lapSeries}>
                <CartesianGrid stroke="#1a1a1a" />
                <XAxis dataKey="lap" stroke="#666" tick={{ fontSize: 11 }} />
                <YAxis stroke="#666" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#0c0c0c", border: "1px solid #E10600", borderRadius: 4, color: "#fff" }}
                  formatter={(value) => typeof value === "number" ? `${value.toFixed(3)}s` : value}
                />
                {liveData.lapSeriesDrivers.map((driver) => (
                  <Line key={driver.key} type="monotone" dataKey={driver.key} stroke={driver.color} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty icon="📈" msg="Lap history is not available for this session yet." />
          )}
        </div>
      </div>
    </div>
  );
}
