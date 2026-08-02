import { useEffect, useRef } from "react";

// Menjalankan `fn` tiap `intervalMs`, tapi skip tick saat tab sedang
// background (document.visibilityState !== "visible") supaya tidak buang
// request/baterai saat dashboard dibiarkan terbuka berjam-jam di tab lain.
// Begitu tab aktif lagi, langsung fetch ulang sekali biar data tidak basi.
export function useVisibilityPoll(fn: () => void, intervalMs: number): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    function tick() {
      if (document.visibilityState === "visible") {
        fnRef.current();
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        fnRef.current();
      }
    }

    tick();
    const interval = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}
