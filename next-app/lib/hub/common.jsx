import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { WATCHLIST_BUCKETS, createDashboardWatchlistSetState, cloneDashboardWatchlistSetState, countDashboardWatchlistItems, ensureDashboardWatchlist, saveDashboardWatchlist } from "../dashboard-watchlist";
import { formatGrandPrixName as gpName, getTeamColor as col } from "../f1-display";
import { getFinishPosition } from "../driver-season-metrics";
import { getSeasonOptions } from "../seasons";
import { TRACK_PATHS } from "./track-data";

export const SEASONS = getSeasonOptions(2015);


export const STINT_PAL = ["#E8002D", "#FFD700", "#d4d4d4", "#27F4D2", "#FF8000", "#a855f7"];

export const NAT_FLAGS = {
  British: "🇬🇧", Dutch: "🇳🇱", Monegasque: "🇲🇨", Spanish: "🇪🇸", Mexican: "🇲🇽",
  Australian: "🇦🇺", German: "🇩🇪", French: "🇫🇷", Finnish: "🇫🇮", Canadian: "🇨🇦",
  Japanese: "🇯🇵", Danish: "🇩🇰", Thai: "🇹🇭", Chinese: "🇨🇳", American: "🇺🇸",
  Italian: "🇮🇹", Austrian: "🇦🇹", Brazilian: "🇧🇷", Argentine: "🇦🇷", Swiss: "🇨🇭",
  "New Zealander": "🇳🇿", Polish: "🇵🇱",
};


// ── API Cache (5-min TTL) ─────────────────────────────────────────
export const _cache = new Map();

export async function apiFetch(url, ttl = 300000) {
  const hit = _cache.get(url);
  if (hit && Date.now() - hit.ts < ttl) return hit.data;
  const data = await fetch(url).then(async r => {
    if (!r.ok) {
      const problem = await r.json().catch(() => ({}));
      throw new Error(problem.error || `Request failed (${r.status})`);
    }
    return r.json();
  });
  _cache.set(url, { data, ts: Date.now() });
  return data;
}


// ── Utils ─────────────────────────────────────────────────────────
export const flagOf = (nat) => NAT_FLAGS[nat] || "🌍";

export const mono = { fontFamily: "monospace" };

export const pad2 = (n) => String(n).padStart(2, "0");


// ── Hooks ─────────────────────────────────────────────────────────
export function useWindowWidth() {
  // Keep initial render deterministic across server and client to avoid hydration mismatch.
  const [w, setW] = useState(1200);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    fn();
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return w;
}


