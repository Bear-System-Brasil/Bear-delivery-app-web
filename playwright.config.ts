import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3100";
const baseURL = `http://localhost:${PORT}`;

// Comando do webServer. Local, o default sobe o Next em dev (ver nota abaixo).
// No pipeline, E2E_WEBSERVER_CMD aponta pro build já gerado
// (`next start`), pra o E2E rodar contra o mesmo artefato que vai pra prod.
const webServerCommand =
  process.env.E2E_WEBSERVER_CMD ?? `./node_modules/.bin/next dev -p ${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Chama o binário do Next direto (não via `pnpm dev`): o pre-check de
    // dependências do pnpm neste monorepo dispara um install que trava numa
    // aprovação de build script pendente (unrs-resolver), derrubando o
    // webServer antes mesmo de subir o Next.
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
