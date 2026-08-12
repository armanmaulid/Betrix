import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, RefreshCw, Info, Search, TrendingUp, CheckCircle2, Clock3, Zap } from "lucide-react";
import { useShellContext } from "../components/layout/TerminalShellLayout";
import { fetchEconomicCalendar, type CalendarEvent } from "../api/marketClient";
import { onLogout } from "../lib/authEvents";

const IMPACT_DOT: Record<CalendarEvent["importance"], string> = {
  high: "bg-[var(--danger)]",
  medium: "bg-[var(--accent)]",
  low: "bg-[var(--text-muted)]",
  none: "bg-[var(--border)]",
};
const IMPACT_LEVEL: Record<CalendarEvent["importance"], number> = { high: 3, medium: 2, low: 1, none: 0 };
const IMPACTS: Array<CalendarEvent["importance"]> = ["high", "medium", "low"];

type PeriodKey = "today" | "tomorrow" | "yesterday" | "this_week" | "next_week" | "last_week" | "this_month" | "next_month" | "last_month";
const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: "Hari Ini", tomorrow: "Besok", yesterday: "Kemarin",
  this_week: "Minggu Ini", next_week: "Minggu Depan", last_week: "Minggu Lalu",
  this_month: "Bulan Ini", next_month: "Bulan Depan", last_month: "Bulan Lalu",
};
// Tab yang ditampilkan sebagai chip di top bar.
// Disusun secara kronologis: Harian -> Mingguan -> Bulanan (Masa Lalu -> Sekarang -> Masa Depan)
const DAY_TABS: PeriodKey[] = [
  "yesterday", "today", "tomorrow",
  "last_week", "this_week", "next_week",
  "last_month", "this_month", "next_month"
];

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", EU: "Euro Zone", GB: "United Kingdom", JP: "Japan",
  AU: "Australia", NZ: "New Zealand", CA: "Canada", CH: "Switzerland",
  CN: "China", DE: "Germany", FR: "France", IT: "Italy", ES: "Spain",
  SG: "Singapore", ZA: "South Africa", IN: "India", ID: "Indonesia",
  KR: "South Korea", HK: "Hong Kong", MX: "Mexico", BR: "Brazil", RU: "Russia",
};

function countryLabel(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

function flagEmoji(code: string): string {
  if (!code || code.length !== 2) return "🏳️";
  const points = [...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...points);
}

interface FilterState {
  countries: Set<string>;
  currencies: Set<string>;
  impacts: Set<CalendarEvent["importance"]>;
  showOnlyWithData: boolean;
  period: PeriodKey;
  text: string;
}

function getPeriodRange(period: PeriodKey): { from: Date; to: Date } {
  const now = new Date();
  if (period === "yesterday" || period === "today" || period === "tomorrow") {
    const dayOffset = period === "yesterday" ? -1 : period === "tomorrow" ? 1 : 0;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 23, 59, 59, 999);
    return { from, to };
  }
  if (period === "last_week" || period === "this_week" || period === "next_week") {
    const day = now.getDay();
    const weekOffset = period === "last_week" ? -1 : period === "next_week" ? 1 : 0;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + weekOffset * 7, 0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    to.setMilliseconds(to.getMilliseconds() - 1);
    return { from, to };
  }
  const monthOffset = period === "last_month" ? -1 : period === "next_month" ? 1 : 0;
  const from = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const withYear = d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }).toUpperCase();
  if (d.toDateString() === now.toDateString()) return `HARI INI · ${withYear}`;
  if (d.toDateString() === tomorrow.toDateString()) return `BESOK · ${withYear}`;
  return withYear;
}

function formatValue(val: string | null): string {
  return val ?? "-";
}

// Kolom tabel memanfaatkan lebar halaman penuh: Actual (kanan, paling lebar,
// bold) sebagai fokus utama, sesuai mental model trader yang menunggu rilis.
const CAL_COLS = "grid grid-cols-[56px_72px_46px_1fr_96px_96px_110px] items-center gap-3 pr-4";

