/**
 * Request Context (AsyncLocalStorage)
 *
 * Holds per-request correlation data so that ANY code on the call stack — deep
 * service functions that never see the Hono `Context` — can attach the same
 * `request_id`, `ip`, `method`, `path` and `proxy` to its log lines and to
 * outbound HTTP calls.
 *
 * Populated once per request by `requestContext.middleware.ts`, read by the
 * Winston logger format (`logger.ts`) and the outbound fetch patch
 * (`infrastructure/http/client.ts`).
 */

import { AsyncLocalStorage } from "async_hooks";

/** Canonical correlation-id header. Same name on every service & every hop. */
export const REQUEST_ID_HEADER = "x-request-id";

/** Header naming the immediate upstream service that proxied this request. */
export const PROXY_HEADER = "x-proxy";

export interface RequestContext {
  requestId: string;
  ip: string;
  method: string;
  path: string;
  proxy: string;
  /** epoch ms when the request entered — used for response_time. */
  startTime: number;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getContext(): RequestContext | undefined {
  return als.getStore();
}

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}
