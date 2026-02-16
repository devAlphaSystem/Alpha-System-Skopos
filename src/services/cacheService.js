import logger from "../utils/logger.js";

class CacheService {
  constructor() {
    this.cache = new Map();
    this.pendingComputations = new Map();
    this.hitCount = 0;
    this.missCount = 0;
    this.MAX_ENTRIES = 500;

    this.TTL = {
      METRICS: 60 * 1000,
      ACTIVE_USERS: 30 * 1000,
      WEBSITES: 5 * 60 * 1000,
      SESSIONS: 2 * 60 * 1000,
      PAST_RECORDS: 30 * 60 * 1000,
      TRENDS: 60 * 1000,
    };

    this.cleanupInterval = setInterval(() => this._cleanup(), 60 * 1000);
  }

  key(prefix, ...parts) {
    return `${prefix}:${parts.join(":")}`;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.value;
  }

  set(key, value, ttl) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now(),
    });
    this._evictIfNeeded();
  }

  _evictIfNeeded() {
    if (this.cache.size <= this.MAX_ENTRIES) return;

    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }

    if (this.cache.size > this.MAX_ENTRIES) {
      const entriesToRemove = this.cache.size - this.MAX_ENTRIES;
      let removed = 0;
      for (const key of this.cache.keys()) {
        if (removed >= entriesToRemove) break;
        this.cache.delete(key);
        removed++;
      }
      logger.info("Cache eviction: removed %d oldest entries to stay within %d limit", removed, this.MAX_ENTRIES);
    }
  }

  async getOrCompute(key, ttl, compute) {
    const cached = this.get(key);
    if (cached !== null) {
      logger.debug("Cache HIT for key: %s", key);
      return cached;
    }

    const pending = this.pendingComputations.get(key);
    if (pending) {
      logger.debug("Cache PENDING for key: %s - awaiting existing computation...", key);
      return pending;
    }

    logger.debug("Cache MISS for key: %s - computing...", key);
    const pendingComputation = (async () => {
      const value = await compute();
      this.set(key, value, ttl);
      return value;
    })();

    this.pendingComputations.set(key, pendingComputation);

    try {
      return await pendingComputation;
    } finally {
      this.pendingComputations.delete(key);
    }
  }

  invalidate(pattern) {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        this.cache.delete(key);
        count++;
        logger.info("Cache INVALIDATED key: %s", key);
      }
    }
    if (count > 0) {
      logger.info("Invalidated %d cache entries matching pattern: %s", count, pattern);
    } else {
      logger.debug("No cache entries found matching pattern: %s", pattern);
    }
  }

  invalidateWebsite(websiteId) {
    logger.info("Invalidating all cache for website: %s", websiteId);
    this.invalidate(`metrics:${websiteId}`);
    this.invalidate(`activeUsers:${websiteId}`);
    this.invalidate(`sessions:${websiteId}`);
    this.invalidate(`events:${websiteId}`);
    this.invalidate(`records:${websiteId}`);
    this.invalidate(`trends:${websiteId}`);
  }

  invalidateWebsiteLight(websiteId) {
    logger.debug("Light-invalidating cache for website: %s", websiteId);
    this.invalidate(`activeUsers:${websiteId}`);
  }

  invalidateUser(userId) {
    logger.info("Invalidating all cache for user: %s", userId);
    this.invalidate(`websites:${userId}`);
    this.invalidate(`overview:${userId}`);
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info("Cache cleared. Removed %d entries.", size);
  }

  getStats() {
    const totalRequests = this.hitCount + this.missCount;
    return {
      entries: this.cache.size,
      hits: this.hitCount,
      misses: this.missCount,
      hitRate: totalRequests > 0 ? `${((this.hitCount / totalRequests) * 100).toFixed(2)}%` : "0%",
    };
  }

  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug("Cache cleanup: removed %d expired entries", cleaned);
    }
  }

  shutdown() {
    clearInterval(this.cleanupInterval);
    this.pendingComputations.clear();
    this.clear();
    logger.info("Cache service shutdown complete.");
  }
}

const cacheService = new CacheService();
export default cacheService;
