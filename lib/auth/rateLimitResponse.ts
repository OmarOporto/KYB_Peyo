import { NextResponse } from "next/server";
import type { RateResult } from "./rateLimit";

/** Respuesta 429 estándar con los headers de rate limit. */
export function rateLimitResponse(rl: RateResult): NextResponse {
  return NextResponse.json(
    { error: "rate_limited" },
    {
      status: 429,
      headers: {
        "Retry-After": "60",
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
      },
    },
  );
}
