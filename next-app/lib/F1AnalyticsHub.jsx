import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import SignOutButton from "../components/SignOutButton";
import appPackage from "../package.json";
import { DEFAULT_SEASON } from "./seasons";
import { SEASONS, Spinner, useDashboardWatchlist, useWindowWidth } from "./hub/common";
import { NAV_GROUPS, NavIcon, PAGE_BY_ID, SEASON_SELECTOR_PAGE_IDS, resolvePageId } from "./hub/pages";
const APP_VERSION = appPackage.version;

const DEFAULT_DASHBOARD_PAGE = "standings";

const DASHBOARD_TAB_PARAM = "tab";


function getDashboardTabFromUrl() {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_PAGE;
  try {
    const requestedTab = new URLSearchParams(window.location.search).get(DASHBOARD_TAB_PARAM);
    return resolvePageId(requestedTab) ?? DEFAULT_DASHBOARD_PAGE;
  } catch {
    return DEFAULT_DASHBOARD_PAGE;
  }
}


function syncDashboardTabToUrl(tab) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!tab || tab === DEFAULT_DASHBOARD_PAGE) {
      url.searchParams.delete(DASHBOARD_TAB_PARAM);
    } else {
      url.searchParams.set(DASHBOARD_TAB_PARAM, tab);
    }
    window.history.replaceState({}, "", url);
  } catch { }
}


// ── Shared UI Components ──────────────────────────────────────────
// ── F1 Official Logo PNG ──────────────────────────────────────────
function F1Logo({ width = 56, height = "auto" }) {
  return (
    <Image
      src="/F1-Logo.png"
      alt="Formula 1"
      width={width}
      height={Math.round(width * 963 / 3840)}
      style={{ display: "block", height, objectFit: "contain", flexShrink: 0 }}
    />
  );
}




