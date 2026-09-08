/**
 * Outbound HTTP correlation — request-id propagation for native `fetch`.
 *
 * file-service makes outbound calls with global `fetch` (no axios). We
 * monkey-patch `globalThis.fetch` once at startup to inject, from the current
 * AsyncLocalStorage context:
 *   - `x-request-id`: the inbound correlation id (so the downstream reuses it)
 *   - `x-proxy`: this service's name (so the downstream records who called it)
 *
 * Covers every existing `fetch(...)` call site with no per-file changes.
 * Outside an HTTP request there's no context, so no headers are added.
 */

import {
  getContext,
  REQUEST_ID_HEADER,
  PROXY_HEADER,
} from "../logging/request-context";

const SERVICE_NAME = process.env.SERVICE_NAME || "file-service";

let installed = false;

export function installCorrelation() {
  if (installed) return;
  const original = globalThis.fetch;
  if (typeof original !== "function") return;

  globalThis.fetch = ((input: any, init?: any) => {
    const ctx = getContext();
    if (ctx?.requestId) {
      const headers = new Headers(
        init?.headers ??
          (typeof input === "object" && input && "headers" in input
            ? (input as Request).headers
            : undefined),
      );
      if (!headers.has(REQUEST_ID_HEADER)) {
        headers.set(REQUEST_ID_HEADER, ctx.requestId);
      }
      headers.set(PROXY_HEADER, SERVICE_NAME);
      init = { ...(init ?? {}), headers };
    }
    return original(input, init);
  }) as typeof fetch;

  installed = true;
}
