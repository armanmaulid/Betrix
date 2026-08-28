// src/shared/http/queryHelpers.ts
// Helpers untuk handle Express req.query di zod v4 / TypeScript strict.
//
// Di Express 4 + TypeScript strict, `req.query.X` bisa berupa:
//   - string
//   - string[] (kalau query muncul berkali-kali: ?foo=a&foo=b)
//   - undefined (kalau tidak ada)
//   - ParsedQs / ParsedQs[] (kalau nested)
//
// Helper di bawah coerce ke `string | undefined` dengan aturan:
//   - undefined → undefined
//   - string → string (apa adanya)
//   - string[] → string pertama (ambil index 0)
//   - ParsedQs → stringified JSON (best-effort)
//   - ParsedQs[] → stringified JSON dari index 0
//
// Gunakan di controller:
//   const symbol = queryString(req.query.symbol);
//   const tags = queryStringArray(req.query.tags);

import type { ParsedQs } from "qs";

export type QueryValue = string | ParsedQs | (string | ParsedQs)[] | undefined;

export function queryString(value: QueryValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value[0];
    if (first === undefined) return undefined;
    if (typeof first === "string") return first;
    return JSON.stringify(first);
  }
  return JSON.stringify(value);
}

export function queryStringArray(value: QueryValue | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.map(v => (typeof v === "string" ? v : JSON.stringify(v)));
  }
  return [JSON.stringify(value)];
}

export function queryStringUpper(value: QueryValue | undefined): string | undefined {
  const s = queryString(value);
  return s?.toUpperCase();
}
