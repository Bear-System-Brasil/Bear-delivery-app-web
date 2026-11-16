/**
 * URL do NestJS. Usada SOMENTE server-side (route handlers, middleware).
 * O client fala com /api/proxy do próprio Next.
 */
const rawUrl =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://bearsystem.tech";

export const API_BASE_URL = rawUrl.replace(/\/+$/, "");
