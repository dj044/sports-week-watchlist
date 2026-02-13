import React, { useEffect, useMemo, useState } from "react";
import { Calendar, Bell, RefreshCw, Search, Star, X } from "lucide-react";

// Sports Week Watchlist
// - Shows upcoming matches for the next 7 days
// - Supports Basketball (NBA), Soccer (top leagues via ESPN examples), Hockey (NHL)
// - Cricket is included as a category with a provider placeholder (since most reliable sources need an API key)
//
// NOTE: Some public endpoints used below are examples and may change.
// If an endpoint fails, the app gracefully falls back and lets you add a custom provider.

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(d) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(d);
}

function fmtTime(ts) {
  const d = new Date(ts);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  return new Date(date.getTime() + n * DAY_MS);
}

function safeGet(obj, path, fallback) {
  try {
    return path.split(".").reduce((acc, k) => acc?.[k], obj) ?? fallback;
  } catch {
    return fallback;
  }
}

// ---------- Provider adapters ----------
// Each adapter returns a normalized list of events:
// { id, sport, league, title, startTime, home, away, venue, status, url }

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function normalizeEspnScoreboard(json, sportLabel) {
  const events = safeGet(json, "events", []);
  return events
    .map((e) => {
      const id = e?.id ?? crypto.randomUUID();
      const league = safeGet(e, "league.name", safeGet(json, "leagues.0.name", ""));
      const startTime = e?.date;
      const comps = safeGet(e, "competitions.0.competitors", []);
      const home = comps.find((c) => c?.homeAway === "home");
      const away = comps.find((c) => c?.homeAway === "away");
      const venue = safeGet(e, "competitions.0.venue.fullName", "");
      const status = safeGet(e, "status.type.description", safeGet(e, "competitions.0.status.type.description", "Scheduled"));
      const url = safeGet(e, "links.0.href", "");
      const homeName = safeGet(home, "team.displayName", "Home");
      const awayName = safeGet(away, "team.displayName", "Away");
      return {
        id,
        sport: sportLabel,
        league,
        title: `${awayName} @ ${homeName}`,
        startTime,
        home: homeName,
        away: awayName,
        venue,
        status,
        url,
      };
    })
    .filter((x) => x.startTime);
}

