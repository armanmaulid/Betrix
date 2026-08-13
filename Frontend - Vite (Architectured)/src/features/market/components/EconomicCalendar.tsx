import React, { useEffect, useRef, useState } from "react";
import { CalendarClock, RefreshCw, Info, Filter, X } from "lucide-react";
import { type CalendarEvent } from "../api/marketClient";
import { useEconomicCalendar, marketKeys } from "../api/queries";
import { useQueryClient } from "@tanstack/react-query";
import { getSharedEventSource } from "../hooks/useTickerPrices";

const IMPACT_DOT: Record<CalendarEvent["importance"], string> = {
  high: "bg-[var(--danger)]",
  medium: "bg-[var(--accent)]",
  low: "bg-[var(--text-muted)]",
  none: "bg-[var(--border)]",
};

const IMPACTS: Array<CalendarEvent["importance"]> = ["high", "medium", "low"];

type PeriodKey = "last_week" | "this_week" | "next_week" | "last_month" | "this_month" | "next_month";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  last_week: "Minggu Lalu",
  this_week: "Minggu Ini",
  next_week: "Minggu Depan",
  last_month: "Bulan Lalu",
  this_month: "Bulan Ini",
  next_month: "Bulan Depan",
};
const PERIOD_ORDER: PeriodKey[] = ["last_week", "this_week", "next_week", "last_month", "this_month", "next_month"];

// Label negara yang umum dipakai - fallback ke kode ISO-nya sendiri kalau
// nggak ada di daftar (daftar ini sengaja nggak lengkap, cuma buat mempercantik
// tampilan filter, bukan sumber data).
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

// ISO alpha-2 -> flag emoji, murni dari Unicode regional indicator symbols,
// nggak butuh asset gambar apapun. "EU" juga didukung Unicode sebagai
// pengecualian resmi (flag Uni Eropa).
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
    const day = now.getDay(); // 0=Minggu..6=Sabtu
    const diffToSunday = -day; // minggu mulai Minggu
    const weekOffset = period === "last_week" ? -1 : period === "next_week" ? 1 : 0;
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToSunday + weekOffset * 7, 0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    to.setMilliseconds(to.getMilliseconds() - 1); // Sabtu 23:59:59.999
    return { from, to };
  }

  const monthOffset = period === "last_month" ? -1 : period === "next_month" ? 1 : 0;
  const from = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  // Backend ngirim ISO-8601 UTC ("...Z") - timeZone sengaja nggak di-set
  // eksplisit di sini, jadi Intl otomatis pakai timezone lokal device/
  // browser user buat nampilin jamnya.
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
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
  if (!val) return "-";
  return val;
}