// Strength indicator: 3 bintang, makin tinggi makin berat dampaknya.
function ImpactBars({ importance }: { importance: CalendarEvent["importance"] }) {
  const level = IMPACT_LEVEL[importance];
  return (
    <span className="flex items-center justify-center gap-[2px]" title={`Impact: ${importance}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={"inline-block w-[12px] text-center text-[12px] leading-none " + (i < level ? "text-yellow-500" : "text-[var(--border)]")}>
          {i < level ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

function actualTone(ev: CalendarEvent): string {
  if (ev.actual === null || ev.forecast === null) return "text-[var(--text-primary)]";
  const a = Number.parseFloat(ev.actual);
  const f = Number.parseFloat(ev.forecast);
  if (Number.isNaN(a) || Number.isNaN(f)) return "text-[var(--text-primary)]";
  return a > f ? "text-[var(--success)]" : a < f ? "text-[var(--danger)]" : "text-[var(--text-primary)]";
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-2 border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5">
      <span className={tone}>{icon}</span>
      <div className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tabular text-[var(--text-primary)]">{value}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      </div>
    </div>
  );
}

export function EconomicCalendarPage() {
  const { setRightPanel, setOnSearch } = useShellContext();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [availableCountries, setAvailableCountries] = useState<string[]>([]);
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>([]);

  const didInitFilters = useRef(false);
  const scrolledForKeyRef = useRef<string | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const [filter, setFilter] = useState<FilterState>({
    countries: new Set(),
    currencies: new Set(),
    impacts: new Set(["high", "medium"]),
    showOnlyWithData: false,
    period: "this_week",
    text: "",
  });

  async function load(forceRefresh = false) {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchEconomicCalendar(forceRefresh);
      setEvents(data.events);
      setGeneratedAt(data.generatedAt);

      const countrySet = new Set<string>();
      const currencySet = new Set<string>();
      for (const ev of data.events) {
        countrySet.add(ev.country);
        currencySet.add(ev.currency);
      }
      const countries = Array.from(countrySet).sort();
      const currencies = Array.from(currencySet).sort();
      setAvailableCountries(countries);
      setAvailableCurrencies(currencies);

      if (!didInitFilters.current) {
        didInitFilters.current = true;
        setFilter((prev) => ({
          ...prev,
          countries: new Set(countries),
          currencies: new Set(currencies.filter((c) => c === "USD")),
        }));
      } else {
        setFilter((prev) => {
          const nextCountries = new Set(prev.countries);
          countries.forEach((c) => nextCountries.add(c));
          return { ...prev, countries: nextCountries };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat calendar");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Hubungkan search bar global shell → filter teks event.
    setOnSearch((s: string) => setFilter((prev) => ({ ...prev, text: s })));
    setRightPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live update via SSE calendar_update (relay dari mt5-bridge).
  useEffect(() => {
    const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const token = localStorage.getItem("eaconsole.sessionToken") || "";
    if (!token) return;

    const es = new EventSource(`${BACKEND_URL}/api/news/stream?token=${token}`);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasConnectedBefore = false;
    es.onopen = () => {
      if (hasConnectedBefore) load(true);
      hasConnectedBefore = true;
    };
    es.addEventListener("calendar_update", () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => load(true), 500);
    });
    es.onerror = () => {};
    const unsubscribeLogout = onLogout(() => es.close());
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribeLogout();
      es.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const periodRange = getPeriodRange(filter.period);
  const nowMs = Date.now();

  const filtered = useMemo(() => events.filter((ev) => {
    if (!filter.countries.has(ev.country)) return false;
    if (!filter.currencies.has(ev.currency)) return false;
    if (!filter.impacts.has(ev.importance)) return false;
    if (filter.showOnlyWithData && ev.actual === null && ev.forecast === null && ev.previous === null) return false;
    const evMs = new Date(ev.time).getTime();
    if (evMs < periodRange.from.getTime() || evMs > periodRange.to.getTime()) return false;
    if (filter.text && !ev.event.toLowerCase().includes(filter.text.toLowerCase()) && !ev.currency.toLowerCase().includes(filter.text.toLowerCase())) return false;
    return true;
  }), [events, filter, periodRange]);

  // Auto-scroll ke grup "hari ini" sekali per data+filter.
  useEffect(() => {
    if (isLoading || filtered.length === 0) return;
    const todayKey = new Date().toDateString();
    const scrollKey = `${todayKey}|${filtered.length}|${filter.period}`;
    if (scrolledForKeyRef.current === scrollKey) return;
    const hasToday = filtered.some((ev) => new Date(ev.time).toDateString() === todayKey);
    if (!hasToday || !listContainerRef.current) return;
    const el = listContainerRef.current.querySelector(`[data-date-key="${CSS.escape(todayKey)}"]`);
    if (el) {
      const containerRect = listContainerRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      listContainerRef.current.scrollBy({ top: elRect.top - containerRect.top, behavior: "auto" });
      scrolledForKeyRef.current = scrollKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, filtered.length, filter.period]);

  function toggleCountry(code: string) {
    const next = new Set(filter.countries);
    next.has(code) ? next.delete(code) : next.add(code);
    setFilter({ ...filter, countries: next });
  }
  function toggleCurrency(code: string) {
    const next = new Set(filter.currencies);
    next.has(code) ? next.delete(code) : next.add(code);
    setFilter({ ...filter, currencies: next });
  }
  function toggleImpact(impact: CalendarEvent["importance"]) {
    const next = new Set(filter.impacts);
    next.has(impact) ? next.delete(impact) : next.add(impact);
    setFilter({ ...filter, impacts: next });
  }
  function resetFilters() {
    setFilter({
      countries: new Set(availableCountries),
      currencies: new Set(availableCurrencies.filter((c) => c === "USD")),
      impacts: new Set(["high", "medium"]),
      showOnlyWithData: false,
      period: "this_week",
      text: "",
    });
  }

  const groups = useMemo(() => {
    const g: Record<string, CalendarEvent[]> = {};
    for (const ev of filtered) (g[new Date(ev.time).toDateString()] ??= []).push(ev);
    return g;
  }, [filtered]);

  // KPI strip untuk periode terpilih.
  const stats = useMemo(() => {
    let high = 0, released = 0, upcoming = 0;
    for (const ev of filtered) {
      if (ev.importance === "high") high++;
      if (ev.actual !== null) released++;
      else if (new Date(ev.time).getTime() > nowMs) upcoming++;
    }
    return { high, released, upcoming, total: filtered.length };
  }, [filtered, nowMs]);

  const activeFilterCount =
    (filter.impacts.size !== 2 ? 1 : 0) +
    (filter.currencies.size !== 1 ? 1 : 0) +
    (filter.countries.size !== availableCountries.length ? 1 : 0) +
    (filter.showOnlyWithData ? 1 : 0) +
    (filter.text ? 1 : 0);

  return (
    <div className="flex h-full overflow-hidden bg-[#050505]">
      {/* Main — tabel kalender (kiri) */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-[#222] py-2 pr-4">
          <div className="flex items-center gap-3">
            <span className="bx-section-tag">
              <CalendarClock size={12} className="text-black" />
              Calendar
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-[#00ff00]">
              <div className="h-1.5 w-1.5 animate-pulse bg-[#00ff00]"></div>
              LIVE
            </span>
            <span className="font-mono text-[11px] text-[#888]">{filtered.length} events</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 mt-2 sm:mt-0">
            {DAY_TABS.map((p) => (
              <button
                key={p}
                onClick={() => setFilter({ ...filter, period: p })}
                className={`px-3 py-1 text-[10px] font-bold uppercase transition-colors ${
                  filter.period === p
                    ? "bg-[#ff6600] text-black"
                    : "text-[#888] hover:text-[#fff]"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
            
            <div className="flex items-center gap-2 ml-2">
              {filter.text && (
                <span className="flex items-center gap-1 border border-[#333] bg-[#222]/30 px-2 py-1 text-[10px] text-[#ff6600]">
                  <Search size={10} /> "{filter.text}"
                  <button onClick={() => setFilter({ ...filter, text: "" })} className="ml-0.5 hover:text-white">✕</button>
                </span>
              )}
              <button
                onClick={() => load(true)}
                disabled={isLoading}
                className="flex items-center gap-1 border border-[#333] px-3 py-1 text-[10px] font-bold uppercase text-[#888] transition-colors hover:border-[#555] hover:text-[#fff] disabled:opacity-50"
              >
                <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} /> REFRESH
              </button>
            </div>
          </div>
        </div>

        {/* KPI strip */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface)] py-2 pr-4">
          <StatCard icon={<Zap size={14} />} label="High Impact" value={stats.high} tone="text-[var(--danger)]" />
          <StatCard icon={<CheckCircle2 size={14} />} label="Dirilis" value={stats.released} tone="text-[var(--success)]" />
          <StatCard icon={<Clock3 size={14} />} label="Mendatang" value={stats.upcoming} tone="text-[var(--accent)]" />
          <StatCard icon={<TrendingUp size={14} />} label="Total" value={stats.total} tone="text-[var(--text-muted)]" />
        </div>

        {/* Column header sticky */}
        <div className={CAL_COLS + " border-b border-[var(--border)] bg-[var(--surface)] py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]"}>
          <span>Time</span>
          <span className="text-center">Cur</span>
          <span className="text-center">Imp.</span>
          <span>Event</span>
          <span className="text-right">Previous</span>
          <span className="text-right">Forecast</span>
          <span className="text-right">Actual</span>
        </div>

        {/* List */}
        <div ref={listContainerRef} className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="px-4 py-3 text-xs text-[var(--text-muted)]">Memuat...</p>
          ) : error ? (
            <div className="flex items-start gap-1.5 px-4 py-3 text-xs text-[var(--danger)]">
              <Info size={12} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-[var(--text-muted)]">
                Tidak ada event di {PERIOD_LABELS[filter.period]} dengan filter ini
              </p>
              <button onClick={resetFilters} className="mt-2 text-[10px] text-[var(--accent)] hover:underline">
                Reset filter
              </button>
            </div>
          ) : (
            Object.entries(groups).map(([dateKey, groupEvents]) => {
              const isToday = dateKey === new Date().toDateString();
              const past = isToday ? groupEvents.filter((ev) => new Date(ev.time).getTime() <= nowMs) : groupEvents;
              const future = isToday ? groupEvents.filter((ev) => new Date(ev.time).getTime() > nowMs) : [];
              const showNowLine = isToday && past.length > 0 && future.length > 0;

              return (
                <div key={dateKey} data-date-key={dateKey}>
                  <div className="sticky top-0 z-[5] border-b border-[var(--border)] bg-[var(--surface)] py-1 pr-4 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    {formatDate(dateKey)}
                  </div>
                  {past.map((ev, i) => (
                    <EventRow key={`p-${i}`} ev={ev} />
                  ))}
                  {showNowLine && (
                    <div className="flex items-center gap-2 py-1 pr-4">
                      <span className="h-px flex-1 bg-[#00d9ff]/50" />
                      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-[#00d9ff]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00d9ff]" /> Sekarang
                      </span>
                      <span className="h-px flex-1 bg-[#00d9ff]/50" />
                    </div>
                  )}
                  {future.map((ev, i) => (
                    <EventRow key={`f-${i}`} ev={ev} />
                  ))}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {generatedAt && !isLoading && (
          <div className="border-t border-[var(--border)] px-4 py-1 text-[9px] text-[var(--text-muted)]">
            Data dari MT5 · {new Date(generatedAt).toLocaleString("id-ID")} · {filtered.length} events
            {filter.text && ` · filter: "${filter.text}"`}
          </div>
        )}
      </main>

      {/* Right rail — facet filter. Lebar 300px (token right-sidebar global),
      tampil dari lg ke atas. Di bawah lg disembunyikan (ruang terbatas). */}
      <aside className="bx-right-sidebar hidden w-[300px] flex-shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] lg:flex">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
            <Search size={11} /> Filters
          </span>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="text-[9px] font-semibold uppercase text-[var(--text-muted)] hover:text-[var(--accent)]">
              Reset ({activeFilterCount})
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {/* Priority */}
          <div className="mb-4">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Priority</div>
            <div className="flex flex-wrap gap-1.5">
              {IMPACTS.map((imp) => {
                const active = filter.impacts.has(imp);
                return (
                  <button
                    key={imp}
                    onClick={() => toggleImpact(imp)}
                    className={
                      "flex items-center gap-1 border px-2 py-1 text-[10px] font-semibold uppercase transition-colors " +
                      (active
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]")
                    }
                  >
                    <span className={"h-1.5 w-1.5 " + IMPACT_DOT[imp]} />
                    {imp}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Currency */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <span>Currency</span>
              <span className="flex gap-2 normal-case">
                <button onClick={() => setFilter({ ...filter, currencies: new Set(availableCurrencies) })} className="text-[var(--accent)] hover:underline">All</button>
                <button onClick={() => setFilter({ ...filter, currencies: new Set() })} className="text-[var(--text-muted)] hover:underline">None</button>
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {availableCurrencies.map((code) => {
                const active = filter.currencies.has(code);
                return (
                  <button
                    key={code}
                    onClick={() => toggleCurrency(code)}
                    className={
                      "border px-1.5 py-0.5 text-[10px] font-bold transition-colors " +
                      (active
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]")
                    }
                  >
                    {code}
                  </button>
                );
              })}
              {availableCurrencies.length === 0 && <p className="text-[10px] text-[var(--text-muted)]">Belum ada data</p>}
            </div>
          </div>

          {/* Country */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <span>Country</span>
              <span className="flex gap-2 normal-case">
                <button onClick={() => setFilter({ ...filter, countries: new Set(availableCountries) })} className="text-[var(--accent)] hover:underline">All</button>
                <button onClick={() => setFilter({ ...filter, countries: new Set() })} className="text-[var(--text-muted)] hover:underline">None</button>
              </span>
            </div>
            <div className="space-y-0.5">
              {availableCountries.map((code) => {
                const active = filter.countries.has(code);
                return (
                  <button
                    key={code}
                    onClick={() => toggleCountry(code)}
                    className={
                      "flex w-full items-center gap-2 px-1 py-0.5 text-left text-[11px] transition-colors " +
                      (active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--accent)]")
                    }
                  >
                    <span className={"h-1 w-1 rounded-full " + (active ? "bg-[var(--accent)]" : "bg-[var(--border)]")} />
                    <span className="text-[12px]">{flagEmoji(code)}</span>
                    <span className="font-bold">{code}</span>
                    <span className="truncate text-[10px] text-[var(--text-muted)]">{countryLabel(code)}</span>
                  </button>
                );
              })}
              {availableCountries.length === 0 && <p className="text-[10px] text-[var(--text-muted)]">Belum ada data</p>}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 py-2 text-[11px] hover:text-[var(--accent)]">
            <input type="checkbox" checked={filter.showOnlyWithData} onChange={(e) => setFilter({ ...filter, showOnlyWithData: e.target.checked })} className="mt-0.5 h-3 w-3 accent-[var(--accent)]" />
            <span>
              Show only with data
              <span className="mt-0.5 block text-[9px] text-[var(--text-muted)]">Hide tanpa Prev/Forecast/Actual</span>
            </span>
          </label>
        </div>
      </aside>
    </div>
  );
}

function EventRow({ ev }: { ev: CalendarEvent }) {
  const isHigh = ev.importance === "high";
  return (
    <div
      className={
        CAL_COLS + " border-b border-[var(--border)] py-1.5 text-[11px] hover:bg-[var(--surface-alt)]"
      }
    >
      <span className="tabular text-[var(--text-primary)]">{formatTime(ev.time)}</span>
      <span className="flex items-center justify-center gap-1 font-bold text-[var(--text-primary)]" title={countryLabel(ev.country)}>
        <span className="text-[13px]">{flagEmoji(ev.country)}</span>
        <span>{ev.currency}</span>
      </span>
      <span className="flex justify-center"><ImpactBars importance={ev.importance} /></span>
      <span className={"truncate " + (isHigh ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-primary)]")} title={ev.event}>{ev.event}</span>
      <span className="text-right tabular text-[var(--text-muted)]">{formatValue(ev.previous)}</span>
      <span className="text-right tabular text-[var(--text-muted)]">{formatValue(ev.forecast)}</span>
      <span className={"text-right tabular font-bold " + actualTone(ev)}>{formatValue(ev.actual)}</span>
    </div>
  );
}