// ──  Main App ──────────────────────────────────────────────────────
export default function F1AnalyticsHub() {
  const [page, setPage] = useState(DEFAULT_DASHBOARD_PAGE);
  const [season, setSeason] = useState(DEFAULT_SEASON);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [tabReady, setTabReady] = useState(false);
  const {
    watchlist,
    toggle: toggleWatch,
    loaded: watchlistLoaded,
    syncing: watchlistSyncing,
    trackedCount,
  } = useDashboardWatchlist();
  const width = useWindowWidth();
  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1100;
  const showSeasonSelector = SEASON_SELECTOR_PAGE_IDS.has(page);
  const contentRef = useRef(null);

  // Track scroll position of the CONTENT div (not window) for topbar shadow
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 4);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Reset scroll to top whenever page changes
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
    setScrolled(false);
  }, [page]);

  useEffect(() => {
    setPage(getDashboardTabFromUrl());
    setTabReady(true);

    const onPopState = () => setPage(getDashboardTabFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!tabReady) return;
    syncDashboardTabToUrl(page);
  }, [page, tabReady]);

  const currentPage = PAGE_BY_ID[page] ?? PAGE_BY_ID[DEFAULT_DASHBOARD_PAGE];
  const PageComponent = currentPage.Component;
  const goHome = () => {
    window.location.href = "/home";
  };
  const topbarHeader = {
    icon: <NavIcon id={currentPage.id} active={true} size={18} color={currentPage.iconColor} />,
    title: currentPage.title,
    subtitle: currentPage.subtitle({ season, trackedCount }),
    accent: currentPage.accent,
  };

  // ── Sidebar nav items ────────────────────────────────────────────
  const navContent = (
    <nav style={{ flex: 1, padding: "8px 6px", overflowY: "auto", overflowX: "hidden" }}>
      {NAV_GROUPS.map(group => (
        <div key={group.label}>
          {(sidebarOpen || isMobile) && (
            <div style={{
              fontSize: 9, color: "#333", textTransform: "uppercase",
              letterSpacing: 2, padding: "12px 12px 4px", fontWeight: 700,
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'Orbitron', sans-serif",
            }}>
              <div style={{ flex: 1, height: "0.5px", background: "#1e1e1e" }} />
              <span>{group.label}</span>
              <div style={{ flex: 1, height: "0.5px", background: "#1e1e1e" }} />
            </div>
          )}
          {group.items.map(item => {
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setPage(item.id); if (isMobile) setMobileNavOpen(false); }}
                title={!sidebarOpen && !isMobile ? item.label : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  width: "100%", padding: sidebarOpen || isMobile ? "7px 12px" : "7px 0",
                  justifyContent: sidebarOpen || isMobile ? "flex-start" : "center",
                  background: active ? "linear-gradient(90deg, rgba(225,6,0,0.12) 0%, rgba(225,6,0,0.04) 100%)" : "transparent",
                  border: "none",
                  borderLeft: active ? "2px solid #E10600" : "2px solid transparent",
                  borderRadius: "0 6px 6px 0",
                  cursor: "pointer",
                  color: active ? "#fff" : "#4a4a4a",
                  transition: "all 0.15s ease",
                  marginBottom: 1, fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  textAlign: "left", whiteSpace: "nowrap",
                  position: "relative",
                  fontFamily: "'Orbitron', sans-serif",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = "#888"; e.currentTarget.style.background = active ? "linear-gradient(90deg, rgba(225,6,0,0.12) 0%, rgba(225,6,0,0.04) 100%)" : "rgba(255,255,255,0.03)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = "#4a4a4a"; e.currentTarget.style.background = active ? "linear-gradient(90deg, rgba(225,6,0,0.12) 0%, rgba(225,6,0,0.04) 100%)" : "transparent"; }}
              >
                <span style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 16,
                  height: 16,
                  flexShrink: 0,
                }}>
                  <NavIcon id={item.id} active={active} />
                </span>

                {(sidebarOpen || isMobile) && (
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
                )}

                {item.id === "watchlist" && trackedCount > 0 && (sidebarOpen || isMobile) && (
                  <span style={{
                    background: "#E10600", color: "#fff", fontSize: 9, fontWeight: 800,
                    minWidth: 16, height: 16, borderRadius: 8, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    padding: "0 4px", flexShrink: 0,
                    fontFamily: "'Orbitron', sans-serif",
                  }}>{trackedCount}</span>
                )}

                {item.id === "live" && (
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", background: "#E10600",
                    flexShrink: 0, animation: "livePulse 1.5s ease-in-out infinite",
                    ...((!sidebarOpen && !isMobile) ? { position: "absolute", top: 6, right: 6 } : {}),
                  }} />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );

  // ── Sidebar header ───────────────────────────────────────────────
  const sidebarHeader = (
    <div style={{
      padding: "0 14px", borderBottom: "1px solid #141414",
      display: "flex", alignItems: "center",
      gap: 10, height: 58, flexShrink: 0,
      overflow: "hidden",
    }}>
      <button
        onClick={goHome}
        title="Go to Home"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
          cursor: "pointer",
          color: "inherit",
          textAlign: "left",
        }}
      >
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
          <F1Logo width={sidebarOpen ? 52 : 38} />
        </div>
        {sidebarOpen && (
          <div style={{ overflow: "hidden", lineHeight: 1 }}>
            <div style={{ fontWeight: 850, fontSize: 13, letterSpacing: 0.3, color: "#fff", whiteSpace: "nowrap", fontFamily: "'Orbitron', sans-serif" }}>Pitwall Analytics</div>
            <div style={{ color: "#333", fontSize: 9, letterSpacing: 2, marginTop: 2, textTransform: "uppercase", fontFamily: "'Orbitron', sans-serif" }}>Hub · {season}</div>
          </div>
        )}
      </button>
    </div>
  );

  // ── Sidebar footer (collapse button) ────────────────────────────
  const sidebarFooter = (
    <div style={{ padding: "10px 8px", borderTop: "1px solid #141414", flexShrink: 0 }}>
      <button
        onClick={() => setSidebarOpen(v => !v)}
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        style={{
          width: "100%", padding: "8px", background: "transparent",
          border: "1px solid #1c1c1c", borderRadius: 6, color: "#333",
          cursor: "pointer", fontSize: 11, display: "flex",
          alignItems: "center", justifyContent: sidebarOpen ? "space-between" : "center",
          gap: 6, transition: "all 0.15s",
          fontFamily: "'Orbitron', sans-serif",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = "#E10600"; e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = "#1c1c1c"; e.currentTarget.style.color = "#333"; }}
      >
        {sidebarOpen && <span style={{ fontSize: 11 }}>Collapse</span>}
        <span style={{ fontSize: 11, transition: "transform 0.25s", display: "inline-block", transform: sidebarOpen ? "rotate(0deg)" : "rotate(180deg)" }}>◀</span>
      </button>
    </div>
  );

  if (!tabReady) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#080808",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: "'Titillium Web','SF Pro Display','Segoe UI',sans-serif",
      }}>
        <Spinner />
      </div>
    );
  }

  return (
    <>
      {/* ── Global keyframes ─────────────────────────────────────── */}
      <style>{`
        @keyframes spin       { to { transform: rotate(360deg); } }
        @keyframes livePulse  { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.4;transform:scale(0.8);} }
        @keyframes slideIn    { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
        @keyframes fadeIn     { from{opacity:0;} to{opacity:1;} }
        @keyframes cardIn     { from{opacity:0;transform:translateY(12px) scale(0.98);} to{opacity:1;transform:translateY(0) scale(1);} }
        @keyframes shimmer    { 0%{background-position:-400px 0;} 100%{background-position:400px 0;} }
        @keyframes borderPulse{ 0%,100%{box-shadow:0 0 0 0 rgba(225,6,0,0);} 50%{box-shadow:0 0 0 4px rgba(225,6,0,0.15);} }
        * { scrollbar-width:thin; scrollbar-color:#2a2a2a #0a0a0a; }
        *::-webkit-scrollbar        { width:5px; height:5px; }
        *::-webkit-scrollbar-track  { background:#0a0a0a; }
        *::-webkit-scrollbar-thumb  { background:#2a2a2a; border-radius:3px; }
        *::-webkit-scrollbar-thumb:hover { background:#E10600; }
        .f1-card-enter { animation: cardIn 0.22s ease-out both; }
        select option   { background:#111; color:#fff; }
      `}</style>

      {/*
        ── SHELL LAYOUT ───────────────────────────────────────────────
        THE KEY FIX:
        • Outer wrapper: height:100vh + overflow:hidden  → clips everything to viewport
        • Sidebar:       height:100vh + flexShrink:0     → never grows beyond viewport
        • Main column:   flex:1 + overflow:hidden         → clips main column too
        • Topbar:        IN FLOW (not position:fixed)     → no left-offset hacks needed,
                         never scrolls because its parent has overflow:hidden
        • Content div:   flex:1 + overflowY:auto          → THE ONLY THING THAT SCROLLS
        • Footer:        flexShrink:0                     → stays pinned at bottom
      */}
      <div style={{
        display: "flex",
        height: "100vh",       /* ← was minHeight which let page grow past viewport */
        overflow: "hidden",    /* ← clips the entire shell to exactly the viewport */
        background: "#080808",
        fontFamily: "'Titillium Web','SF Pro Display','Segoe UI',sans-serif",
        color: "#fff",
      }}>

        {/* ── Mobile overlay nav ─────────────────────────────────── */}
        {isMobile && mobileNavOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex" }}>
            <div style={{
              width: 272, background: "#0a0a0a",
              borderRight: "1px solid #141414",
              display: "flex", flexDirection: "column",
              height: "100%",
              boxShadow: "4px 0 24px rgba(0,0,0,0.6)",
            }}>
              <div style={{
                padding: "0 14px", borderBottom: "1px solid #141414",
                display: "flex", alignItems: "center",
                justifyContent: "space-between", height: 58, flexShrink: 0,
              }}>
                <button
                  onClick={goHome}
                  title="Go to Home"
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    color: "inherit",
                    textAlign: "left",
                  }}
                >
                  <F1Logo width={50} />
                  <span style={{ fontWeight: 800, fontSize: 14, fontFamily: "'Orbitron', sans-serif" }}>Pitwall Analytics</span>
                </button>
                <button onClick={() => setMobileNavOpen(false)} style={{ background: "transparent", border: "1px solid #222", color: "#888", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>
              {navContent}
            </div>
            <div style={{ flex: 1, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)" }} onClick={() => setMobileNavOpen(false)} />
          </div>
        )}

        {/* ── Desktop sidebar ────────────────────────────────────── */}
        {!isMobile && (
          <div style={{
            width: sidebarOpen ? (isTablet ? 206 : 230) : 52,
            flexShrink: 0,
            height: "100vh",           /* ← CRITICAL: sidebar is always exactly viewport height */
            background: "#0a0a0a",
            borderRight: "1px solid #141414",
            display: "flex",
            flexDirection: "column",
            transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
            overflow: "hidden",
          }}>
            {sidebarHeader}
            {navContent}
            {sidebarFooter}
          </div>
        )}

        {/* ── Main column ────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100vh",             /* ← CRITICAL: main column is always exactly viewport height */
          overflow: "hidden",          /* ← CRITICAL: clips main column so only content div scrolls */
          minWidth: 0,
        }}>

          {/* ── Topbar — IN FLOW, NOT position:fixed ─────────────
              Because the parent has overflow:hidden and is exactly 100vh tall,
              this topbar cannot scroll. No position:fixed, no left offset math. */}
          <div style={{
            flexShrink: 0,
            height: isMobile ? "auto" : (isTablet ? 66 : 72),
            minHeight: isMobile ? 58 : undefined,
            padding: `${isMobile ? 10 : 0}px ${isMobile ? 14 : isTablet ? 16 : 24}px ${isMobile ? 10 : 0}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            background: "#080808",
            borderBottom: scrolled
              ? "1px solid #1e1e1e"
              : "1px solid #141414",
            boxShadow: scrolled
              ? "0 2px 16px rgba(0,0,0,0.5)"
              : "none",
            transition: "box-shadow 0.2s ease, border-color 0.2s ease",
            zIndex: 10,
          }}>

            {/* Nav toggle, title (+ season on mobile), sign out */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              width: "100%",
              minHeight: isMobile ? 44 : undefined,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 10, flex: 1, minWidth: 0 }}>
                {isMobile && (
                  <button
                    onClick={() => setMobileNavOpen(true)}
                    style={{
                      background: "transparent", border: "1px solid #1e1e1e",
                      color: "#888", width: 34, height: 34, borderRadius: 7,
                      cursor: "pointer", fontSize: 16, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#E10600"; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#888"; }}
                  >☰</button>
                )}

                <div style={{
                  display: "flex",
                  alignItems: isMobile ? "flex-start" : "center",
                  gap: isMobile ? 8 : 12,
                  minWidth: 0,
                  flex: 1,
                  overflow: isMobile ? "visible" : "hidden",
                  position: "relative",
                  paddingBottom: isMobile ? 0 : 4,
                }}>
                  <div style={{
                    width: isMobile ? 32 : 44,
                    height: isMobile ? 32 : 44,
                    borderRadius: isMobile ? 9 : 12,
                    background: `linear-gradient(135deg, ${topbarHeader.accent}22, ${topbarHeader.accent}08)`,
                    border: `1px solid ${topbarHeader.accent}33`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: isMobile ? 16 : 22,
                    flexShrink: 0,
                    marginTop: isMobile ? 1 : 0,
                  }}>
                    {topbarHeader.icon}
                  </div>

                  <div style={{ minWidth: 0, flex: 1, overflow: isMobile ? "visible" : "hidden" }}>
                    <h2 style={{
                      margin: 0,
                      fontSize: isMobile ? 15 : isTablet ? 20 : 22,
                      fontWeight: 900,
                      letterSpacing: "-0.2px",
                      color: "#fff",
                      lineHeight: isMobile ? 1.25 : 1.1,
                      fontFamily: "'Orbitron', sans-serif",
                      ...(isMobile
                        ? { whiteSpace: "normal", overflow: "visible", textOverflow: "unset" }
                        : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }),
                    }}>
                      {topbarHeader.title}
                    </h2>
                    {isMobile && showSeasonSelector && (
                      <select
                        value={season}
                        onChange={e => setSeason(e.target.value)}
                        aria-label="Season"
                        style={{
                          marginTop: 6,
                          background: "#111",
                          border: `1px solid ${topbarHeader.accent}44`,
                          color: topbarHeader.accent,
                          padding: "4px 8px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          fontFamily: "monospace",
                          outline: "none",
                          width: "auto",
                          maxWidth: "100%",
                        }}
                      >
                        {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {!isMobile && !isTablet && (
                      <p style={{
                        margin: "3px 0 0", fontSize: 12, color: "#444",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {topbarHeader.subtitle}
                      </p>
                    )}
                  </div>

                  {!isMobile && !isTablet && (
                    <div style={{
                      position: "absolute",
                      left: 56,
                      bottom: 0,
                      width: 60,
                      height: 2,
                      background: `linear-gradient(90deg, ${topbarHeader.accent}, transparent)`,
                      borderRadius: 1,
                    }} />
                  )}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {showSeasonSelector && !isMobile && (
                  <>
                    {!isTablet && (
                      <span style={{ color: "#333", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Season</span>
                    )}
                    <select
                      value={season}
                      onChange={e => setSeason(e.target.value)}
                      style={{
                        background: "#111", border: "1px solid #222",
                        color: "#fff", padding: "6px 10px", borderRadius: 7,
                        fontSize: 13, cursor: "pointer", fontFamily: "monospace",
                        outline: "none",
                      }}
                    >
                      {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </>
                )}

                {!isTablet && !isMobile && <div style={{ width: 1, height: 22, background: "#1c1c1c", flexShrink: 0 }} />}

                <button
                  type="button"
                  onClick={() => setPage("alerts")}
                  title="Race alerts"
                  aria-label="Race alerts"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 36, height: 34, borderRadius: 7, cursor: "pointer", flexShrink: 0,
                    background: page === "alerts" ? "#E1060014" : "#111",
                    border: `1px solid ${page === "alerts" ? "#E10600aa" : "#222"}`,
                  }}
                >
                  <NavIcon id="alerts" active={page === "alerts"} size={16} />
                </button>
                <SignOutButton />
              </div>
            </div>
          </div>

          {/* ── Scrollable content area ─────────────────────────────
              This is THE ONLY element that scrolls.
              flex:1 makes it fill the remaining height (viewport - 58px topbar - footer).
              overflowY:auto adds a scrollbar only when content overflows. */}
          <div
            ref={contentRef}
            style={{
              flex: 1,                  /* fills remaining vertical space */
              overflowY: "auto",        /* ← ONLY THIS SCROLLS — topbar above and footer below stay put */
              overflowX: "hidden",
              padding: `${isMobile ? 16 : isTablet ? 18 : 22}px ${isMobile ? 14 : isTablet ? 16 : 24}px`,
              /* Subtle page-change animation */
              animation: "slideIn 0.18s ease-out",
            }}
            key={page} /* re-mount animation on page change */
          >
            {tabReady ? (
              <>
                <PageComponent
                  season={season}
                  isMobile={isMobile}
                  watchlist={watchlist}
                  onToggle={toggleWatch}
                  trackedCount={trackedCount}
                  watchlistReady={watchlistLoaded}
                  watchlistDisabled={!watchlistLoaded || watchlistSyncing}
                />
              </>
            ) : (
              <Spinner />
            )}
          </div>

          {/* ── Footer — stays pinned at very bottom ────────────── */}
          <div style={{
            flexShrink: 0,
            padding: `8px ${isMobile ? 14 : 24}px`,
            borderTop: "1px solid #101010",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{ color: "#1e1e1e", fontSize: 10, fontFamily: "monospace" }}>
              JOLPICA · ERGAST · OPENF1
            </span>
            <span style={{ color: "#1e1e1e", fontSize: 10, fontFamily: "monospace" }}>
              PITWALL ANALYTICS HUB · v{APP_VERSION}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