export function useDashboardWatchlist() {
  const { status } = useSession();
  const [watchlist, setWatchlist] = useState(() => createDashboardWatchlistSetState());
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (status === "loading") return undefined;

    if (status !== "authenticated") {
      setWatchlist(createDashboardWatchlistSetState());
      setLoaded(true);
      return undefined;
    }

    setLoaded(false);

    ensureDashboardWatchlist()
      .then(list => {
        if (!cancelled) {
          setWatchlist(createDashboardWatchlistSetState(list));
        }
      })
      .catch(error => {
        if (!cancelled) {
          console.error("Failed to load dashboard watchlist:", error);
          setWatchlist(createDashboardWatchlistSetState());
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  const toggle = useCallback(async (type, id) => {
    if (!loaded || syncing || status !== "authenticated") return;

    const bucket = WATCHLIST_BUCKETS[type];
    if (!bucket) return;

    const itemId = String(id);
    let previous;
    let next;

    setWatchlist(prev => {
      previous = prev;
      next = cloneDashboardWatchlistSetState(prev);
      const targetSet = next[bucket];
      if (targetSet.has(itemId)) targetSet.delete(itemId);
      else targetSet.add(itemId);
      return next;
    });

    if (!next?.id) return;

    setSyncing(true);
    try {
      const updated = await saveDashboardWatchlist(next);
      setWatchlist(createDashboardWatchlistSetState(updated));
    } catch (error) {
      console.error("Failed to save dashboard watchlist:", error);
      if (previous) setWatchlist(previous);
    } finally {
      setSyncing(false);
    }
  }, [loaded, status, syncing]);

  return { watchlist, toggle, loaded, syncing, trackedCount: countDashboardWatchlistItems(watchlist) };
}


export function useShareableH2H() {
  const getParams = useCallback(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      return { d1: p.get("d1") || "", d2: p.get("d2") || "" };
    } catch { return { d1: "", d2: "" }; }
  }, []);
  const setParams = useCallback((d1, d2) => {
    try {
      const url = new URL(window.location);
      url.searchParams.set("d1", d1); url.searchParams.set("d2", d2);
      window.history.replaceState({}, "", url);
    } catch { }
  }, []);
  return { getParams, setParams };
}


// ── Wikipedia image cache + hook ──────────────────────────────────
export const _wikiCache = new Map();

export const _wikiPending = new Map();


export function extractWikiTitleFromUrl(url) {
  if (!url) return null;
  try {
    const match = new URL(url).pathname.match(/\/wiki\/([^?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}


export function buildWikiCacheKey({ title, titles = [], searchQuery, searchQueries = [], imageIndex = 0, preferMediaList = false, mediaHint = "default", forceImageIndex = false }) {
  return JSON.stringify({
    title: title || null,
    titles: titles.filter(Boolean),
    searchQuery: searchQuery || null,
    searchQueries: searchQueries.filter(Boolean),
    imageIndex,
    preferMediaList,
    mediaHint,
    forceImageIndex,
  });
}


export async function fetchWikiJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  return response.json();
}


export function getWikipediaImageUrl(item) {
  return (
    item?.srcset?.find?.(s => s?.scale === "2x")?.src ||
    item?.srcset?.[0]?.src ||
    item?.original?.source ||
    null
  );
}


export function scoreCircuitMediaItem(title = "") {
  const value = String(title).toLowerCase();
  let score = 0;

  // Strongly prefer SVG files (they are always proper circuit layouts)
  if (/\.svg$/.test(value)) score += 12;

  if (/logo|wordmark|emblem/.test(value)) score -= 100;
  if (/map|layout|track|outline|diagram|bare/.test(value)) score += 8;
  if (/circuit|autodromo|autódromo|ring|prix/.test(value)) score += 4;
  if (/\b20\d{2}\b/.test(value)) score += 2;
  if (/moto|rallycross|nascar|original|old|historic|history|evolution/.test(value)) score -= 8;
  if (/\d{4}-\d{4}/.test(value)) score -= 6;
  // Strongly penalise aerial/satellite/crowd/pit photos
  if (/skysat|sky sat|tower|crowd|pit|grandstand|aerial|formation|amphitheater|salut|hairpin|tunnel|wall|start.finish/.test(value)) score -= 15;
  if (/\.jpg$|\.jpeg$|\.png$/.test(value)) score -= 4;

  return score;
}


export function pickWikipediaMediaItem(images, imageIndex = 0, mediaHint = "default", forceImageIndex = false) {
  if (!Array.isArray(images) || !images.length) return null;
  if (forceImageIndex && Number.isInteger(imageIndex) && imageIndex >= 0) return images[imageIndex] || null;
  if (Number.isInteger(imageIndex) && imageIndex > 0) return images[imageIndex] || null;

  if (mediaHint === "logo") {
    return images.find((item) => /logo|wordmark|emblem/i.test(item?.title || "")) || images[0] || null;
  }

  if (mediaHint === "circuit-layout") {
    const ranked = images
      .map((item, idx) => ({ item, idx, score: scoreCircuitMediaItem(item?.title || "") }))
      .sort((a, b) => b.score - a.score || a.idx - b.idx);
    return ranked[0]?.item || images[0] || null;
  }

  return images[imageIndex] || images[0] || null;
}


export async function loadWikiThumbFromTitle(title, imageIndex = 0, preferMediaList = false, mediaHint = "default", forceImageIndex = false) {
  if (!title) return null;

  let url = null;

  if (preferMediaList || imageIndex > 0) {
    const mediaData = await fetchWikiJson(
      `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title)}`
    );
    const images = Array.isArray(mediaData?.items)
      ? mediaData.items.filter(item => item?.type === "image")
      : [];
    const chosen = pickWikipediaMediaItem(images, imageIndex, mediaHint, forceImageIndex);
    url = getWikipediaImageUrl(chosen);
  }

  if (!url) {
    const summaryData = await fetchWikiJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    // Use the thumbnail URL Wikipedia returns as-is: rewriting the width (e.g. to 400px) yields HTTP 400 for many files.
    url = summaryData?.thumbnail?.source || null;
  }

  return url;
}


export async function searchWikipediaTitle(searchQuery) {
  if (!searchQuery) return null;
  const queryData = await fetchWikiJson(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${encodeURIComponent(searchQuery)}`
  );
  const title = queryData?.query?.search?.[0]?.title || null;
  return title ? title.replace(/ /g, "_") : null;
}


export async function fetchWikiThumb(options) {
  const cacheKey = buildWikiCacheKey(options);
  if (_wikiCache.has(cacheKey)) return _wikiCache.get(cacheKey);
  if (_wikiPending.has(cacheKey)) return _wikiPending.get(cacheKey);

  const { title, titles = [], searchQuery, searchQueries = [], imageIndex = 0, preferMediaList = false, mediaHint = "default", forceImageIndex = false } = options;

  const request = (async () => {
    try {
      const directCandidates = [...new Set([
        title,
        ...titles,
      ].filter(Boolean))];

      for (const candidate of directCandidates) {
        const url = await loadWikiThumbFromTitle(candidate, imageIndex, preferMediaList, mediaHint, forceImageIndex);
        if (url) {
          _wikiCache.set(cacheKey, url);
          return url;
        }
      }

      const queries = [...new Set([
        searchQuery,
        ...searchQueries,
      ].filter(Boolean))];

      if (queries.length) {
        const searchedTitles = (await Promise.all(queries.map(searchWikipediaTitle))).filter(Boolean);
        const searchCandidates = [...new Set(
          searchedTitles.filter((candidate) => !directCandidates.includes(candidate))
        )];

        for (const candidate of searchCandidates) {
          const url = await loadWikiThumbFromTitle(candidate, imageIndex, preferMediaList, mediaHint, forceImageIndex);
          if (url) {
            _wikiCache.set(cacheKey, url);
            return url;
          }
        }
      }

      _wikiCache.set(cacheKey, null);
      return null;
    } catch {
      _wikiCache.set(cacheKey, null);
      return null;
    } finally {
      _wikiPending.delete(cacheKey);
    }
  })();

  _wikiPending.set(cacheKey, request);
  return request;
}


export function useWikiImage(options) {
  const cacheKey = buildWikiCacheKey(options);
  const [state, setState] = useState(() => ({
    cacheKey,
    img: _wikiCache.get(cacheKey) ?? null,
    resolved: _wikiCache.has(cacheKey),
  }));

  useEffect(() => {
    let alive = true;
    // Callers create options inline. The key encodes every supported option, so
    // reconstruct it here to rerun only when the lookup actually changes.
    fetchWikiThumb(JSON.parse(cacheKey)).then((url) => {
      if (alive) {
        setState({ cacheKey, img: url, resolved: true });
      }
    });
    return () => {
      alive = false;
    };
  }, [cacheKey]);

  return state.cacheKey === cacheKey
    ? { img: state.img, resolved: state.resolved }
    : { img: _wikiCache.get(cacheKey) ?? null, resolved: _wikiCache.has(cacheKey) };
}


export function getFormula1HeadshotVariant(url, variant = "6col") {
  if (!url || typeof url !== "string") return null;
  // F1's generic silhouette is served for drivers without a photo; returning null lets the Wikipedia fallback run.
  // The CDN prefixes every driver URL with a default-image parameter; drop it so a missing photo fails and falls back.
  const direct = url.replace(/d_driver_fallback_image\.png\//, "");
  if (!/media\.formula1\.com/.test(direct) || !/\.transform\/[^/]+\/image\.png/.test(direct)) return direct;
  return direct.replace(/\.transform\/[^/]+\/image\.png$/, `.transform/${variant}/image.png`);
}


// ── Driver image with official/Wikipedia fallback ─────────────────
export function DriverPhoto({ firstName = "", lastName = "", wikiUrl, headshotUrl = null, headshotVariant = "6col", teamColor = "#E10600", style = {} }) {
  const primaryTitle = extractWikiTitleFromUrl(wikiUrl);
  const compactFirstName = firstName.split(" ")[0] || firstName;
  const { img: wikiImgUrl } = useWikiImage({
    title: primaryTitle,
    titles: [
      `${firstName}_${lastName}`,
      `${compactFirstName}_${lastName}`,
    ],
    searchQuery: `${firstName} ${lastName}`.trim(),
    imageIndex: 0,
  });
  const [officialFailed, setOfficialFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}` || "F1";
  // Order: official F1 cutout, then Wikipedia photo, then initials.
  const officialUrl = officialFailed ? null : getFormula1HeadshotVariant(headshotUrl, headshotVariant);
  const imgUrl = officialUrl || wikiImgUrl;

  useEffect(() => {
    setOfficialFailed(false);
    setImgFailed(false);
  }, [headshotUrl, wikiUrl, firstName, lastName, headshotVariant]);

  if (imgUrl && !imgFailed) {
    // Wikipedia photos are rectangular; fade their edges so they sit in the card like the cutouts do.
    const fade = officialUrl ? {} : {
      WebkitMaskImage: "radial-gradient(ellipse at center, #000 58%, transparent 78%)",
      maskImage: "radial-gradient(ellipse at center, #000 58%, transparent 78%)",
    };
    // Load provider/Wikipedia URLs directly to preserve onError fallbacks and SVGs.
    return (
      <Image
        src={imgUrl}
        unoptimized
        width={typeof style.width === "number" ? style.width : 512}
        height={typeof style.height === "number" ? style.height : 512}
        alt={`${firstName} ${lastName}`.trim()}
        style={{ objectFit: "cover", objectPosition: "center top", ...style, ...fade }}
        onError={() => (officialUrl ? setOfficialFailed(true) : setImgFailed(true))}
      />
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(135deg, ${teamColor}22, ${teamColor}08)`,
      border: `1px solid ${teamColor}33`,
      ...style,
    }}>
      <span style={{ fontSize: Math.min((style.height || 120) / 2.5, 48), fontWeight: 800, color: teamColor, opacity: 0.6, letterSpacing: -1 }}>
        {initials}
      </span>
    </div>
  );
}


export function getConstructorBadgeText(teamName = "") {
  const tokens = String(teamName)
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !["f1", "team", "formula", "one", "scuderia"].includes(token.toLowerCase()));

  if (!tokens.length) return "F1";
  return tokens.slice(0, 2).map((token) => token[0]).join("").toUpperCase();
}


export function ConstructorLogo({ constructorId, teamName = "", meta = null, teamColor = "#E10600", height = 220, compact = false }) {
  const { img: imgUrl } = useWikiImage({
    title: meta?.visualTitle || null,
    titles: [
      teamName ? teamName.replace(/ /g, "_") : null,
      meta?.visualSearch ? meta.visualSearch.replace(/ /g, "_") : null,
    ],
    searchQuery: `${teamName} logo`,
    searchQueries: [
      `${teamName} F1 logo`,
      `${teamName} Formula 1 logo`,
      `${meta?.visualSearch || teamName} logo`,
    ],
    imageIndex: meta?.logoImageIndex ?? 0,
    preferMediaList: true,
    mediaHint: "logo",
    forceImageIndex: typeof meta?.logoImageIndex === "number",
  });
  const [imgFailed, setImgFailed] = useState(false);
  const badge = getConstructorBadgeText(teamName || constructorId);

  useEffect(() => {
    setImgFailed(false);
  }, [imgUrl, constructorId, teamName]);

  return (
    <div style={{
      position: "relative",
      width: "100%",
      height,
      borderRadius: 12,
      overflow: "hidden",
      border: `1px solid ${teamColor}33`,
      background: `linear-gradient(135deg, ${teamColor}12, #060606 72%)`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {imgUrl && !imgFailed ? (
        <>
          <div style={{
            position: "absolute",
            inset: compact ? 10 : 14,
            borderRadius: compact ? 12 : 16,
            background: "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(232,236,241,0.94) 58%, rgba(213,219,226,0.9) 100%)",
            border: "1px solid rgba(255,255,255,0.45)",
            boxShadow: "0 10px 26px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.55)",
          }} />
          <Image
            src={imgUrl}
            unoptimized
            width={512}
            height={height}
            alt={`${teamName} logo`}
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "center center",
              padding: compact ? "16px 18px" : "24px 26px",
              filter: "drop-shadow(0 0 6px rgba(255,255,255,0.18)) drop-shadow(0 10px 16px rgba(0,0,0,0.28))",
            }}
            onError={() => setImgFailed(true)}
          />
        </>
      ) : (
        <div style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `radial-gradient(circle at top left, ${teamColor}28, transparent 38%), linear-gradient(135deg, ${teamColor}12, #070707 74%)`,
        }}>
          <div style={{ textAlign: "center", padding: "0 24px" }}>
            <div style={{ fontSize: compact ? 34 : 52, fontWeight: 900, color: teamColor, letterSpacing: -2, marginBottom: 8 }}>{badge}</div>
            <div style={{ fontSize: compact ? 12 : 14, fontWeight: 700, color: "#f3f4f6" }}>{teamName}</div>
            <div style={{ fontSize: 11, color: "#8b8b8b", marginTop: 6 }}>Logo not available</div>
          </div>
        </div>
      )}

      {!compact && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(6,6,6,0.02) 0%, rgba(6,6,6,0.08) 100%)",
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
}


// ── Circuit Wikipedia page titles ─────────────────────────────────
// ── Static list of the 25 modern F1 circuits (2024-2026 calendars) ──
export const STATIC_CIRCUITS = [
  { circuitId: "bahrain", circuitName: "Bahrain International Circuit", url: "https://en.wikipedia.org/wiki/Bahrain_International_Circuit", Location: { country: "Bahrain", locality: "Sakhir" } },
  { circuitId: "jeddah", circuitName: "Jeddah Corniche Circuit", url: "https://en.wikipedia.org/wiki/Jeddah_Corniche_Circuit", Location: { country: "Saudi Arabia", locality: "Jeddah" } },
  { circuitId: "albert_park", circuitName: "Albert Park Circuit", url: "https://en.wikipedia.org/wiki/Albert_Park_Circuit", Location: { country: "Australia", locality: "Melbourne" } },
  { circuitId: "suzuka", circuitName: "Suzuka International Racing Course", url: "https://en.wikipedia.org/wiki/Suzuka_International_Racing_Course", Location: { country: "Japan", locality: "Suzuka" } },
  { circuitId: "shanghai", circuitName: "Shanghai International Circuit", url: "https://en.wikipedia.org/wiki/Shanghai_International_Circuit", Location: { country: "China", locality: "Shanghai" } },
  { circuitId: "miami", circuitName: "Miami International Autodrome", url: "https://en.wikipedia.org/wiki/Miami_International_Autodrome", Location: { country: "USA", locality: "Miami" } },
  { circuitId: "imola", circuitName: "Autodromo Enzo e Dino Ferrari", url: "https://en.wikipedia.org/wiki/Autodromo_Enzo_e_Dino_Ferrari", Location: { country: "Italy", locality: "Imola" } },
  { circuitId: "monaco", circuitName: "Circuit de Monaco", url: "https://en.wikipedia.org/wiki/Circuit_de_Monaco", Location: { country: "Monaco", locality: "Monte Carlo" } },
  { circuitId: "villeneuve", circuitName: "Circuit Gilles Villeneuve", url: "https://en.wikipedia.org/wiki/Circuit_Gilles_Villeneuve", Location: { country: "Canada", locality: "Montreal" } },
  { circuitId: "catalunya", circuitName: "Circuit de Barcelona-Catalunya", url: "https://en.wikipedia.org/wiki/Circuit_de_Barcelona-Catalunya", Location: { country: "Spain", locality: "Montmeló" } },
  { circuitId: "red_bull_ring", circuitName: "Red Bull Ring", url: "https://en.wikipedia.org/wiki/Red_Bull_Ring", Location: { country: "Austria", locality: "Spielberg" } },
  { circuitId: "silverstone", circuitName: "Silverstone Circuit", url: "https://en.wikipedia.org/wiki/Silverstone_Circuit", Location: { country: "UK", locality: "Silverstone" } },
  { circuitId: "hungaroring", circuitName: "Hungaroring", url: "https://en.wikipedia.org/wiki/Hungaroring", Location: { country: "Hungary", locality: "Budapest" } },
  { circuitId: "spa", circuitName: "Circuit de Spa-Francorchamps", url: "https://en.wikipedia.org/wiki/Circuit_de_Spa-Francorchamps", Location: { country: "Belgium", locality: "Spa" } },
  { circuitId: "zandvoort", circuitName: "Circuit Zandvoort", url: "https://en.wikipedia.org/wiki/Circuit_Zandvoort", Location: { country: "Netherlands", locality: "Zandvoort" } },
  { circuitId: "monza", circuitName: "Autodromo Nazionale Monza", url: "https://en.wikipedia.org/wiki/Autodromo_Nazionale_Monza", Location: { country: "Italy", locality: "Monza" } },
  { circuitId: "madring", circuitName: "Circuit de Madrid", url: "https://en.wikipedia.org/wiki/Madrid_Grand_Prix", Location: { country: "Spain", locality: "Madrid" } },
  { circuitId: "baku", circuitName: "Baku City Circuit", url: "https://en.wikipedia.org/wiki/Baku_City_Circuit", Location: { country: "Azerbaijan", locality: "Baku" } },
  { circuitId: "marina_bay", circuitName: "Marina Bay Street Circuit", url: "https://en.wikipedia.org/wiki/Marina_Bay_Street_Circuit", Location: { country: "Singapore", locality: "Singapore" } },
  { circuitId: "americas", circuitName: "Circuit of the Americas", url: "https://en.wikipedia.org/wiki/Circuit_of_the_Americas", Location: { country: "USA", locality: "Austin" } },
  { circuitId: "rodriguez", circuitName: "Autódromo Hermanos Rodríguez", url: "https://en.wikipedia.org/wiki/Aut%C3%B3dromo_Hermanos_Rodr%C3%ADguez", Location: { country: "Mexico", locality: "Mexico City" } },
  { circuitId: "interlagos", circuitName: "Autódromo José Carlos Pace", url: "https://en.wikipedia.org/wiki/Aut%C3%B3dromo_Jos%C3%A9_Carlos_Pace", Location: { country: "Brazil", locality: "São Paulo" } },
  { circuitId: "vegas", circuitName: "Las Vegas Strip Circuit", url: "https://en.wikipedia.org/wiki/Las_Vegas_Strip_Circuit", Location: { country: "USA", locality: "Las Vegas" } },
  { circuitId: "losail", circuitName: "Lusail International Circuit", url: "https://en.wikipedia.org/wiki/Lusail_International_Circuit", Location: { country: "Qatar", locality: "Al Daayen" } },
  { circuitId: "yas_marina", circuitName: "Yas Marina Circuit", url: "https://en.wikipedia.org/wiki/Yas_Marina_Circuit", Location: { country: "UAE", locality: "Abu Dhabi" } },
];


// ── Circuit image using local TRACK_PATHS data ──────────────────────
export function CircuitImage({ circuitId, height = 130 }) {
  const idMap = {
    albert_park: "melbourne",
    villeneuve: "montreal",
    catalunya: "barcelona",
    marina_bay: "singapore",
    americas: "austin",
    rodriguez: "mexico_city",
    losail: "lusail",
    vegas: "las_vegas",
    red_bull_ring: "spielberg",
  };
  const pathKey = idMap[circuitId] || circuitId;
  const pathD = TRACK_PATHS[pathKey];

  const pathRef = useRef(null);
  const [viewBox, setViewBox] = useState("-20 -20 540 540");

  useEffect(() => {
    if (pathRef.current) {
      try {
        const bbox = pathRef.current.getBBox();
        const padding = Math.max(bbox.width, bbox.height) * 0.15;
        setViewBox(`${bbox.x - padding} ${bbox.y - padding} ${bbox.width + 2 * padding} ${bbox.height + 2 * padding}`);
      } catch (err) {
        console.warn("getBBox failed", err);
      }
    }
  }, [pathD]);

  if (!pathD) {
    return (
      <div style={{
        width: "100%", height,
        background: "radial-gradient(circle at center, rgba(39, 244, 210, 0.05) 0%, #060606 90%)",
        borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
        border: "1px solid #1c1c1c"
      }}>
        <div style={{ fontSize: 20 }}>🏁</div>
      </div>
    );
  }

  return (
    <div style={{
      width: "100%", height,
      background: "radial-gradient(circle at center, rgba(39, 244, 210, 0.05) 0%, #060606 90%)",
      borderRadius: 6, overflow: "hidden", position: "relative",
      display: "flex", alignItems: "center", justifyContent: "center",
      border: "1px solid #1c1c1c",
    }}>
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "90%", height: "90%" }}
      >
        <path
          ref={pathRef}
          d={pathD}
          fill="none"
          stroke="#27F4D2"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            filter: "drop-shadow(0 0 10px rgba(39, 244, 210, 0.75))"
          }}
        />
      </svg>
    </div>
  );
}


