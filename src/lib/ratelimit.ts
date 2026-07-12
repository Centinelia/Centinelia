import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redisConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = redisConfigured
  ? new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

function makeRatelimit(limiter: Ratelimit['limiter'], prefix: string): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({ redis, limiter, prefix });
}

// Sliding window limiters, one instance per policy, shared across requests
export const limiters = {
  // Auth endpoints: 5 attempts per minute per IP
  auth: makeRatelimit(Ratelimit.slidingWindow(5, '1 m'), 'rl:auth'),

  // AI chat endpoints: 20 requests per minute per IP
  chat: makeRatelimit(Ratelimit.slidingWindow(20, '1 m'), 'rl:chat'),

  // Expensive scraping: 3 requests per 5 minutes per token
  scrape: makeRatelimit(Ratelimit.slidingWindow(3, '5 m'), 'rl:scrape'),

  // Agent chat (Sonnet, billed per op): 10 messages per minute per portal token
  agentChat: makeRatelimit(Ratelimit.slidingWindow(10, '1 m'), 'rl:agent-chat'),
};

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

export async function rateLimit(
  req: NextRequest,
  limiter: Ratelimit | null,
  key?: string,
): Promise<NextResponse | null> {
  if (!limiter) return null; // Redis not configured — fail open
  const id = key ?? getIp(req);
  const { success, limit, remaining, reset } = await limiter.limit(id);

  if (!success) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo en unos momentos.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit':     String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset':     String(reset),
          'Retry-After':           String(Math.ceil((reset - Date.now()) / 1000)),
        },
      },
    );
  }

  return null; // not limited, proceed
}
