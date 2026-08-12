export class GeneralCacheStore {
  private cache = new Map<string, { data: any; expires: number }>();

  get(taskType: string, key: string): { text: string; modelUsed: string; usage?: { inputTokens: number; outputTokens: number } } | null {
    const cacheKey = `${taskType}:${key}`;
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }
    return entry.data;
  }

  set(taskType: string, key: string, value: { text: string; modelUsed: string; usage?: { inputTokens: number; outputTokens: number } }, ttlMs = 3600000): void {
    const cacheKey = `${taskType}:${key}`;
    this.cache.set(cacheKey, { data: value, expires: Date.now() + ttlMs });
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.cache) {
      if (entry.expires < now) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }
}