export function buildSeasonCircuitList(races = []) {
  const curatedById = new Map(STATIC_CIRCUITS.map((c) => [c.circuitId, c]));

  // Every venue on this season's calendar is listed, with curated details when we have them.
  const calendar = new Map();
  races.forEach((race) => {
    const circuit = race?.Circuit;
    if (!circuit?.circuitId || calendar.has(circuit.circuitId)) return;
    calendar.set(circuit.circuitId, { round: race.round || null, raceName: race.raceName || null, circuit });
  });

  const onCalendar = [...calendar.entries()].map(([circuitId, { round, raceName, circuit }]) => {
    const curated = curatedById.get(circuitId);
    return {
      circuitId,
      circuitName: curated?.circuitName || circuit.circuitName,
      url: curated?.url || circuit.url,
      Location: curated?.Location || circuit.Location,
      round,
      raceName,
    };
  });

  // Curated circuits not on this season's calendar follow, alphabetically.
  const offCalendar = STATIC_CIRCUITS
    .filter((c) => !calendar.has(c.circuitId))
    .map((c) => ({ ...c, round: null, raceName: null }))
    .sort((a, b) => a.circuitName.localeCompare(b.circuitName));

  return [
    ...onCalendar.sort((a, b) => Number(a.round) - Number(b.round)),
    ...offCalendar,
  ];
}


