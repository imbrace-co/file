/**
 * Request Context Middleware (Hono) — register FIRST, before everything.
 *
 * Mint/reuse x-request-id, capture ip + upstream proxy, echo the id back, and
 * bind a RequestContext for the request's async tree so the logger and deep
 * code share the same correlation fields.
 */

import { randomUUID } from "crypto";
import type { Context, Next } from "hono";
import {
  runWithContext,
  REQUEST_ID_HEADER,
  PROXY_HEADER,
  type RequestContext,
} from "../../infrastructure/logging/request-context";

function resolveIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return c.req.header("x-real-ip") ?? "";
}

export const requestContext = async (c: Context, next: Next) => {
  const incoming = c.req.header(REQUEST_ID_HEADER);
  const requestId =
    incoming && incoming.length > 0 && incoming.length <= 64
      ? incoming
      : randomUUID();

  const ctx: RequestContext = {
    requestId,
    ip: resolveIp(c),
    method: c.req.method,
    path: c.req.path,
    proxy: c.req.header(PROXY_HEADER) ?? "client",
    startTime: Date.now(),
  };

  c.res.headers.set(REQUEST_ID_HEADER, requestId);
  c.set("requestId", requestId);

  await runWithContext(ctx, () => next());
};
