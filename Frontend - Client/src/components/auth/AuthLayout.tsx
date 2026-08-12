"use client";
// @ts-nocheck
import type { ReactNode } from "react";

// Bloomberg Terminal immersive auth shell: full-screen with animated ticker
// waterfall background, center glass-morphism form card, floating particles,
// geometric overlays. Zero rounded corners, pure black + orange (#ff7700).
// Data streams fall vertically (prices, symbols, timestamps) to create the
// sensation of being inside a live terminal feed. Form card sits center with
// backdrop blur, minimal distraction. Particles (orange dots) float upward
// representing data ascending to the system.
export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] font-mono text-[var(--text-primary)]">
      {/* Animated ticker waterfall background */}
      <TickerWaterfall />

      {/* Scanline CRT effect overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]">
        <div className="h-[2px] w-full animate-[scanline_8s_linear_infinite] bg-[var(--accent)]" />
      </div>

      {/* Geometric overlays - corners */}
      <GeometricOverlays />

      {/* Floating particles */}
      <Particles />

      {/* Top floating bar */}
      <div className="absolute left-6 top-6 z-30 flex items-center gap-2">
        <LiveDot />
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--text-muted)]">
          Betrix
        </span>
        <div className="ml-4 text-[9px] text-[var(--text-muted)]">
          {new Date().toLocaleTimeString("en-US", { hour12: false })}
        </div>
      </div>

      {/* Mini floating widgets - bottom corners */}
      <div className="absolute bottom-6 left-6 z-30 text-[9px] text-[var(--text-muted)]">
        <div className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
          MARKET: <span className="text-[var(--success)]">OPEN</span>
        </div>
      </div>
      <div className="absolute bottom-6 right-6 z-30 text-[9px] text-[var(--text-muted)]">
        <div className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
          PING: <span className="text-[var(--info)]">24ms</span>
        </div>
      </div>

      {/* Center form card with glass morphism */}
      <div className="relative z-20 w-full max-w-md animate-[form-expand_0.6s_ease-out] page-container">
        <div className="border border-[var(--border)] bg-[var(--surface)]/80 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-md">
          {/* Eyebrow + Title */}
          <div className="mb-6 border-b border-[var(--border)] pb-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--accent)]">
              {eyebrow}
            </div>
            <h1 className="mb-2 text-xl font-bold leading-tight text-[var(--text-primary)]">{title}</h1>
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>
          </div>

          {/* Form content */}
          {children}

          {/* Footer */}
          {footer && (
            <div className="mt-6 border-t border-[var(--border)] pt-4 text-center text-[11px] text-[var(--text-muted)]">
              {footer}
            </div>
          )}
        </div>

        {/* Card bottom accent line */}
        <div className="bx-accent-line" />
      </div>
    </div>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping bg-[var(--success)] opacity-75" />
      <span className="absolute inline-flex h-full w-full animate-ping bg-[var(--success)] opacity-50" style={{ animationDelay: "0.3s" }} />
      <span className="relative inline-flex h-2 w-2 bg-[var(--success)]" />
    </span>
  );
}

// Vertical ticker waterfall - prices/symbols streaming down
function TickerWaterfall() {
  const streams = [
    { left: "5%", delay: "0s", symbols: ["EURUSD", "1.0842", "GBPJPY", "189.34", "XAUUSD", "2387.12"] },
    { left: "15%", delay: "2s", symbols: ["USDJPY", "157.89", "AUDUSD", "0.6523", "NZDUSD", "0.5892"] },
    { left: "25%", delay: "4s", symbols: ["USDCAD", "1.3678", "USDCHF", "0.8934", "EURGBP", "0.8456"] },
    { left: "35%", delay: "1s", symbols: ["BTCUSD", "68450", "ETHUSD", "3421", "US30", "38923"] },
    { left: "45%", delay: "3s", symbols: ["SPX500", "5234", "NAS100", "18456", "GER40", "18234"] },
    { left: "55%", delay: "5s", symbols: ["GBPUSD", "1.2634", "EURJPY", "171.23", "AUDJPY", "103.02"] },
    { left: "65%", delay: "2.5s", symbols: ["CADJPY", "115.67", "CHFJPY", "176.89", "NZDJPY", "93.01"] },
    { left: "75%", delay: "4.5s", symbols: ["XAGUSD", "28.45", "OIL", "82.34", "NATGAS", "2.67"] },
    { left: "85%", delay: "1.5s", symbols: ["EURCHF", "0.9723", "GBPCHF", "1.1501", "AUDCHF", "0.5829"] },
    { left: "95%", delay: "3.5s", symbols: ["UK100", "8234", "FRA40", "7823", "ESP35", "11234"] },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-10">
      {streams.map((stream, i) => (
        <div
          key={i}
          className="absolute top-0 flex h-[200%] flex-col gap-4 animate-[ticker-fall_15s_linear_infinite]"
          style={{ left: stream.left, animationDelay: stream.delay }}
        >
          {stream.symbols.map((symbol, j) => (
            <div key={j} className="text-[11px] font-bold text-[var(--accent)] whitespace-nowrap">
              {symbol}
            </div>
          ))}
          {/* Duplicate for seamless loop */}
          {stream.symbols.map((symbol, j) => (
            <div key={`dup-${j}`} className="text-[11px] font-bold text-[var(--accent)] whitespace-nowrap">
              {symbol}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Geometric overlays - rotating shapes in corners
function GeometricOverlays() {
  return (
    <>
      {/* Top-left hexagon */}
      <div className="pointer-events-none absolute -left-12 -top-12 z-5 h-32 w-32 opacity-5 animate-[rotate-slow_60s_linear_infinite]">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <polygon points="50,5 90,25 90,75 50,95 10,75 10,25" fill="none" stroke="var(--accent)" strokeWidth="1" />
          <polygon points="50,15 80,30 80,70 50,85 20,70 20,30" fill="none" stroke="var(--info)" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Bottom-right triangle cluster */}
      <div className="pointer-events-none absolute -bottom-16 -right-16 z-5 h-40 w-40 opacity-5 animate-[rotate-slow_45s_linear_infinite_reverse]">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <polygon points="50,10 90,90 10,90" fill="none" stroke="var(--accent)" strokeWidth="1" />
          <polygon points="50,30 75,80 25,80" fill="none" stroke="var(--info)" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Top-right small square */}
      <div className="pointer-events-none absolute -right-8 top-32 z-5 h-20 w-20 opacity-5 animate-[rotate-slow_30s_linear_infinite]">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <rect x="10" y="10" width="80" height="80" fill="none" stroke="var(--accent)" strokeWidth="1" />
          <rect x="25" y="25" width="50" height="50" fill="none" stroke="var(--info)" strokeWidth="0.5" />
        </svg>
      </div>
    </>
  );
}

// Floating particles (orange dots ascending)
function Particles() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 8}s`,
    duration: `${12 + Math.random() * 8}s`,
    drift: `${(Math.random() - 0.5) * 100}px`,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute bottom-0 h-1 w-1 bg-[var(--accent)] opacity-60 animate-[particle-float_linear_infinite]"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            // @ts-ignore
            "--drift": p.drift,
          }}
        />
      ))}
    </div>
  );
}

