import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, RefreshCw, Info, Filter, X } from "lucide-react";
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

type PeriodKey = "last_week" | "this_week" | "next_week" | "last_month" | "this_month" | "next_month";
const PERIOD_LABELS: Record<PeriodKey, string> = {
  last_week: "Minggu Lalu", this_week: "Minggu Ini", next_week: "Minggu Depan",
  last_month: "Bulan Lalu", this_month: "Bulan Ini", next_month: "Bulan Depan",
};
const PERIOD_ORDER: PeriodKey[] = ["last_week", "this_week", "next_week", "last_month", "this_month", "next_month"];

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
}

function getPeriodRange(period: PeriodKey): { from: Date; to: Date } {
  const now = new Date();
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

// Template grid bersama header kolom & baris event, selaras seperti tabel
// Investing.com: Time | Cur(flag+code) | Imp | Event | Actual | Forecast | Previous
const CAL_COLS = "grid grid-cols-[44px_54px_48px_1fr_64px_64px_64px] items-center gap-2 px-3";

function ImpactDots({ importance }: { importance: CalendarEvent["importance"] }) {
  const level = IMPACT_LEVEL[importance];
  const color = IMPACT_DOT[importance];
  return (
    <span className="flex items-center gap-0.5" title={`Impact: ${importance}`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={"h-1.5 w-1.5 rounded-full " + (i < level ? color : "bg-[var(--border)]")} />
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

export function EconomicCalendarPage() {
  const { setRightPanel, setOnSearch } = useShellContext();

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

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
    setOnSearch(() => {});
    setRightPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live update via SSE calendar_update (relay dari mt5-bridge).
  useEffect(() => {
    const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    const token = localStorage.getItem("eaconsole.sessionToken") || "";
    if (!token) return;

    const es = new EventSource(`${BACKEND_URL}/api/market/stream?calendar=1&token=${token}`);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
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

  const filtered = useMemo(() => events.filter((ev) => {
    if (!filter.countries.has(ev.country)) return false;
    if (!filter.currencies.has(ev.currency)) return false;
    if (!filter.impacts.has(ev.importance)) return false;
    if (filter.showOnlyWithData && ev.actual === null && ev.forecast === null && ev.previous === null) return false;
    const evMs = new Date(ev.time).getTime();
    if (evMs < periodRange.from.getTime() || evMs > periodRange.to.getTime()) return false;
    return true;
  }), [events, filter, periodRange]);

  // Auto-scroll ke grup "hari ini" sekali per data+filter.
  useEffect(() => {
    if (isLoading || filtered.length === 0) return;
    const todayKey = new Date().toDateString();
    const scrollKey = `${todayKey}|${filtered.length}`;
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
    });
  }

  const groups = useMemo(() => {
    const g: Record<string, CalendarEvent[]> = {};
    for (const ev of filtered) (g[new Date(ev.time).toDateString()] ??= []).push(ev);
    return g;
  }, [filtered]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#050505]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-l-2 border-b-[var(--border)] border-l-[var(--accent)] bg-[var(--surface)] px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-cyan-400">
          <CalendarClock size={14} className="text-[var(--accent)]" />
          Economic Calendar
        </span>
        <div className="flex items-center gap-2">
          <select
            value={filter.period}
            onChange={(e) => setFilter({ ...filter, period: e.target.value as PeriodKey })}
            aria-label="Pilih periode tanggal"
            className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-primary)] hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none"
          >
            {PERIOD_ORDER.map((p) => (
              <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
            ))}
          </select>
          <button
            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            aria-label="Toggle filter panel"
            className={
              "flex items-center gap-1 border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors " +
              (filterPanelOpen
                ? "border-[var(--accent)] bg-[var(--accent)] text-[#050505]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]")
            }
          >
            <Filter size={11} />
            Filter
          </button>
          <button
            onClick={() => load(true)}
            disabled={isLoading}
            aria-label="Muat ulang calendar"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Column header sticky */}
      <div className={CAL_COLS + " border-b border-[var(--border)] bg-[var(--surface)] py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]"}>
        <span>Time</span>
        <span className="text-center">Cur</span>
        <span className="text-center">Imp.</span>
        <span>Event</span>
        <span className="text-right">Actual</span>
        <span className="text-right">Forecast</span>
        <span className="text-right">Previous</span>
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
          <div className="px-4 py-6 text-center">
            <p className="text-xs text-[var(--text-muted)]">
              Tidak ada event di {PERIOD_LABELS[filter.period]} dengan filter ini
            </p>
            <button onClick={resetFilters} className="mt-2 text-[10px] text-[var(--accent)] hover:underline">
              Reset filter
            </button>
          </div>
        ) : (
          Object.entries(groups).map(([dateKey, groupEvents]) => (
            <div key={dateKey} data-date-key={dateKey}>
              <div className="sticky top-0 z-[5] border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                {formatDate(dateKey)}
              </div>
              {groupEvents.map((ev, i) => (
                <div key={i} className={CAL_COLS + " border-b border-[var(--border)] py-1.5 text-[11px] hover:bg-[var(--surface-alt)]"}>
                  <span className="tabular text-[var(--text-primary)]">{formatTime(ev.time)}</span>
                  <span className="flex items-center justify-center gap-1 font-bold text-[var(--text-primary)]" title={countryLabel(ev.country)}>
                    <span className="text-[12px]">{flagEmoji(ev.country)}</span>
                    <span>{ev.currency}</span>
                  </span>
                  <span className="flex justify-center"><ImpactDots importance={ev.importance} /></span>
                  <span className="truncate text-[var(--text-primary)]" title={ev.event}>{ev.event}</span>
                  <span className={"text-right tabular font-bold " + actualTone(ev)}>{formatValue(ev.actual)}</span>
                  <span className="text-right tabular text-[var(--text-muted)]">{formatValue(ev.forecast)}</span>
                  <span className="text-right tabular text-[var(--text-muted)]">{formatValue(ev.previous)}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {generatedAt && !isLoading && (
        <div className="border-t border-[var(--border)] px-3 py-1 text-[9px] text-[var(--text-muted)]">
          Data dari MT5 · {new Date(generatedAt).toLocaleString("id-ID")} · {filtered.length} events
        </div>
      )}

      {/* Filter Detail Panel - Slide from right */}
      {filterPanelOpen && (
        <div className="absolute inset-y-0 right-0 z-50 w-64 animate-[slide-in-right_0.2s_ease-out] border-l border-[var(--border)] bg-[var(--surface)] shadow-[0_0_24px_rgba(0,0,0,0.6)]">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">Filter Options</span>
              <button
                onClick={() => setFilterPanelOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Close filter panel"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              <div className="mb-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Priority</div>
                <div className="space-y-1">
                  {IMPACTS.map((imp) => (
                    <label key={imp} className="flex cursor-pointer items-center gap-2 text-[11px] hover:text-[var(--accent)]">
                      <input type="checkbox" checked={filter.impacts.has(imp)} onChange={() => toggleImpact(imp)} className="h-3 w-3 accent-[var(--accent)]" />
                      <span className={"h-1.5 w-1.5 " + IMPACT_DOT[imp]} />
                      <span className="font-semibold capitalize">{imp}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  <span>Currency</span>
                  <span className="flex gap-2 normal-case">
                    <button onClick={() => setFilter({ ...filter, currencies: new Set(availableCurrencies) })} className="text-[var(--accent)] hover:underline">Semua</button>
                    <button onClick={() => setFilter({ ...filter, currencies: new Set() })} className="text-[var(--text-muted)] hover:underline">Kosongkan</button>
                  </span>
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {availableCurrencies.map((code) => (
                    <label key={code} className="flex cursor-pointer items-center gap-2 text-[11px] hover:text-[var(--accent)]">
                      <input type="checkbox" checked={filter.currencies.has(code)} onChange={() => toggleCurrency(code)} className="h-3 w-3 accent-[var(--accent)]" />
                      <span className="font-semibold">{code}</span>
                    </label>
                  ))}
                  {availableCurrencies.length === 0 && <p className="text-[10px] text-[var(--text-muted)]">Belum ada data</p>}
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  <span>Country</span>
                  <span className="flex gap-2 normal-case">
                    <button onClick={() => setFilter({ ...filter, countries: new Set(availableCountries) })} className="text-[var(--accent)] hover:underline">Semua</button>
                    <button onClick={() => setFilter({ ...filter, countries: new Set() })} className="text-[var(--text-muted)] hover:underline">Kosongkan</button>
                  </span>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {availableCountries.map((code) => (
                    <label key={code} className="flex cursor-pointer items-center gap-2 text-[11px] hover:text-[var(--accent)]">
                      <input type="checkbox" checked={filter.countries.has(code)} onChange={() => toggleCountry(code)} className="h-3 w-3 accent-[var(--accent)]" />
                      <span>{flagEmoji(code)}</span>
                      <span className="font-semibold">{code}</span>
                      <span className="truncate text-[var(--text-muted)]">{countryLabel(code)}</span>
                    </label>
                  ))}
                  {availableCountries.length === 0 && <p className="text-[10px] text-[var(--text-muted)]">Belum ada data</p>}
                </div>
              </div>

              <div className="mb-4">
                <label className="flex cursor-pointer items-start gap-2 text-[11px] hover:text-[var(--accent)]">
                  <input type="checkbox" checked={filter.showOnlyWithData} onChange={(e) => setFilter({ ...filter, showOnlyWithData: e.target.checked })} className="mt-0.5 h-3 w-3 accent-[var(--accent)]" />
                  <span>
                    Show only events with data
                    <span className="mt-1 block text-[9px] text-[var(--text-muted)]">Hide events tanpa Prev/Forecast/Actual</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="border-t border-[var(--border)] px-3 py-2">
              <button
                onClick={resetFilters}
                className="w-full border border-[var(--border)] py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Reset to Default
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