export function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 16 }}>
      {/* Starting Gantry */}
      <div style={{
        background: "#080808",
        border: "1px solid #222",
        borderRadius: 12,
        padding: "14px 22px",
        display: "flex",
        gap: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)"
      }}>
        {[1, 2, 3, 4, 5].map(idx => (
          <div key={idx} style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            background: "#020202",
            padding: "6px",
            borderRadius: 6,
            border: "1px solid #151515"
          }}>
            <div className={`f1-light-${idx}`} style={{ width: 14, height: 14, borderRadius: "50%", background: "#1a0202" }} />
            <div className={`f1-light-${idx}`} style={{ width: 14, height: 14, borderRadius: "50%", background: "#1a0202" }} />
          </div>
        ))}
      </div>

      <span style={{
        fontSize: 10,
        fontWeight: 700,
        color: "#888",
        textTransform: "uppercase",
        letterSpacing: 2,
        animation: "f1Pulse 1.5s infinite ease-in-out",
        fontFamily: "monospace"
      }}>
        Lights out and away we go...
      </span>

      <style>{`
        @keyframes f1Light1 {
          0%, 10% { background: #1a0202; box-shadow: none; }
          10.1%, 70% { background: #ff0000; box-shadow: 0 0 12px #ff0000, 0 0 20px #ff0000; }
          70.1%, 100% { background: #1a0202; box-shadow: none; }
        }
        @keyframes f1Light2 {
          0%, 22% { background: #1a0202; box-shadow: none; }
          22.1%, 70% { background: #ff0000; box-shadow: 0 0 12px #ff0000, 0 0 20px #ff0000; }
          70.1%, 100% { background: #1a0202; box-shadow: none; }
        }
        @keyframes f1Light3 {
          0%, 34% { background: #1a0202; box-shadow: none; }
          34.1%, 70% { background: #ff0000; box-shadow: 0 0 12px #ff0000, 0 0 20px #ff0000; }
          70.1%, 100% { background: #1a0202; box-shadow: none; }
        }
        @keyframes f1Light4 {
          0%, 46% { background: #1a0202; box-shadow: none; }
          46.1%, 70% { background: #ff0000; box-shadow: 0 0 12px #ff0000, 0 0 20px #ff0000; }
          70.1%, 100% { background: #1a0202; box-shadow: none; }
        }
        @keyframes f1Light5 {
          0%, 58% { background: #1a0202; box-shadow: none; }
          58.1%, 70% { background: #ff0000; box-shadow: 0 0 12px #ff0000, 0 0 20px #ff0000; }
          70.1%, 100% { background: #1a0202; box-shadow: none; }
        }
        @keyframes f1Pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .f1-light-1 { animation: f1Light1 3.5s infinite; }
        .f1-light-2 { animation: f1Light2 3.5s infinite; }
        .f1-light-3 { animation: f1Light3 3.5s infinite; }
        .f1-light-4 { animation: f1Light4 3.5s infinite; }
        .f1-light-5 { animation: f1Light5 3.5s infinite; }
      `}</style>
    </div>
  );
}


