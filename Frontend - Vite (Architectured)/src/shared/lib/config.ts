// Single source of truth for the backend base URL. All API clients and
// stream consumers should import this instead of re-deriving it from env
// vars — previously the same expression was duplicated in 8 files.
export const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