// Bloomberg Terminal style: filter toolbar + expandable detail panel + data columns
export const EconomicCalendar = React.memo(function EconomicCalendar() {
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

  const periodRange = getPeriodRange(filter.period);
  const fromDateStr = periodRange.from.toISOString().slice(0, 10);
  const toDateStr = periodRange.to.toISOString().slice(0, 10);

  const { data, isLoading, error: queryError, refetch } = useEconomicCalendar(fromDateStr, toDateStr);
  const events = data?.events || [];
  const generatedAt = data?.generatedAt || null;
  const error = queryError ? queryError.message : null;

  useEffect(() => {
    if (!data) return;
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
        currencies: new Set(currencies),
      }));
    } else {
      setFilter((prev) => {
        const nextCountries = new Set(prev.countries);
        countries.forEach((c) => nextCountries.add(c));
        return { ...prev, countries: nextCountries };
      });
    }
  }, [data]);

  const queryClient = useQueryClient();

  // Live update: dengerin event calendar_update dari backend
  useEffect(() => {
    const es = getSharedEventSource();
    if (!es) return;

    const onCalendarUpdate = (e: MessageEvent) => {
      try {
        const updated = JSON.parse(e.data);
        queryClient.setQueryData(marketKeys.calendar(fromDateStr, toDateStr), (old: any) => {
          if (!old) return old;
          return {
            ...old,
            events: old.events.map((ev: any) =>
              ev.eventId === updated.eventId
                ? { ...ev, actual: updated.actual, forecast: updated.forecast, previous: updated.previous }
                : ev
            )
          };
        });
      } catch (err) {
        console.error("Failed to parse calendar_update", err);
      }
    };

    es.addEventListener("calendar_update", onCalendarUpdate);

    return () => {
      es.removeEventListener("calendar_update", onCalendarUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDateStr, toDateStr, queryClient]);

  // periodRange is already defined above
  // Apply filters
  const filtered = events.filter((ev) => {
    if (!filter.countries.has(ev.country)) return false;
    if (!filter.currencies.has(ev.currency)) return false;
    if (!filter.impacts.has(ev.importance)) return false;
    if (filter.showOnlyWithData && ev.actual === null && ev.forecast === null && ev.previous === null) {
      return false;
    }
    const evMs = new Date(ev.time).getTime();
    if (evMs < periodRange.from.getTime() || evMs > periodRange.to.getTime()) return false;
    return true;
  });

  // Auto-scroll ke grup "hari ini" begitu data (ter-filter) siap - sekali
  // per kombinasi data+filter, bukan tiap render, biar nggak ganggu kalau
  // user lagi scroll manual.
  useEffect(() => {
    if (isLoading || filtered.length === 0) return;
    const todayKey = new Date().toDateString();
    const scrollKey = `${todayKey}|${filtered.length}`;
    if (scrolledForKeyRef.current === scrollKey) return;

    const hasToday = filtered.some((ev) => new Date(ev.time).toDateString() === todayKey);
    if (!hasToday || !listContainerRef.current) return;

    const el = listContainerRef.current.querySelector(`[data-date-key="${CSS.escape(todayKey)}"]`);
    if (el) {
      // FIX: Gunakan scrollBy pada container alih-alih scrollIntoView agar tidak nge-scroll halaman utama
      const containerRect = listContainerRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      listContainerRef.current.scrollBy({
        top: elRect.top - containerRect.top,
        behavior: "auto"
      });
      scrolledForKeyRef.current = scrollKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, filtered.length, filter.period]);

  function toggleCountry(code: string) {
    const next = new Set(filter.countries);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setFilter({ ...filter, countries: next });
  }

  function toggleCurrency(code: string) {
    const next = new Set(filter.currencies);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setFilter({ ...filter, currencies: next });
  }

  function toggleImpact(impact: CalendarEvent["importance"]) {
    const next = new Set(filter.impacts);
    if (next.has(impact)) next.delete(impact);
    else next.add(impact);
    setFilter({ ...filter, impacts: next });
  }

  function resetFilters() {
    setFilter({
      countries: new Set(availableCountries),
      currencies: new Set(availableCurrencies),
      impacts: new Set(["high", "medium"]),
      showOnlyWithData: false,
      period: "this_week",
    });
  }

  return (
    <div className="relative flex h-[420px] flex-col border-b border-[var(--border)] bg-[var(--surface)] last:border-b-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-l-2 border-b-[var(--border)] border-l-[var(--accent)] bg-[var(--surface)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-400">
          <CalendarClock size={12} className="text-[var(--accent)]" />
          Economic Calendar
        </span>
        <div className="flex items-center gap-2">
          <select
            value={filter.period}
            onChange={(e) => setFilter({ ...filter, period: e.target.value as PeriodKey })}
            aria-label="Pilih periode tanggal"
            className="border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-primary)] hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none"
          >
            {PERIOD_ORDER.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
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
            onClick={() => refetch()}
            disabled={isLoading}
            aria-label="Muat ulang calendar"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Calendar List */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto px-3 py-2">
        {isLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Memuat...</p>
        ) : error ? (
          <div className="flex items-start gap-1.5 text-xs text-[var(--danger)]">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center">
            <p className="text-xs text-[var(--text-muted)]">
              Tidak ada event di {PERIOD_LABELS[filter.period]} dengan filter ini
            </p>
            <button onClick={resetFilters} className="mt-2 text-[10px] text-[var(--accent)] hover:underline">
              Reset filter
            </button>
          </div>
        ) : (
          (() => {
            const groups: Record<string, CalendarEvent[]> = {};
            for (const ev of filtered) {
              const key = new Date(ev.time).toDateString();
              (groups[key] ??= []).push(ev);
            }
            return Object.entries(groups).map(([dateKey, groupEvents]) => (
              <div key={dateKey} data-date-key={dateKey} className="mb-3">
                <div className="sticky top-0 mb-1 border-b border-[var(--border)] bg-[var(--surface)] pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  {formatDate(dateKey)}
                </div>
                {groupEvents.map((ev) => (
                  <EventRow key={ev.eventId} ev={ev} />
                ))}
              </div>
            ));
          })()
        )}
      </div>

      {/* Footer */}
      {generatedAt && !isLoading && (
        <div className="border-t border-[var(--border)] px-3 py-1 text-[9px] text-[var(--text-muted)]">
          Last fetched · {new Date(generatedAt).toLocaleString("id-ID")} · {filtered.length} events
        </div>
      )}

      {/* Filter Detail Panel - Slide from right */}
      {filterPanelOpen && (
        <div className="absolute inset-y-0 right-0 z-50 w-64 animate-[slide-in-right_0.2s_ease-out] border-l border-[var(--border)] bg-[var(--surface)] shadow-[0_0_24px_rgba(0,0,0,0.6)]">
          <div className="flex h-full flex-col">
            {/* Panel Header */}
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

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {/* Priority */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  <span>Priority</span>
                </div>
                <div className="space-y-1">
                  {IMPACTS.map((imp) => (
                    <label key={imp} className="flex cursor-pointer items-center gap-2 text-[11px] hover:text-[var(--accent)]">
                      <input
                        type="checkbox"
                        checked={filter.impacts.has(imp)}
                        onChange={() => toggleImpact(imp)}
                        className="h-3 w-3 accent-[var(--accent)]"
                      />
                      <span className={"h-1.5 w-1.5 " + IMPACT_DOT[imp]} />
                      <span className="font-semibold capitalize">{imp}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Currency */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  <span>Currency</span>
                  <span className="flex gap-2 normal-case">
                    <button
                      onClick={() => setFilter({ ...filter, currencies: new Set(availableCurrencies) })}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setFilter({ ...filter, currencies: new Set() })}
                      className="text-[var(--text-muted)] hover:underline"
                    >
                      Kosongkan
                    </button>
                  </span>
                </div>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {availableCurrencies.map((code) => (
                    <label key={code} className="flex cursor-pointer items-center gap-2 text-[11px] hover:text-[var(--accent)]">
                      <input
                        type="checkbox"
                        checked={filter.currencies.has(code)}
                        onChange={() => toggleCurrency(code)}
                        className="h-3 w-3 accent-[var(--accent)]"
                      />
                      <span className="font-semibold">{code}</span>
                    </label>
                  ))}
                  {availableCurrencies.length === 0 && (
                    <p className="text-[10px] text-[var(--text-muted)]">Belum ada data</p>
                  )}
                </div>
              </div>

              {/* Country */}
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  <span>Country</span>
                  <span className="flex gap-2 normal-case">
                    <button
                      onClick={() => setFilter({ ...filter, countries: new Set(availableCountries) })}
                      className="text-[var(--accent)] hover:underline"
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setFilter({ ...filter, countries: new Set() })}
                      className="text-[var(--text-muted)] hover:underline"
                    >
                      Kosongkan
                    </button>
                  </span>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {availableCountries.map((code) => (
                    <label key={code} className="flex cursor-pointer items-center gap-2 text-[11px] hover:text-[var(--accent)]">
                      <input
                        type="checkbox"
                        checked={filter.countries.has(code)}
                        onChange={() => toggleCountry(code)}
                        className="h-3 w-3 accent-[var(--accent)]"
                      />
                      <span>{flagEmoji(code)}</span>
                      <span className="font-semibold">{code}</span>
                      <span className="truncate text-[var(--text-muted)]">{countryLabel(code)}</span>
                    </label>
                  ))}
                  {availableCountries.length === 0 && (
                    <p className="text-[10px] text-[var(--text-muted)]">Belum ada data</p>
                  )}
                </div>
              </div>

              {/* Show Only With Data */}
              <div className="mb-4">
                <label className="flex cursor-pointer items-start gap-2 text-[11px] hover:text-[var(--accent)]">
                  <input
                    type="checkbox"
                    checked={filter.showOnlyWithData}
                    onChange={(e) => setFilter({ ...filter, showOnlyWithData: e.target.checked })}
                    className="mt-0.5 h-3 w-3 accent-[var(--accent)]"
                  />
                  <span>
                    Show only events with data
                    <span className="mt-1 block text-[9px] text-[var(--text-muted)]">
                      Hide events tanpa Prev/Forecast/Actual
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* Panel Footer */}
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
});

function EventRow({ ev }: { ev: CalendarEvent }) {
  const [flash, setFlash] = useState(false);
  const prevActualRef = useRef(ev.actual);

  useEffect(() => {
    if (prevActualRef.current !== ev.actual && ev.actual !== null) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2000);
      prevActualRef.current = ev.actual;
      return () => clearTimeout(t);
    }
  }, [ev.actual]);

  return (
    <div className={`group border-b border-[var(--border)] py-2 transition-colors duration-1000 ${flash ? 'bg-[var(--accent)]/30' : 'hover:bg-[var(--surface-alt)]'}`}>
      {/* Top row: Impact, Time, Currency, Event */}
      <div className="flex items-start gap-2 px-1">
        {/* Impact dot */}
        <span className={"mt-1 h-1.5 w-1.5 flex-shrink-0 " + IMPACT_DOT[ev.importance]} />

        {/* Time */}
        <span className="tabular w-7 flex-shrink-0 text-[10px] text-[var(--text-primary)]">
          {formatTime(ev.time)}
        </span>

        {/* Flag + Currency badge */}
        <span
          className="flex flex-shrink-0 items-center gap-1 border border-[var(--border)] bg-[var(--surface-alt)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--text-primary)]"
          title={countryLabel(ev.country)}
        >
          <span className="text-[11px]">{flagEmoji(ev.country)}</span>
          <span>{ev.currency}</span>
        </span>

        {/* Event name */}
        <div className="flex-1">
          <div className="text-[11px] leading-tight text-[var(--text-primary)]">{ev.event}</div>

          {/* Data row (Prev | Forecast | Actual) - right below event name */}
          {(ev.previous !== null || ev.forecast !== null || ev.actual !== null) && (
            <div className="mt-1.5 flex items-center gap-3 text-[10px] tabular">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-[var(--text-muted)]">Prev</span>
                <span className="font-semibold text-[var(--text-primary)]">{formatValue(ev.previous)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] uppercase text-[var(--text-muted)]">Forecast</span>
                <span className="font-semibold text-[var(--text-primary)]">{formatValue(ev.forecast)}</span>
              </div>
              {ev.actual !== null && (
                <div className="flex flex-col">
                  <span className="text-[9px] uppercase text-[var(--text-muted)]">Actual</span>
                  <span
                    className={
                      "font-bold " +
                      (ev.forecast !== null
                        ? Number.parseFloat(ev.actual) > Number.parseFloat(ev.forecast)
                          ? "text-[var(--success)]"
                          : Number.parseFloat(ev.actual) < Number.parseFloat(ev.forecast)
                            ? "text-[var(--danger)]"
                            : "text-[var(--text-primary)]"
                        : "text-[var(--text-primary)]")
                    }
                  >
                    {formatValue(ev.actual)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