export function StatCard({ label, value, sub, accent, onClick, delay = 0 }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "linear-gradient(135deg, #0f0f0f 0%, #0a0a0a 100%)",
        border: `1px solid ${accent ? accent + "33" : "#1e1e1e"}`,
        borderRadius: 10, padding: "14px 16px",
        cursor: onClick ? "pointer" : "default",
        position: "relative", overflow: "hidden",
        animation: `cardIn 0.3s ease-out ${delay}ms both`,
        transition: "transform 0.18s, box-shadow 0.18s",
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 6px 20px ${accent || "#E10600"}22`; } }}
      onMouseLeave={e => { if (onClick) { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; } }}
    >
      {/* Top accent line */}
      {accent && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, ${accent}44, transparent)`, borderRadius: "10px 10px 0 0" }} />}
      <div style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 8, fontWeight: 600, fontFamily: "'Orbitron', sans-serif" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || "#fff", fontFamily: "'Orbitron', monospace", lineHeight: 1 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}


export function PosBadge({ pos }) {
  const m = { "1": "#FFD700", "2": "#C0C0C0", "3": "#CD7F32" };
  const bg = m[String(pos)] || "transparent", c = m[String(pos)] ? "#000" : "#666";
  return <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", fontSize: 12, fontWeight: 700, background: bg, color: c, border: m[String(pos)] ? "none" : "1px solid #2a2a2a", ...mono, fontFamily: "'Orbitron', monospace" }}>{pos}</span>;
}


