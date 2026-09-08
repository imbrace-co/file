import { Context, Next } from "hono";

/**
 * Auth context that gets attached to the Hono request context.
 *
 * file-service is a private internal service exposed only on .lan and called
 * by app-gateway / other internal services. We don't authenticate here —
 * the gateway already verified the caller. We only need org scoping plus
 * optional user metadata that flows through to upload response payloads.
 */
export interface AuthContext {
  organization_id: string;
  user_id: string;
  email?: string;
  display_name?: string;
}

export const authMiddleware = async (c: Context, next: Next) => {
  const organization_id = c.req.header("x-organization-id") || "";
  if (!organization_id) {
    return c.json({ code: 401, message: "Missing x-organization-id" }, 401);
  }

  c.set("auth", {
    organization_id,
    user_id: c.req.header("x-user-id") || "",
    email: c.req.header("x-user-email") || undefined,
    display_name: c.req.header("x-user-name") || undefined,
  } as AuthContext);

  await next();
};

export function getAuth(c: Context): AuthContext {
  return c.get("auth") as AuthContext;
}
