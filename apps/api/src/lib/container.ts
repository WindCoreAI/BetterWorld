import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Redis from "ioredis";
import postgres from "postgres";

let db: PostgresJsDatabase | null = null;
let redis: Redis | null = null;
let pgClient: ReturnType<typeof postgres> | null = null;

export function initDb(databaseUrl: string): PostgresJsDatabase {
  if (db) return db;
  pgClient = postgres(databaseUrl);
  db = drizzle(pgClient);
  return db;
}

export function initRedis(redisUrl: string): Redis {
  if (redis) return redis;
  redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, lazyConnect: true });
  return redis;
}

export function getDb(): PostgresJsDatabase | null {
  return db;
}

export function getRedis(): Redis | null {
  return redis;
}

export async function shutdown(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
  if (pgClient) {
    await pgClient.end();
    pgClient = null;
    db = null;
  }
}