export function PtsBar({ points, max, color = "#E10600" }) {
  const pct = Math.round((points / Math.max(max, 1)) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ ...mono, fontFamily: "'Orbitron', monospace", fontSize: 13, color: "#fff", minWidth: 36, textAlign: "right" }}>{points}</span>
    </div>
  );
}


export function Tabs({ tabs, active, onSelect, wrap }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "#0f0f0f", padding: 4, borderRadius: 8, width: wrap ? "100%" : "fit-content", marginBottom: 20, flexWrap: "wrap" }}>
      {tabs.map(([id, label]) => (
        <button key={id} onClick={() => onSelect(id)} style={{ flex: wrap ? "1" : "0", padding: "7px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'Orbitron', sans-serif", letterSpacing: "0.2px", background: active === id ? "#E10600" : "transparent", color: active === id ? "#fff" : "#666", transition: "all 0.15s", whiteSpace: "nowrap" }}>{label}</button>
      ))}
    </div>
  );
}


export function SecLabel({ children }) {
  return <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 2, marginBottom: 12, fontWeight: 700, fontFamily: "'Orbitron', sans-serif" }}>{children}</div>;
}



export function Empty({ icon = "📭", msg = "No data available" }) {
  const size = 32;
  const color = "#3a3a3a"; // Sleek gray for empty state vectors

  const m = {
    "📭": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 13a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2Z" />
        <path d="M6 10h12" />
        <path d="M6 6h12" />
      </svg>
    ),
    "📈": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
    "🟰": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="5" y1="9" x2="19" y2="9" />
        <line x1="5" y1="15" x2="19" y2="15" />
      </svg>
    ),
    "🥇": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="7" />
        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
      </svg>
    ),
    "🎯": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
    "🔧": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      </svg>
    ),
    "⚔️": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="2" y1="22" x2="22" y2="2" />
        <line x1="22" y1="22" x2="2" y2="2" />
        <line x1="7" y1="13" x2="11" y2="17" />
        <line x1="17" y1="13" x2="13" y2="17" />
      </svg>
    ),
    "🏁": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    ),
    "⚠️": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke="#E10600" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    "⏱️": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    "⭐": (
      <svg viewBox="0 0 24 24" width={size} height={size} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  };

  const renderedIcon = m[String(icon)] || <span style={{ fontSize: 32 }}>{icon}</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{renderedIcon}</div>
      <div style={{ color: "#555", fontSize: 13, textAlign: "center", padding: "0 16px", lineHeight: 1.5 }}>{msg}</div>
    </div>
  );
}