// ESPN example endpoints (no key). If any fail, you can swap with your own providers.
const PROVIDERS = {
  basketball: {
    name: "Basketball",
    leagues: [
      {
        id: "nba",
        name: "NBA",
        kind: "espn",
        // ESPN scoreboard supports dates, but even without it returns a window.
        // We'll use the base endpoint and filter client-side.
        url: "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard",
      },
    ],
  },
  soccer: {
    name: "Soccer",
    leagues: [
      { id: "epl", name: "Premier League", kind: "espn", url: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard" },
      { id: "ucl", name: "UEFA Champions League", kind: "espn", url: "https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard" },
      { id: "laliga", name: "LaLiga", kind: "espn", url: "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard" },
    ],
  },
  hockey: {
    name: "Hockey",
    leagues: [
      { id: "nhl", name: "NHL", kind: "espn", url: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard" },
    ],
  },
  cricket: {
    name: "Cricket",
    leagues: [
      {
        id: "custom",
        name: "Add a Cricket Provider (API/RSS/ICS)",
        kind: "custom",
        url: "",
      },
    ],
  },
};

// Simple custom JSON provider format:
// [ {"title":"India vs Australia","startTime":"2026-02-15T18:00:00Z","league":"ICC","venue":"...","url":"..."}, ... ]
async function loadEventsForLeague(league, sportLabel) {
  if (league.kind === "espn") {
    const json = await fetchJson(league.url);
    return normalizeEspnScoreboard(json, sportLabel);
  }
  if (league.kind === "custom") {
    if (!league.url) return [];
    const json = await fetchJson(league.url);
    return (Array.isArray(json) ? json : []).map((e) => ({
      id: e.id ?? crypto.randomUUID(),
      sport: sportLabel,
      league: e.league ?? "Cricket",
      title: e.title ?? "Match",
      startTime: e.startTime,
      home: e.home ?? "",
      away: e.away ?? "",
      venue: e.venue ?? "",
      status: e.status ?? "Scheduled",
      url: e.url ?? "",
    }));
  }
  return [];
}

// ---------- Main component ----------

const defaultEnabled = {
  basketball: ["nba"],
  soccer: ["epl", "ucl"],
  hockey: ["nhl"],
  cricket: [],
};

function Pill({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-1.5 rounded-full text-sm border transition " +
        (active ? "bg-black text-white border-black" : "bg-white text-black border-zinc-200 hover:border-zinc-400")
      }
    >
      {children}
    </button>
  );
}

function Card({ children }) {
  return <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">{children}</div>;
}

function SectionTitle({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-zinc-100">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-xl border border-zinc-200">
          <Icon className="w-4 h-4" />
        </div>
        <div className="font-semibold">{title}</div>
      </div>
      {right}
    </div>
  );
}

function groupByDay(events) {
  const map = new Map();
  for (const e of events) {
    const d = new Date(e.startTime);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  }
  return [...map.entries()]
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .map(([k, v]) => ({ day: new Date(k), events: v.sort((x, y) => new Date(x.startTime) - new Date(y.startTime)) }));
}

function buildIcs(events, calendarName = "My Sports") {
  // Minimal iCalendar generator
  const lines = [];
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Sports Week Watchlist//EN");
  lines.push(`X-WR-CALNAME:${calendarName}`);

  for (const e of events) {
    const start = new Date(e.startTime);
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const dtStart = start.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const dtEnd = end.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const uid = `${e.id}@sports-week-watchlist`;

    const summary = (e.title || "Match").replace(/\n/g, " ");
    const location = (e.venue || "").replace(/\n/g, " ");
    const description = `${e.sport} • ${e.league}${e.url ? `\\n${e.url}` : ""}`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${summary}`);
    if (location) lines.push(`LOCATION:${location}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export default function SportsWeekWatchlistApp() {
  const [activeSport, setActiveSport] = useState("basketball");
  const [enabled, setEnabled] = useState(() => {
    const saved = localStorage.getItem("sww_enabled");
    return saved ? JSON.parse(saved) : defaultEnabled;
  });
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem("sww_favorites");
    return saved ? JSON.parse(saved) : [];
  });
  const [customCricketUrl, setCustomCricketUrl] = useState(() => localStorage.getItem("sww_cricket_url") ?? "");

  const [rangeStart, setRangeStart] = useState(() => startOfToday());
  const [rangeDays, setRangeDays] = useState(7);

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);

  const sport = PROVIDERS[activeSport];

  // Persist
  useEffect(() => {
    localStorage.setItem("sww_enabled", JSON.stringify(enabled));
  }, [enabled]);
  useEffect(() => {
    localStorage.setItem("sww_favorites", JSON.stringify(favorites));
  }, [favorites]);
  useEffect(() => {
    localStorage.setItem("sww_cricket_url", customCricketUrl);
  }, [customCricketUrl]);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const end = addDays(rangeStart, rangeDays);
      const enabledIds = enabled[activeSport] ?? [];

      const leagues = (sport.leagues ?? []).map((l) => {
        if (activeSport === "cricket" && l.kind === "custom") {
          return { ...l, url: customCricketUrl };
        }
        return l;
      });

      const chosen = leagues.filter((l) => enabledIds.includes(l.id));
      const all = [];
      for (const league of chosen) {
        const list = await loadEventsForLeague(league, sport.name);
        all.push(...list);
      }

      const filtered = all.filter((e) => {
        const t = new Date(e.startTime).getTime();
        return t >= rangeStart.getTime() && t < end.getTime();
      });

      setEvents(filtered);
    } catch (e) {
      setError(e?.message ?? "Failed to load matches");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSport, enabled, rangeStart, rangeDays, customCricketUrl]);

  const visibleEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = events.filter((e) => {
      if (!q) return true;
      return (
        (e.title ?? "").toLowerCase().includes(q) ||
        (e.league ?? "").toLowerCase().includes(q) ||
        (e.venue ?? "").toLowerCase().includes(q)
      );
    });

    // If favorites are set, prefer showing those first
    const favSet = new Set(favorites);
    return list.sort((a, b) => {
      const af = favSet.has(a.title) ? 1 : 0;
      const bf = favSet.has(b.title) ? 1 : 0;
      if (af !== bf) return bf - af;
      return new Date(a.startTime) - new Date(b.startTime);
    });
  }, [events, query, favorites]);

  const grouped = useMemo(() => groupByDay(visibleEvents), [visibleEvents]);

  function toggleLeague(id) {
    setEnabled((prev) => {
      const cur = new Set(prev[activeSport] ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...prev, [activeSport]: [...cur] };
    });
  }

  function toggleFavorite(title) {
    setFavorites((prev) => {
      const s = new Set(prev);
      if (s.has(title)) s.delete(title);
      else s.add(title);
      return [...s];
    });
  }

  async function enableNotifications() {
    try {
      if (!("Notification" in window)) {
        alert("Notifications not supported in this browser.");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      new Notification("Sports Watchlist", { body: "Notifications enabled. You'll still need the app open for reminders." });
    } catch {
      // ignore
    }
  }

  function exportWeekIcs() {
    const ics = buildIcs(visibleEvents, "My Sports (Next 7 Days)");
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-sports-next-7-days.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Lightweight in-app reminders (works only while page is open)
  useEffect(() => {
    const timers = [];
    if (Notification?.permission === "granted") {
      for (const e of visibleEvents) {
        const start = new Date(e.startTime).getTime();
        const notifyAt = start - 15 * 60 * 1000; // 15 minutes before
        const delay = notifyAt - Date.now();
        if (delay > 0 && delay < 7 * DAY_MS) {
          const t = setTimeout(() => {
            new Notification("Match starting soon", { body: `${e.title} • ${fmtTime(e.startTime)}` });
          }, delay);
          timers.push(t);
        }
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [visibleEvents]);

  const end = addDays(rangeStart, rangeDays);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-semibold tracking-tight">Sports Week Watchlist</div>
              <div className="text-sm text-zinc-600">See upcoming top-level matches for the next week so you don’t miss anything.</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={enableNotifications}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm hover:shadow"
              >
                <Bell className="w-4 h-4" /> Notifications
              </button>
              <button
                onClick={refresh}
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm hover:shadow"
              >
                <RefreshCw className={"w-4 h-4 " + (loading ? "animate-spin" : "")} /> Refresh
              </button>
            </div>
          </div>

          <Card>
            <div className="p-4 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {Object.entries(PROVIDERS).map(([key, val]) => (
                  <Pill key={key} active={activeSport === key} onClick={() => setActiveSport(key)}>
                    {val.name}
                  </Pill>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <div className="text-sm font-medium mb-2">Leagues</div>
                  <div className="flex flex-wrap gap-2">
                    {sport.leagues.map((l) => {
                      const isOn = (enabled[activeSport] ?? []).includes(l.id);
                      return (
                        <Pill key={l.id} active={isOn} onClick={() => toggleLeague(l.id)}>
                          {l.name}
                        </Pill>
                      );
                    })}
                  </div>
                  {activeSport === "cricket" && (
                    <div className="mt-3">
                      <div className="text-xs text-zinc-600 mb-1">Cricket provider URL (JSON feed). Example format in code comments.</div>
                      <div className="flex items-center gap-2">
                        <input
                          value={customCricketUrl}
                          onChange={(e) => setCustomCricketUrl(e.target.value)}
                          placeholder="https://your-domain.com/cricket.json"
                          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                        {customCricketUrl && (
                          <button
                            onClick={() => setCustomCricketUrl("")}
                            className="p-2 rounded-2xl border border-zinc-200 bg-white"
                            title="Clear"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Date range</div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={new Date(rangeStart).toISOString().slice(0, 10)}
                      onChange={(e) => {
                        const d = new Date(e.target.value + "T00:00:00");
                        setRangeStart(d);
                      }}
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    />
                    <select
                      value={rangeDays}
                      onChange={(e) => setRangeDays(Number(e.target.value))}
                      className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    >
                      <option value={7}>Next 7 days</option>
                      <option value={10}>Next 10 days</option>
                      <option value={14}>Next 14 days</option>
                    </select>
                  </div>
                  <div className="text-xs text-zinc-600 mt-2 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> {fmtDate(rangeStart)} → {fmtDate(addDays(rangeStart, rangeDays - 1))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={exportWeekIcs}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm hover:shadow"
                    >
                      <Calendar className="w-4 h-4" /> Export .ics
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-full">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search team, league, venue…"
                    className="w-full rounded-2xl border border-zinc-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>
                <div className="text-xs text-zinc-600 whitespace-nowrap">{visibleEvents.length} matches</div>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}
              {loading && <div className="text-sm text-zinc-600">Loading…</div>}
            </div>
          </Card>

          <Card>
            <SectionTitle
              icon={Star}
              title="Upcoming matches"
              right={
                <div className="text-xs text-zinc-600">
                  Tip: click ★ to favorite a matchup (favorites float to the top).
                </div>
              }
            />

            <div className="p-4">
              {grouped.length === 0 ? (
                <div className="text-sm text-zinc-600">No matches found in this range. Try enabling more leagues.</div>
              ) : (
                <div className="flex flex-col gap-4">
                  {grouped.map(({ day, events }) => (
                    <div key={day.toISOString()}>
                      <div className="text-sm font-semibold mb-2">{fmtDate(day)}</div>
                      <div className="grid grid-cols-1 gap-2">
                        {events.map((e) => {
                          const isFav = favorites.includes(e.title);
                          return (
                            <div
                              key={e.id}
                              className="rounded-2xl border border-zinc-200 bg-white px-3 py-3 flex items-start justify-between gap-3 hover:shadow-sm transition"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium truncate">{e.title}</div>
                                  <div className="text-xs text-zinc-600">• {e.league}</div>
                                </div>
                                <div className="text-sm text-zinc-700 mt-1">
                                  <span className="font-medium">{fmtTime(e.startTime)}</span>
                                  <span className="text-zinc-500"> · </span>
                                  <span className="text-zinc-600">{e.status}</span>
                                  {e.venue ? (
                                    <>
                                      <span className="text-zinc-500"> · </span>
                                      <span className="text-zinc-600 truncate">{e.venue}</span>
                                    </>
                                  ) : null}
                                </div>
                                {e.url ? (
                                  <a
                                    href={e.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-zinc-600 underline mt-1 inline-block"
                                  >
                                    Details
                                  </a>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleFavorite(e.title)}
                                  className={
                                    "p-2 rounded-2xl border transition " +
                                    (isFav ? "border-black bg-black text-white" : "border-zinc-200 bg-white hover:border-zinc-400")
                                  }
                                  title={isFav ? "Unfavorite" : "Favorite"}
                                >
                                  <Star className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 text-xs text-zinc-500">
                This app filters matches between {fmtDate(rangeStart)} and {fmtDate(addDays(rangeStart, rangeDays - 1))}. For
                true always-on reminders, export the .ics to Google/Apple Calendar.
              </div>
            </div>
          </Card>

          <Card>
            <SectionTitle icon={Bell} title="Make it yours" />
            <div className="p-4 text-sm text-zinc-700 space-y-2">
              <div>
                <span className="font-medium">Cricket:</span> most reliable schedules need an API key. If you have one, host a
                tiny JSON feed (or use any public JSON URL) and paste it into the Cricket provider field.
              </div>
              <div>
                <span className="font-medium">Teams:</span> If you want team-level favorites (not just matchups), the next step
                is adding a “favorite teams” list and filtering events by team name.
              </div>
              <div>
                <span className="font-medium">Mobile:</span> Turn this into a PWA (Add to Home Screen) so it feels like a real
                app and you can open it fast.
              </div>
            </div>
          </Card>

          <div className="text-xs text-zinc-500 px-1">
            Data sources: configured providers. Basketball/Soccer/Hockey use example ESPN scoreboard endpoints; you can swap providers
            later without changing the UI.
          </div>
        </div>
      </div>
    </div>
  );
}
