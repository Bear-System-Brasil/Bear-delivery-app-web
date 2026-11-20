/**
 * Re-exporta o playwright.config.ts da raiz para que rodar `playwright test`
 * de dentro da pasta `e2e/` (`cd e2e && pnpm exec playwright test`) também
 * carregue o `baseURL` (`http://localhost:3000`), o `webServer` e o
 * `globalSetup` (que acorda o backend no Render).
 */
export { default } from "../playwright.config";
