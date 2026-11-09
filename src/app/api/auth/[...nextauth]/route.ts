/**
 * Auth.js route handler — mounts `/api/auth/*` (`ADR-0005`).
 *
 * Next.js route handlers re-export named functions rather than a default `handler`, and
 * Auth.js exposes `GET`/`POST` on `handlers`.
 */
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
