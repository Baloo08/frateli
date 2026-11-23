import Redis from "ioredis";
import { getRedisCacheUrl, getRedisQueueUrl } from "./env";

const globalForRedis = globalThis as unknown as {
  __frateliQueueRedis?: Redis;
  __frateliCacheRedis?: Redis;
};

export function getQueueRedis(): Redis {
  if (!globalForRedis.__frateliQueueRedis) {
    const client = new Redis(getRedisQueueUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 5000,
    });
    client.on("error", (err) => console.warn("[redis-queue]", err.message));
    globalForRedis.__frateliQueueRedis = client;
  }
  return globalForRedis.__frateliQueueRedis;
}

export function getCacheRedis(): Redis {
  if (!globalForRedis.__frateliCacheRedis) {
    const client = new Redis(getRedisCacheUrl(), {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 3000,
    });
    client.on("error", (err) => console.warn("[redis-cache]", err.message));
    globalForRedis.__frateliCacheRedis = client;
  }
  return globalForRedis.__frateliCacheRedis;
}

export async function invalidateUserRbacCache(userId: string): Promise<void> {
  try {
    const redis = getCacheRedis();
    await redis.del(`rbac:user:${userId}`);
    await redis.publish(
      `chan:user:${userId}:events`,
      JSON.stringify({ type: "rbac.updated", userId, at: new Date().toISOString() })
    );
  } catch {
    // Non-fatal if cache Redis is temporarily unavailable
  }
}

export async function checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<boolean> {
  try {
    const redis = getCacheRedis();
    const count = await redis.incr(`rl:${key}`);
    if (count === 1) {
      await redis.expire(`rl:${key}`, windowSeconds);
    }
    return count <= maxRequests;
  } catch {
    return true;
  }
}
