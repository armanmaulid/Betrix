import { useEffect, useState } from "react";

// Debounces a fast-changing value (e.g. a search input) so consumers only
// react once the user pauses for `delayMs`, instead of on every keystroke.
// The caller still binds the raw value to the <input> directly — only the
// *derived* debounced value should drive network requests.
export function useDebounce<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
