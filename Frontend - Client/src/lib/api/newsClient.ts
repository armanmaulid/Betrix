const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface NewsItem {
  id: string;
  source: string;
  title: string;
  url: string;
  summary: string | null;
  assetTags: string[];
  publishedAt: string;
}

export interface GetNewsOptions {
  asset?: string;
  limit?: number;
  offset?: number;
}

export async function getNews(token: string, options: GetNewsOptions = {}): Promise<NewsItem[]> {
  const params = new URLSearchParams();
  if (options.limit) params.append("limit", options.limit.toString());
  if (options.offset) params.append("offset", options.offset.toString());
  if (options.asset) params.append("asset", options.asset);

  const query = params.toString();
  const url = `${BACKEND_URL}/api/v1/news${query ? `?${query}` : ""}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    throw new Error("Sesi kadaluarsa, silakan login kembali.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.news;
}


