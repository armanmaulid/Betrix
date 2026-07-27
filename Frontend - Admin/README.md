# EA Admin Console — Frontend

Frontend admin dashboard untuk backend Web Financial Advisor (forex EA). React + Vite + TypeScript + Tailwind, konsumsi semua endpoint `/api/admin/*` dan `/api/usage/stats`.

## Quick Start

```bash
npm install
cp .env.example .env
# Isi VITE_API_BASE_URL sesuai URL backend kamu (default: http://localhost:3000/api)

npm run dev      # dev server di http://localhost:5173
npm run build    # build production ke folder dist/
```

## Login

Masuk pakai akun yang `is_admin = true` di database backend. Kalau login berhasil tapi bukan admin, akan muncul pesan "Akses Ditolak".

## Fitur & Halaman

### Dashboard (`/dashboard`)
- **Metrics overview** — total users, chats, token usage, active users (24h)
- **Analytics charts** — user growth, token usage trend, task type distribution, model usage
- **Ticker strip** — statistik real-time dengan visual terminal trading

### Users Management (`/users`, `/users/:id`)
- **List users** dengan pagination, search (nama/email), filter by status, sort
- **Export** users ke CSV/JSON
- **User detail** — statistik, aktivitas terakhir, chat history
- **Edit user** — update role (admin/user) dan status (active/banned/suspended)
- **Reset password** — generate temp password, kirim via email
- **Delete user** — hapus user dan semua datanya

### Messages (`/messages`)
- **Admin inbox** — terima pesan dari user
- **Thread view** — conversation grouping
- **Reply messages** — balas pesan user

### Broadcast (`/broadcast`)
- **Kirim pesan ke semua user** — subject + body
- **Preview sebelum kirim**

### System Health (`/system`)
- **Database metrics** — size, connection pool status
- **Redis metrics** — memory usage, keys count, uptime
- **Server info** — uptime, memory usage

### Logs Viewer (`/logs`)
- **View error & combined logs** — per hari
- **Filter by date & log type**
- **Real-time log streaming** (via polling)

### Audit Trail (`/audit-log`)
- **Riwayat semua aksi admin** — pagination & filter
- **Detail:** admin, action, target user, timestamp

### Profile (`/profile`)
- **Edit profil admin** — nama, email
- **Change password**
- **View aktivitas login terakhir**

## Perubahan Backend yang Dibutuhkan

Frontend ini butuh 2 penyesuaian kecil di backend (sudah dibuatkan filenya terpisah, tinggal ganti):

1. **`routes/auth.js`** — response `POST /api/auth/login` sekarang menyertakan `isAdmin`, dan ada endpoint baru `GET /api/auth/me` (validasi token + ambil data user terkini, dipakai saat refresh halaman).
2. **`services/userStore.js`** — `findByEmail` sekarang ikut select `is_admin`, `status`, `email_verified`; ada fungsi baru `findById`.

Pastikan juga `ALLOWED_ORIGINS` di `.env` backend menyertakan URL frontend ini (misal `http://localhost:5173` untuk dev).

## Struktur

```
src/
├── api/          # axios client + fungsi panggil tiap endpoint
│   ├── client.ts      # axios instance dengan auth interceptor
│   ├── auth.ts        # login, logout, me
│   ├── users.ts       # CRUD users, export
│   ├── messages.ts    # inbox, sent, threads
│   ├── broadcast.ts   # kirim broadcast message
│   ├── metrics.ts     # dashboard metrics & analytics
│   ├── usage.ts       # token usage stats
│   └── profile.ts     # edit profil admin
├── components/   # layout, ui generic, charts, komponen khusus users
│   ├── layout/        # DashboardLayout, Sidebar, Topbar
│   ├── ui/            # Card, Badge, Button, Modal, Table, Pagination, dll
│   ├── users/         # EditUserModal, ResetPasswordModal, UserTable, UserFilters
│   ├── audit/         # AuditTable, AuditFilters
│   ├── charts/        # AnalyticsCharts (Recharts wrapper)
│   └── profile/       # ProfileForms
├── context/      # AuthContext (token+user), ThemeContext (dark/light), ToastContext
├── hooks/        # React Query hooks per resource
│   ├── useUsers.ts
│   ├── useMetrics.ts
│   ├── useAnalytics.ts
│   ├── useUnreadMessages.ts
│   └── useDebounce.ts
├── pages/        # 1 file per halaman/route
├── routes/       # ProtectedRoute (guard auth+admin)
└── types/        # TypeScript interfaces shared
```

## Desain

Tema dark/light bisa di-toggle dari topbar (ikon matahari/bulan), preferensi disimpan di `localStorage`. Palet warna "charcoal-amber" didefinisikan sebagai CSS custom properties di `src/index.css` — gampang diubah tanpa perlu sentuh komponen.

Elemen "ticker strip" di halaman Dashboard (baris statistik horizontal dengan angka monospace + indikator delta) adalah elemen visual utama, terinspirasi tampilan terminal trading tapi dengan palet warna sendiri (amber, bukan hijau neon standar).

## Tech Stack

- **React 18** + **TypeScript**
- **Vite** — fast dev server & build
- **React Router v6** — client-side routing
- **TanStack Query (React Query)** — server state management, caching, auto-refetch
- **Axios** — HTTP client dengan interceptor untuk auth
- **Tailwind CSS** — utility-first styling
- **Recharts** — charting library untuk analytics
- **Lucide React** — icon set

## Catatan

- Bundle production ~700KB (belum di-split per-route). Untuk optimasi lebih lanjut, bisa pakai `React.lazy()` per halaman + `build.rollupOptions.output.manualChunks` di `vite.config.ts` — belum dilakukan di versi ini demi kesederhanaan.
- Export user (CSV/JSON) di-fetch sebagai blob lewat axios (bukan `<a href>` biasa), karena endpoint-nya butuh header `Authorization: Bearer` yang nggak bisa dikirim lewat navigasi link langsung.
- Toast notifications untuk feedback user action (success/error) dikelola via `ToastContext`.
- Auto-logout ketika token invalid atau expired (handled by axios interceptor).

---

**Terakhir diupdate:** 2026-07-24
