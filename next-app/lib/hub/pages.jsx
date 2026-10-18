import { useState } from "react";
import dynamic from "next/dynamic";
import { Spinner, Tabs } from "./common";

// One registry for every dashboard page: sidebar entry, topbar header, icon, season selector and content.
// To add a page, add one entry to PAGES. Pages load when their tab opens.
const lazyPage = (loader) => dynamic(loader, { ssr: false, loading: () => <Spinner /> });

const StandingsPage = lazyPage(() => import("./standings").then((m) => m.StandingsPage));
const DriversPage = lazyPage(() => import("./drivers").then((m) => m.DriversPage));
const ConstructorsPage = lazyPage(() => import("./constructors").then((m) => m.ConstructorsPage));
const WatchlistPage = lazyPage(() => import("./watchlist").then((m) => m.WatchlistPage));
const PointsChartPage = lazyPage(() => import("./points").then((m) => m.PointsChartPage));
const SeasonRecordsPage = lazyPage(() => import("./records").then((m) => m.SeasonRecordsPage));
const PitLabPage = lazyPage(() => import("./pit-lab").then((m) => m.PitLabPage));
const StrategyPage = lazyPage(() => import("./strategy").then((m) => m.StrategyPage));
const HeadToHeadPage = lazyPage(() => import("./h2h").then((m) => m.HeadToHeadPage));
const CircuitsPage = lazyPage(() => import("./circuits").then((m) => m.CircuitsPage));
const TelemetryPage = lazyPage(() => import("./telemetry").then((m) => m.TelemetryPage));
const RaceReplayPage = lazyPage(() => import("./race-replay").then((m) => m.RaceReplayPage));
const RaceStoryPage = lazyPage(() => import("./race-story").then((m) => m.RaceStoryPage));
const RaceResultsPage = lazyPage(() => import("./race-results").then((m) => m.RaceResultsPage));
const LivePage = lazyPage(() => import("./live").then((m) => m.LivePage));
const AlertsPage = lazyPage(() => import("./alerts").then((m) => m.AlertsPage));

/** Shows one of several views under a tab bar. Each view gets the same props as a plain page. */
function TabbedPage({ tabs, ...props }) {
  const [active, setActive] = useState(tabs[0][0]);
  const Current = tabs.find(([id]) => id === active)[2];
  return (
    <div>
      <Tabs tabs={tabs.map(([id, label]) => [id, label])} active={active} onSelect={setActive} />
      <Current {...props} />
    </div>
  );
}

const TELEMETRY_TABS = [["replay", "Race replay", RaceReplayPage], ["traces", "Session traces", TelemetryPage]];
const STORY_TABS = [["story", "Race story", RaceStoryPage], ["results", "Results", RaceResultsPage]];
const PIT_LAB_TABS = [["stints", "All stints", StrategyPage], ["driver", "Driver what-if", PitLabPage]];

export const PAGE_GROUPS = ["Core", "Analytics", "Live"];

