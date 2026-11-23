import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getQueueRedis } from "@/lib/redis";
import { getActiveStorageDriver } from "@/lib/storage";
import { isAiConfigured } from "@/lib/ai";
import { isGoogleOAuthConfigured } from "@/lib/google";

export async function GET() {
  let dbOk = false;
  let redisOk = false;

  try {
    await query("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }

  try {
    const redis = getQueueRedis();
    if (redis.status === "wait") {
      await redis.connect();
    }
    const pong = await redis.ping();
    redisOk = pong === "PONG";
  } catch {
    redisOk = false;
  }

  const healthy = dbOk;
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      postgres: dbOk ? "connected" : "unreachable",
      redis: redisOk ? "connected" : "unreachable",
      storageDriver: getActiveStorageDriver(),
      aiConfigured: await isAiConfigured(),
      googleOAuthConfigured: isGoogleOAuthConfigured(),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