export function StarBtn({ id, watchlist, onToggle, itemType = "driver", disabled = false }) {
  const bucket = WATCHLIST_BUCKETS[itemType] || "drivers";
  const on = watchlist?.[bucket]?.has(String(id));

  return (
    <button
      onClick={e => {
        e.stopPropagation();
        if (!disabled) onToggle(itemType, id);
      }}
      disabled={disabled}
      style={{
        background: "transparent",
        border: `1px solid ${on ? "#FFD700" : "#222"}`,
        borderRadius: 6,
        color: on ? "#FFD700" : "#444",
        padding: "4px 8px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 13,
        transition: "all 0.15s",
        flexShrink: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}


export function TRow({ children, onClick }) {
  return (
    <tr onClick={onClick} style={{ borderBottom: "1px solid #141414", cursor: onClick ? "pointer" : "default" }}
      onMouseEnter={e => e.currentTarget.style.background = "#0d0d0d"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{children}</tr>
  );
}


export function TH({ children, right, center }) {
  return <th style={{ padding: "9px 12px", textAlign: right ? "right" : center ? "center" : "left", color: "#555", fontWeight: 600, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: "'Orbitron', sans-serif" }}>{children}</th>;
}


export function PanelHeader({ title, accent, onClose }) {
  return (
    <div style={{ padding: "14px 18px", borderBottom: "1px solid #1c1c1c", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#0a0a0a", zIndex: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 4, height: 18, background: accent || "#E10600", borderRadius: 2 }} />
        <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "'Orbitron', sans-serif", letterSpacing: "0.2px" }}>{title}</span>
      </div>
      <button onClick={onClose} style={{ background: "transparent", border: "1px solid #222", color: "#666", width: 28, height: 28, borderRadius: 6, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
    </div>
  );
}


export function asNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}


export function buildLatestRaceWinnerContext(races = []) {
  const ordered = [...races].sort((a, b) => asNum(a.round) - asNum(b.round));
  const latestRace = ordered[ordered.length - 1] || null;
  const latestWinner = latestRace?.Results?.[0] || null;

  if (!latestRace || !latestWinner?.Driver?.driverId) {
    return null;
  }

  return {
    round: asNum(latestRace.round),
    raceName: gpName(latestRace.raceName || latestRace.name || "Latest Grand Prix"),
    date: latestRace.date || null,
    driverId: latestWinner.Driver.driverId,
    driverName:
      `${latestWinner.Driver.givenName || ""} ${latestWinner.Driver.familyName || ""}`.trim() ||
      latestWinner.Driver.driverId,
    driverFamilyName: latestWinner.Driver.familyName || latestWinner.Driver.driverId,
    teamName: latestWinner.Constructor?.name || "Unknown team",
    teamColor: col(latestWinner.Constructor?.constructorId),
  };
}


export function normalizeDriverLookupValue(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}


export function buildDriverHeadshotLookup(drivers = []) {
  const byCode = new Map();
  const byNumber = new Map();
  const byName = new Map();

  drivers.forEach((driver) => {
    if (!driver?.headshotUrl) return;

    if (driver.code) byCode.set(normalizeDriverLookupValue(driver.code), driver.headshotUrl);
    if (driver.driverNumber !== null && driver.driverNumber !== undefined) {
      byNumber.set(String(driver.driverNumber), driver.headshotUrl);
    }

    const firstName = normalizeDriverLookupValue(driver.firstName);
    const lastName = normalizeDriverLookupValue(driver.lastName);
    const fullName = normalizeDriverLookupValue(driver.fullName);

    if (fullName) byName.set(fullName, driver.headshotUrl);
    if (firstName && lastName) byName.set(`${firstName}${lastName}`, driver.headshotUrl);
    if (lastName) byName.set(lastName, driver.headshotUrl);
  });

  return { byCode, byNumber, byName };
}


// Official F1 cutouts (same style as the rest of the grid) for drivers whose OpenF1 entry is
// missing or only a placeholder. Keyed by Jolpica driverId, which identifies the driver across
// seasons (car numbers get reused). Review when these drivers change teams or are replaced.
export const OFFICIAL_PORTRAIT_OVERRIDES = {
  arvid_lindblad: "https://media.formula1.com/image/upload/c_fill,w_658,h_658,g_north/q_auto/v1740000001/common/f1/2026/racingbulls/arvlin01/2026racingbullsarvlin01right.webp",
  tsunoda: "https://media.formula1.com/content/dam/fom-website/drivers/Y/YUKTSU01_Yuki_Tsunoda/yuktsu01.png.transform/6col/image.png",
};


export function resolveDriverHeadshotUrl(driver, lookup) {
  if (!driver || !lookup) return null;

  const override = OFFICIAL_PORTRAIT_OVERRIDES[driver.driverId];
  if (override) return override;

  const code = normalizeDriverLookupValue(driver.code);
  if (code && lookup.byCode.has(code)) return lookup.byCode.get(code);

  const number = driver.permanentNumber ? String(driver.permanentNumber) : "";
  if (number && lookup.byNumber.has(number)) return lookup.byNumber.get(number);

  const fullName = normalizeDriverLookupValue(`${driver.givenName || ""}${driver.familyName || ""}`);
  if (fullName && lookup.byName.has(fullName)) return lookup.byName.get(fullName);

  const familyName = normalizeDriverLookupValue(driver.familyName);
  if (familyName && lookup.byName.has(familyName)) return lookup.byName.get(familyName);

  return null;
}


export function buildConstructorSeasonMetrics(constructors = [], races = []) {
  const byId = new Map();

  const ensureMetric = (constructor, standing) => {
    const constructorId = constructor?.constructorId;
    if (!constructorId) return null;

    if (!byId.has(constructorId)) {
      byId.set(constructorId, {
        constructorId,
        name: constructor?.name || constructorId,
        color: col(constructorId),
        standingsPosition: 999,
        currentPoints: 0,
        currentWins: 0,
        podiums: 0,
        finishTotal: 0,
        finishedCars: 0,
        entries: 0,
      });
    }

    const metric = byId.get(constructorId);
    if (standing) {
      metric.standingsPosition = asNum(standing.position, metric.standingsPosition);
      metric.currentPoints = asNum(standing.points, metric.currentPoints);
      metric.currentWins = asNum(standing.wins, metric.currentWins);
    }
    return metric;
  };

  constructors.forEach((standing) => ensureMetric(standing.Constructor, standing));

  races.forEach((race) => {
    (race.Results || []).forEach((result) => {
      const metric = ensureMetric(result.Constructor, null);
      if (!metric) return;

      const finishPosition = getFinishPosition(result);
      metric.entries += 1;
      if (finishPosition !== null) {
        metric.finishedCars += 1;
        metric.finishTotal += finishPosition;
        if (finishPosition <= 3) metric.podiums += 1;
      }
    });
  });

  return [...byId.values()]
    .map((metric) => ({
      ...metric,
      averageFinish: metric.finishedCars ? Number((metric.finishTotal / metric.finishedCars).toFixed(1)) : null,
    }))
    .sort((a, b) => {
      if (a.standingsPosition !== b.standingsPosition) return a.standingsPosition - b.standingsPosition;
      return b.currentPoints - a.currentPoints;
    });
}


export function getComparisonWinner(left, right, direction = "higher") {
  if (left === right) return "tie";
  if (left === null || left === undefined) return "right";
  if (right === null || right === undefined) return "left";
  if (direction === "lower") return left < right ? "left" : "right";
  return left > right ? "left" : "right";
}


export function buildHeadToHeadDuels(leftMetric, rightMetric) {
  if (!leftMetric || !rightMetric) {
    return { leftWins: 0, rightWins: 0, ties: 0, commonRounds: 0, recent: [] };
  }

  const rightByRound = new Map(rightMetric.roundResults.map((result) => [result.round, result]));
  let leftWins = 0;
  let rightWins = 0;
  let ties = 0;

  const recent = leftMetric.roundResults
    .filter((result) => rightByRound.has(result.round))
    .map((leftResult) => {
      const rightResult = rightByRound.get(leftResult.round);
      const leftFinish = leftResult.finishPosition;
      const rightFinish = rightResult.finishPosition;
      let winner = "tie";

      if (leftFinish !== null && rightFinish !== null) {
        winner = leftFinish < rightFinish ? "left" : leftFinish > rightFinish ? "right" : "tie";
      } else if (leftFinish !== null) {
        winner = "left";
      } else if (rightFinish !== null) {
        winner = "right";
      }

      if (winner === "left") leftWins += 1;
      else if (winner === "right") rightWins += 1;
      else ties += 1;

      return {
        round: leftResult.round,
        raceName: leftResult.raceName,
        left: leftResult,
        right: rightResult,
        winner,
      };
    })
    .sort((a, b) => b.round - a.round)
    .slice(0, 6);

  return { leftWins, rightWins, ties, commonRounds: leftWins + rightWins + ties, recent };
}


// ── Strategy helpers ──────────────────────────────────────────────
export function buildStintsFromPits(stops, totalLaps) {
  const sorted = [...stops].sort((a, b) => Number(a.lap) - Number(b.lap));
  const out = []; let prev = 1;
  sorted.forEach((stop, i) => {
    const lap = Number(stop.lap);
    out.push({ start: prev, end: lap, i, dur: stop.duration });
    prev = lap + 1;
  });
  out.push({ start: prev, end: Number(totalLaps) || 65, i: sorted.length });
  return out;
}


// ── SVG track outlines keyed by Jolpica/Ergast circuitId ─────────
// Each path is a simplified outline of the real circuit layout,
// normalised to fit within a ~200×140 viewBox.
// Circuit metadata (lap length, turns, DRS zones, inaugural year)
export const CIRCUIT_META = {
  bahrain: { lap: "5.412 km", turns: 15, drs: 3, est: 2004 },
  jeddah: { lap: "6.174 km", turns: 27, drs: 3, est: 2021 },
  albert_park: { lap: "5.278 km", turns: 16, drs: 4, est: 1996 },
  suzuka: { lap: "5.807 km", turns: 18, drs: 1, est: 1987 },
  shanghai: { lap: "5.451 km", turns: 16, drs: 2, est: 2004 },
  miami: { lap: "5.412 km", turns: 19, drs: 3, est: 2022 },
  imola: { lap: "4.909 km", turns: 19, drs: 2, est: 1980 },
  monaco: { lap: "3.337 km", turns: 19, drs: 1, est: 1950 },
  villeneuve: { lap: "4.361 km", turns: 14, drs: 3, est: 1978 },
  catalunya: { lap: "4.657 km", turns: 16, drs: 2, est: 1991 },
  silverstone: { lap: "5.891 km", turns: 18, drs: 2, est: 1950 },
  hungaroring: { lap: "4.381 km", turns: 14, drs: 1, est: 1986 },
  spa: { lap: "7.004 km", turns: 19, drs: 2, est: 1950 },
  zandvoort: { lap: "4.259 km", turns: 14, drs: 2, est: 1985 },
  monza: { lap: "5.793 km", turns: 11, drs: 2, est: 1950 },
  baku: { lap: "6.003 km", turns: 20, drs: 2, est: 2016 },
  marina_bay: { lap: "5.063 km", turns: 23, drs: 3, est: 2008 },
  americas: { lap: "5.513 km", turns: 20, drs: 2, est: 2012 },
  rodriguez: { lap: "4.304 km", turns: 17, drs: 3, est: 1963 },
  interlagos: { lap: "4.309 km", turns: 15, drs: 2, est: 1973 },
  las_vegas: { lap: "6.201 km", turns: 17, drs: 2, est: 2023 },
  vegas: { lap: "6.201 km", turns: 17, drs: 2, est: 2023 },
  yas_marina: { lap: "5.281 km", turns: 16, drs: 2, est: 2009 },
  sepang: { lap: "5.543 km", turns: 15, drs: 2, est: 1999 },
  losail: { lap: "5.380 km", turns: 16, drs: 2, est: 2021 },
  red_bull_ring: { lap: "4.318 km", turns: 10, drs: 3, est: 1970 },
  madring: { lap: "5.400 km", turns: 21, drs: 3, est: 2026 },
  portimao: { lap: "4.653 km", turns: 15, drs: 2, est: 2020 },
  istanbul: { lap: "5.338 km", turns: 14, drs: 3, est: 2005 },
};


// ── Human-readable display name overrides (API sometimes uses raw IDs) ─────
export const CIRCUIT_DISPLAY_NAMES = {
  madring: "Circuit de Madrid",
  villeneuve: "Circuit Gilles Villeneuve",
  americas: "Circuit of the Americas",
  rodriguez: "Autódromo Hermanos Rodríguez",
  interlagos: "Autódromo José Carlos Pace",
  losail: "Lusail International Circuit",
  portimao: "Algarve International Circuit",
  albert_park: "Albert Park Circuit",
  marina_bay: "Marina Bay Street Circuit",
  red_bull_ring: "Red Bull Ring",
  yas_marina: "Yas Marina Circuit",
  sepang: "Sepang International Circuit",
};


export function getCircuitDisplayName(c) {
  return CIRCUIT_DISPLAY_NAMES[c?.circuitId] || c?.circuitName || "Unknown Circuit";
}
