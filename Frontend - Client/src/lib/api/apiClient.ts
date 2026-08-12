import Cookies from 'js-cookie';

export const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: any;
  requestId?: string;

  constructor(message: string, status: number, code: string, details?: any, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export async function apiClient(endpoint: string, options: RequestInit = {}) {
  const token = Cookies.get("eaconsole.sessionToken");
  
  const headers = new Headers(options.headers || {});
  
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const url = endpoint.startsWith("http") ? endpoint : `${BACKEND_URL}${endpoint}`;
  
  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    let errorData = { error: `HTTP Error ${response.status}`, code: "UNKNOWN_ERROR" };
    try {
      errorData = await response.json();
    } catch (e) {
      // Not JSON or empty body
    }
    
    if (response.status === 401 || errorData.code === "UNAUTHENTICATED") {
      Cookies.remove("eaconsole.sessionToken");
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login?error=unauthenticated";
      }
    }
    
    throw new ApiError(
      errorData.error || errorData.error || `Request failed (${response.status})`,
      response.status,
      errorData.code || "UNKNOWN_ERROR",
      (errorData as any).details,
      (errorData as any).requestId
    );
  }
  
  // Handle empty responses
  if (response.status === 204) {
    return null as any;
  }
  
  // If expecting a blob/file download
  if (response.headers.get("Content-Disposition")?.includes("attachment")) {
    return response;
  }
  
  return response.json();
}
