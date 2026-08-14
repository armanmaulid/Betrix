---
name: betrix-stack-guidelines
description: Critical integration rules for the Betrix MT5, Node.js, and Infrastructure stack.
---

# Betrix Stack Integration Guidelines

When working on the Betrix project, strictly adhere to the following architectural invariants:

### 1. MT5 Economic Calendar Primary Keys
The MQL5 `MqlCalendarValue` struct provides both `.id` (unique occurrence ID) and `.event_id` (category ID). 
- **Rule**: ALWAYS map `.id` to `value_id` and use `value_id` as the primary key in the PostgreSQL database.
- **Reason**: Using `event_id` as the primary key will cause new monthly releases (e.g., this month's NFP) to fatally overwrite historical releases in the database.

### 2. MT5 Timezone Synchronization
MT5 timestamps are emitted in the broker's local timezone (e.g., `YYYY-MM-DDTHH:MM:SS`) without a UTC offset string (like `Z`).
- **Rule**: In the Node.js backend, you MUST append the `MT5_BROKER_UTC_OFFSET` (formatted as `+03:00` or `-04:00`) to the MT5 time string BEFORE parsing it with `new Date()`.
- **Reason**: Without the explicit offset, Node.js will incorrectly assume the timestamp belongs to the server's local timezone, causing all calendar events and ticks to shift by several hours.

### 3. Upstash Redis in Local Docker
The backend uses `@upstash/redis` which communicates exclusively via REST API HTTP, not the standard RESP Redis protocol.
- **Rule**: When running the stack locally in Docker, `@upstash/redis` MUST connect to the `srh` (hiett/serverless-redis-http) proxy container port (e.g., `8079`), NEVER directly to the `redis:7-alpine` container (port `6379`).
- **Reason**: The standard Redis container does not understand REST API requests.

### 4. Local PostgreSQL SSL Enforcement
The backend is designed to work with both Neon DB (Cloud) and local PostgreSQL (Docker).
- **Rule**: The `pg` client configuration MUST dynamically disable SSL (`ssl: false`) if the hostname is `localhost`, `127.0.0.1`, or `postgres`.
- **Reason**: Local Docker Postgres containers do not have SSL configured by default. Forcing SSL will cause the backend to crash on startup.
