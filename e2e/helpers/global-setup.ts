import { ensureAuthCacheWarm, wakeUpBackend } from "./session";

/**
 * Global Setup do Playwright:
 * 1. "Liga" (acorda) o backend no Render.com caso esteja dormindo (cold start pode levar 40-60s).
 * 2. Pré-aquece o cache de tokens JWT das contas de teste para evitar rate-limit (HTTP 429).
 */
export default async function globalSetup(): Promise<void> {
  await wakeUpBackend();
  await ensureAuthCacheWarm();
}
