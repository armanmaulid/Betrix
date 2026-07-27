import { useEffect, useState } from "react";
import { CalendarClock, RefreshCw, Info, Filter, X } from "lucide-react";
import { fetchEconomicCalendar, type CalendarEvent } from "../../api/marketClient";

const IMPACT_DOT: Record<CalendarEvent["importance"], string> = {
  high: "bg-[var(--danger)]",
  medium: "bg-[var(--accent)]",
  low: "bg-[var(--text-muted)]",
  none: "bg-[var(--border)]",
};

const IMPACT_LABEL: Record<CalendarEvent["importance"], string> = {
  high: "H",
  medium: "M",
  low: "L",
  none: "N",
};

const IMPACTS: Array<CalendarEvent["importance"]> = ["high", "medium", "low"];

interface FilterState {
  countries: Set<string>;
  impacts: Set<CalendarEvent["importance"]>;
  showOnlyWithData: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (d.toDateString() === now.toDateString()) return "HARI INI";
  if (d.toDateString() === tomorrow.toDateString()) return "BESOK";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }).toUpperCase();
}

function formatValue(val: string | null): string {
  if (!val) return "-";
  return val;
}

// Bloomberg Terminal style: filter toolbar + expandable detail panel + data columns
export function EconomicCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Available currencies - dynamically extracted from backend response
  const [availableCurrencies, setAvailableCurrencies] = useState<Array<{ code: string; country: string }>>([]);

  // Default: USD high+medium (backward compatible dengan filter lama)
  const [filter, setFilter] = useState<FilterState>({
    countries: new Set(["US"]),
    impacts: new Set(["high", "medium"]),
    showOnlyWithData: false,
  });

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchEconomicCalendar();
      setEvents(data.events);
      setGeneratedAt(data.generatedAt);

      // Extract unique currencies/countries dari response
      const currencyMap = new Map<string, string>();
      for (const ev of data.events) {
        if (!currencyMap.has(ev.currency)) {
          currencyMap.set(ev.currency, ev.country);
        }
      }
      const currencies = Array.from(currencyMap.entries())
        .map(([code, country]) => ({ code, country }))
        .sort((a, b) => a.code.localeCompare(b.code));
      setAvailableCurrencies(currencies);

      // First load default: USD + high/medium only (kalau belum pernah diubah user)
      if (filter.countries.size === 1 && filter.countries.has("US") && filter.impacts.size === 2) {
        // Keep default USD + high/medium, no auto-select all
        // User already has the right default, do nothing
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat calendar");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply filters
  const filtered = events.filter((ev) => {
    if (!filter.countries.has(ev.country)) return false;
    if (!filter.impacts.has(ev.importance)) return false;
    if (filter.showOnlyWithData && ev.actual === null && ev.forecast === null && ev.previous === null) {
      return false;
    }
    return true;
  });

  function toggleCountry(countryCode: string) {
    const next = new Set(filter.countries);
    if (next.has(countryCode)) next.delete(countryCode);
    else next.add(countryCode);
    setFilter({ ...filter, countries: next });
  }

  function toggleImpact(impact: CalendarEvent["importance"]) {
    const next = new Set(filter.impacts);
    if (next.has(impact)) next.delete(impact);
    else next.add(impact);
    setFilter({ ...filter, impacts: next });
  }

  function resetFilters() {
    setFilter({
      countries: new Set(["US"]),
      impacts: new Set(["high", "medium"]),
      showOnlyWithData: false,
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
            onClick={load}
            disabled={isLoading}
            aria-label="Muat ulang calendar"
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>


      {/* Calendar List */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {isLoading ? (
          <p className="text-xs text-[var(--text-muted)]">Memuat...</p>
        ) : error ? (
          <div className="flex items-start gap-1.5 text-xs text-[var(--danger)]">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center">
            <p className="text-xs text-[var(--text-muted)]">Tidak ada event dengan filter ini</p>
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
              <div key={dateKey} className="mb-3">
                <div className="sticky top-0 mb-1 border-b border-[var(--border)] bg-[var(--surface)] pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                  {formatDate(dateKey)}
                </div>
                {groupEvents.map((ev, i) => (
                  <div key={i} className="group border-b border-[var(--border)] py-2 hover:bg-[var(--surface-alt)]">
                    {/* Top row: Impact, Time, Currency, Event */}
                    <div className="flex items-start gap-2 px-1">
                      {/* Impact dot */}
                      <span className={"mt-1 h-1.5 w-1.5 flex-shrink-0 " + IMPACT_DOT[ev.importance]} />

                      {/* Time */}
                      <span className="tabular w-7 flex-shrink-0 text-[10px] text-[var(--text-primary)]">
                        {formatTime(ev.time)}
                      </span>

                      {/* Currency badge */}
                      <span className="w-9 flex-shrink-0 border border-[var(--border)] bg-[var(--surface-alt)] px-1 text-center text-[10px] font-bold text-[var(--text-primary)]">
                        {ev.currency}
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
                ))}
              </div>
            ));
          })()
        )}
      </div>

      {/* Footer */}
      {generatedAt && !isLoading && (
        <div className="border-t border-[var(--border)] px-3 py-1 text-[9px] text-[var(--text-muted)]">
          Data dari Forex Factory · {new Date(generatedAt).toLocaleString("id-ID")} · {filtered.length} events
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
              {/* Countries */}
              <div className="mb-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  Countries
                </div>
                <div className="space-y-1">
                  {availableCurrencies.map((curr) => (
                    <label key={curr.code} className="flex cursor-pointer items-center gap-2 text-[11px] hover:text-[var(--accent)]">
                      <input
                        type="checkbox"
                        checked={filter.countries.has(curr.country)}
                        onChange={() => toggleCountry(curr.country)}
                        className="h-3 w-3 accent-[var(--accent)]"
                      />
                      <span className="font-semibold">{curr.code}</span>
                      <span className="text-[var(--text-muted)]">({curr.country})</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Impact Levels */}
              <div className="mb-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  Impact Level
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
}
