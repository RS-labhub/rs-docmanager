// In-memory rate limiting (rate-limiter-flexible). Per-process only —
// fine for MVP/single-region; swap to Upstash Redis for multi-instance.
import "server-only";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { NextResponse } from "next/server";

const limiters = new Map<string, RateLimiterMemory>();

function getLimiter(name: string, points: number, duration: number) {
  const key = `${name}:${points}:${duration}`;
  let l = limiters.get(key);
  if (!l) {
    l = new RateLimiterMemory({ keyPrefix: name, points, duration });
    limiters.set(key, l);
  }
  return l;
}

// Consumes one point for (name, key). Returns a 429 Response on overflow, else null.
export async function checkRateLimit(
  name: string,
  key: string,
  points: number,
  duration: number
): Promise<Response | null> {
  const limiter = getLimiter(name, points, duration);
  try {
    await limiter.consume(key, 1);
    return null;
  } catch (rej: any) {
    const retry = Math.ceil((rej?.msBeforeNext ?? duration * 1000) / 1000);
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retry),
          "X-RateLimit-Limit": String(points),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }
}
