/**
 * Simple local storage cache for AI responses
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number; // in milliseconds
}

export const aiCache = {
  /**
   * Get data from cache if it exists and hasn't expired
   */
  get: <T>(key: string): T | null => {
    try {
      const stored = localStorage.getItem(`finora_ai_cache_${key}`);
      if (!stored) return null;

      const entry: CacheEntry = JSON.parse(stored);
      const now = Date.now();

      if (now - entry.timestamp > entry.ttl) {
        localStorage.removeItem(`finora_ai_cache_${key}`);
        return null;
      }

      return entry.data as T;
    } catch (error) {
      console.error("Cache retrieval error:", error);
      return null;
    }
  },

  /**
   * Set data in cache with a specific TTL
   * @param key Unique key for the query
   * @param data The AI response
   * @param ttlInMinutes Time to live in minutes (default 60)
   */
  set: (key: string, data: any, ttlInMinutes: number = 60): void => {
    try {
      const entry: CacheEntry = {
        data,
        timestamp: Date.now(),
        ttl: ttlInMinutes * 60 * 1000,
      };
      localStorage.setItem(`finora_ai_cache_${key}`, JSON.stringify(entry));
    } catch (error) {
      console.error("Cache storage error:", error);
    }
  },

  /**
   * Generate a unique key for a query based on its context
   */
  generateKey: (prefix: string, context: any): string => {
    const str = JSON.stringify(context);
    // Simple hash function for the string
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${prefix}_${hash}`;
  },

  /**
   * Clear all AI related cache
   */
  clear: (): void => {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("finora_ai_cache_"))
      .forEach((key) => localStorage.removeItem(key));
  },
};
