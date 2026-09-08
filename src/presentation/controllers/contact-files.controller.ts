import { Context } from "hono";
import config from "../../config";
import { getAuth } from "../middleware/auth.middleware";
import logger from "../../infrastructure/logging/logger";

/**
 * ContactFilesController
 *
 * §7 — GET /v1/contact/:contact_id/files
 *
 * Proxies the request to the main backend (BACKEND_URL). file-service is
 * private; we forward x-organization-id / x-user-id so the backend can
 * scope the response.
 */
class ContactFilesController {
  getContactFiles = async (c: Context) => {
    try {
      const contactId = c.req.param("contact_id");
      const auth = getAuth(c);
      const backendUrl = config.backendUrl;

      if (!backendUrl) {
        logger.warn("BACKEND_URL not configured — cannot proxy contact files");
        return c.json([], 200);
      }

      const response = await fetch(
        `${backendUrl}/v1/contact/${contactId}/files`,
        {
          method: "GET",
          headers: {
            "x-organization-id": auth.organization_id,
            "x-user-id": auth.user_id || "",
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        const text = await response.text();
        logger.warn(
          `Backend contact files responded ${response.status}: ${text}`,
        );
        return c.json([], 200);
      }

      const data = await response.json();
      return c.json(data);
    } catch (error) {
      logger.error("Contact files proxy error:", error);
      return c.json([], 200);
    }
  };
}

export default ContactFilesController;
