import "server-only";

import { createHash } from "node:crypto";

import connectMongoDB from "@/lib/mongodb";
import RateLimitBucket from "@/models/RateLimitBucket";

type LocalBucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type LocalStore = Map<string, LocalBucket>;

declare global {
  // eslint-disable-next-line no-var
  var cohivaRateLimitFallbackStore: LocalStore | undefined;
}

const fallbackStore = global.cohivaRateLimitFallbackStore ?? new Map<string, LocalBucket>();
global.cohivaRateLimitFallbackStore = fallbackStore;

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return (realIp || "unknown").slice(0, 128);
};

const makeKey = (request: Request, namespace: string) =>
  createHash("sha256")
    .update(`${namespace}:${getClientIp(request)}`)
    .digest("hex");

const fallbackRateLimit = (
  key: string,
  options: { limit: number; windowMs: number }
): RateLimitResult => {
  const now = Date.now();
  const current = fallbackStore.get(key);

  if (!current || current.resetAt <= now) {
    fallbackStore.set(key, { count: 1, resetAt: now + options.windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, options.limit - 1),
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    };
  }

  current.count += 1;
  fallbackStore.set(key, current);
  return {
    allowed: current.count <= options.limit,
    remaining: Math.max(0, options.limit - current.count),
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
};

export const checkRateLimit = async (
  request: Request,
  namespace: string,
  options: { limit: number; windowMs: number }
): Promise<RateLimitResult> => {
  const now = new Date();
  const resetAt = new Date(now.getTime() + options.windowMs);
  const key = makeKey(request, namespace);

  try {
    await connectMongoDB();

    let bucket = await RateLimitBucket.findOneAndUpdate(
      { key, resetAt: { $gt: now } },
      { $inc: { count: 1 } },
      { new: true }
    ).lean();

    if (!bucket) {
      try {
        bucket = await RateLimitBucket.findOneAndUpdate(
          { key },
          { $set: { count: 1, resetAt } },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        bucket = await RateLimitBucket.findOneAndUpdate(
          { key },
          { $inc: { count: 1 } },
          { new: true }
        ).lean();
      }
    }

    const count = Number(bucket?.count || 1);
    const bucketResetAt = bucket?.resetAt ? new Date(bucket.resetAt).getTime() : resetAt.getTime();

    return {
      allowed: count <= options.limit,
      remaining: Math.max(0, options.limit - count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucketResetAt - Date.now()) / 1000)),
    };
  } catch (error) {
    console.error("Distributed rate limit unavailable; using local fallback:", error);
    return fallbackRateLimit(key, options);
  }
};
