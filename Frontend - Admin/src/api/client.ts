import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api";

export const apiClient = axios.create({
  baseURL: BASE_URL,
});

// Attach token dari localStorage ke tiap request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("sessionToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Callback yang di-set dari AuthContext supaya interceptor bisa trigger
// logout tanpa import langsung (hindari circular dependency).
let onUnauthorized: (() => void) | null = null;
export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export interface ApiErrorShape {
  error?: string;
  detail?: string;
}

export function getApiErrorMessage(err: unknown, fallback = "Terjadi kesalahan"): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ApiErrorShape | undefined;
    return data?.error || data?.detail || err.message || fallback;
  }
  return fallback;
}
