// Helper CSV escaping bersama — sebelumnya cuma ada di routes/admin.js
// (escapeCsvField) dan dipakai untuk export users/audit trail, TAPI
// routes/chat.js (GET /export?format=csv) punya export CSV sendiri yang
// cuma escape quote manual tanpa proteksi formula-injection. Diekstrak ke
// sini supaya kedua route pakai proteksi yang sama persis, tidak drift.
//
// Dua hal yang ditangani:
// 1. Escape quote (" -> "") supaya struktur CSV tidak rusak kalau value
//    mengandung karakter quote.
// 2. Formula/CSV injection: value yang diawali =, +, -, atau @ bisa
//    dieksekusi sebagai formula kalau file dibuka di Excel/Google Sheets
//    (misal user kirim pesan chat `=HYPERLINK("http://evil.com","klik")`).
//    Di-prefix apostrophe supaya dianggap teks murni oleh spreadsheet apps.
export function escapeCsvField(value) {
  let str = value === null || value === undefined ? "" : String(value);

  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}