export const PAGES = [
  {
    id: "standings", label: "Standings", group: "Core", nav: true, seasonSelector: true,
    title: "Championship Standings", subtitle: ({ season }) => `${season} Formula 1 World Championship`,
    accent: "#FFD700", iconColor: "#FFD700",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" />
        <path d="M12 2a6 6 0 0 1 6 6v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" />
      </svg>
    ),
    Component: StandingsPage,
  },
  {
    id: "drivers", label: "Drivers", group: "Core", nav: true, seasonSelector: true,
    title: "Driver Profiles", subtitle: ({ season }) => `${season} · Driver profiles`,
    accent: "#27F4D2", iconColor: "#27F4D2",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v-2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
    Component: DriversPage,
  },
  {
    id: "constructors", label: "Constructors", group: "Core", nav: true, seasonSelector: true,
    title: "Constructor Standings", subtitle: ({ season }) => `${season} · Constructors`,
    accent: "#FF8000", iconColor: "#FF8000",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        {/* Front wing & endplates */}
        <path d="M2 17h20" />
        <path d="M2 17v-3h3" />
        <path d="M22 17v-3h-3" />
        {/* Nose cone & Halo cockpit */}
        <path d="M9 17l2-10h2l2 10" />
        <path d="M10 7a2 2 0 0 1 4 0" />
        {/* Tires */}
        <rect x="1" y="11" width="3" height="6" rx="1" />
        <rect x="20" y="11" width="3" height="6" rx="1" />
        {/* Suspension arms */}
        <path d="M4 14h5M15 14h5" />
      </svg>
    ),
    Component: ConstructorsPage,
  },
  {
    id: "circuits", label: "Circuits", group: "Core", nav: true, seasonSelector: false,
    title: "Circuit Explorer", subtitle: ({ season }) => `${season} · Wikipedia track maps`,
    accent: "#27F4D2", iconColor: "#27F4D2",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
        <line x1="9" y1="3" x2="9" y2="18" />
        <line x1="15" y1="6" x2="15" y2="21" />
      </svg>
    ),
    Component: CircuitsPage,
  },
  {
    id: "watchlist", label: "Watchlist", group: "Core", nav: true, seasonSelector: false,
    title: "Watchlist", subtitle: ({ season, trackedCount }) => `${trackedCount} tracked item${trackedCount !== 1 ? "s" : ""} · ${season} season`,
    accent: "#FFD700", iconColor: "#FFD700",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
    Component: WatchlistPage,
  },
  {
    id: "points", label: "Points Progression", group: "Core", nav: true, seasonSelector: true,
    title: "Points Progression", subtitle: ({ season }) => `${season} · Round-by-round title fight and current gaps`,
    accent: "#27F4D2", iconColor: "#27F4D2",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    Component: PointsChartPage,
  },
  {
    id: "records", label: "Season Records", group: "Analytics", nav: true, seasonSelector: true,
    title: "Season Records", subtitle: ({ season }) => `${season} · Wins, podiums, consistency and constructor leaders`,
    accent: "#FFD700", iconColor: "#FFD700",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <circle cx="12" cy="8" r="7" />
        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      </svg>
    ),
    Component: SeasonRecordsPage,
  },
  {
    id: "pitlab", label: "Pit Lab", group: "Analytics", nav: true, seasonSelector: true,
    title: "Pit Lab", subtitle: ({ season }) => `${season} · Driver what-ifs and all-driver stints`,
    accent: "#27F4D2", iconColor: "#27F4D2",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
      </svg>
    ),
    Component: (props) => <TabbedPage {...props} tabs={PIT_LAB_TABS} />,
  },
  {
    id: "h2h", label: "Head to Head", group: "Analytics", nav: true, seasonSelector: true,
    title: "Head to Head", subtitle: ({ season }) => `${season} · Metric board, recent form and race-by-race duel`,
    accent: "#E10600", iconColor: "#E10600",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <line x1="2" y1="22" x2="22" y2="2" />
        <line x1="22" y1="22" x2="2" y2="2" />
        <line x1="7" y1="13" x2="11" y2="17" />
        <line x1="17" y1="13" x2="13" y2="17" />
      </svg>
    ),
    Component: HeadToHeadPage,
  },
  {
    id: "telemetry", label: "Telemetry", group: "Analytics", nav: true, seasonSelector: true,
    title: "Telemetry", subtitle: () => "Session traces from OpenF1 · race replay from lap timing",
    accent: "#7C3AED", iconColor: "#7C3AED",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    Component: (props) => <TabbedPage {...props} tabs={TELEMETRY_TABS} />,
  },
  {
    id: "story", label: "Race Story", group: "Analytics", nav: true, seasonSelector: true,
    title: "Race Story", subtitle: ({ season }) => `${season} · Lap-by-lap positions, gaps and results`,
    accent: "#27F4D2", iconColor: "#27F4D2",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </svg>
    ),
    Component: (props) => <TabbedPage {...props} tabs={STORY_TABS} />,
  },
  {
    id: "live", label: "Live & Upcoming", group: "Live", nav: true, seasonSelector: false,
    title: "Live & Upcoming", subtitle: () => "Next race countdown · Real-time when a race is live",
    accent: "#E10600", iconColor: "#E10600",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <circle cx="12" cy="12" r="2" />
        <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
        <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
      </svg>
    ),
    Component: LivePage,
  },
  {
    // Not in the sidebar: opened from the bell in the topbar.
    id: "alerts", label: "Race Alerts", group: "Account", nav: false, seasonSelector: false,
    title: "Race Alerts", subtitle: () => "Email reminders before each race starts",
    accent: "#FFD700", iconColor: "#FFD700",
    icon: (size, strokeColor) => (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={strokeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "stroke 0.15s" }}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    Component: AlertsPage,
  },
];

export const PAGE_BY_ID = Object.fromEntries(PAGES.map((page) => [page.id, page]));

// Old tab ids from before the merges keep working: each one opens the page that now holds it.
const LEGACY_PAGE_IDS = { races: "story", visualizer: "telemetry", strategy: "pitlab" };

/** The page id for a URL tab value, or null if it is unknown. */
export function resolvePageId(id) {
  if (PAGE_BY_ID[id]) return id;
  return LEGACY_PAGE_IDS[id] ?? null;
}

export const SEASON_SELECTOR_PAGE_IDS = new Set(PAGES.filter((page) => page.seasonSelector).map((page) => page.id));

export const NAV_GROUPS = PAGE_GROUPS.map((label) => ({
  label,
  items: PAGES.filter((page) => page.nav && page.group === label),
}));

export function NavIcon({ id, active, size = 16, color }) {
  const page = PAGE_BY_ID[id];
  if (!page) return null;
  return page.icon(size, color || (active ? "#E10600" : "#555"));
}
