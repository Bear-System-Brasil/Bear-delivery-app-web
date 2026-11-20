import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://localhost:${PORT}`;
const rootDir = __dirname;

// Comando do webServer. Local, o default sobe o Next em dev (ver nota abaixo).
// No pipeline, E2E_WEBSERVER_CMD aponta pro build já gerado
// (`next start`), pra o E2E rodar contra o mesmo artefato que vai pra prod.
const webServerCommand =
  process.env.E2E_WEBSERVER_CMD ?? `./node_modules/.bin/next dev -p ${PORT}`;

export default defineConfig({
  testDir: path.resolve(rootDir, "./e2e"),
  globalSetup: path.resolve(rootDir, "./e2e/helpers/global-setup.ts"),
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    launchOptions: {
      slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL },
    },
  ],
  webServer: {
    // Chama o binário do Next direto (não via `pnpm dev`): o pre-check de
    // dependências do pnpm neste monorepo dispara um install que trava numa
    // aprovação de build script pendente (unrs-resolver), derrubando o
    // webServer antes mesmo de subir o Next.
    command: webServerCommand,
    cwd: rootDir,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
