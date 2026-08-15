/**
 * Nilai konfigurasi yang di-inject ke application layer (Phase 5).
 *
 * Env dibaca HANYA di bootstrap (container.ts) — application & domain
 * tidak lagi menyentuh `@config/*` atau `process.env` secara langsung.
 */
export class AppSettings {
  constructor(
    public readonly requireEmailVerification: boolean,
    public readonly deviceEnforcementEnabled: boolean,
    public readonly trackCalendar: boolean,
    public readonly trackPrices: boolean,
    public readonly trackOhlc: boolean,
    public readonly trackMbook: boolean,
    public readonly trackingSymbols: string[],
    public readonly brokerUtcOffset: number
  ) {}
}
