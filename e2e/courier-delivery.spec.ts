import { expect, test } from "@playwright/test";

import { loginAsCourier } from "./helpers/session";
import { hasCourierCredentials } from "./helpers/test-config";

/**
 * Fluxo 3 (guia-de-testes.html) — Painel do Entregador (Courier):
 * - Login como Entregador (Teste+Courier@bear.com)
 * - Acessar /delivery-dashboard e validar filtros (Todos, Em rota, A coletar, Disponíveis)
 * - Abrir diálogo de localização no cabeçalho
 * - Navegar para /delivery-dashboard/historico e /delivery-dashboard/ajustes
 */
test.describe("Entregador (Courier) - Painel, Histórico e Ajustes", () => {
  test.skip(
    !hasCourierCredentials,
    "Defina credenciais de entregador (E2E_COURIER_EMAIL / PASSWORD) para rodar.",
  );

  test("entregador navega pelos filtros, localização, histórico e ajustes", async ({
    page,
  }) => {
    await test.step("1. Login como Entregador", async () => {
      await loginAsCourier(page);
    });

    await test.step("2. Acessar /delivery-dashboard e testar barra de filtros", async () => {
      await page.goto("/delivery-dashboard");
      await expect(page).toHaveURL(/\/delivery-dashboard/, { timeout: 15_000 });
      await expect(
        page.getByRole("banner").getByText("Minhas entregas"),
      ).toBeVisible({ timeout: 15_000 });

      const filterBar = page.getByRole("group", { name: "Filtrar entregas" });
      await expect(filterBar).toBeVisible({ timeout: 15_000 });

      for (const filterLabel of [
        /Em rota/i,
        /A coletar/i,
        /Disponíveis/i,
        /Todos/i,
      ]) {
        const btn = filterBar.getByRole("button", { name: filterLabel });
        await btn.click();
        await expect(btn).toHaveAttribute("aria-pressed", "true");
      }
    });

    await test.step("3. Abrir diálogo de localização no cabeçalho", async () => {
      const locationBtn = page.getByRole("button", {
        name: /Informar minha localização|Corrigir minha localização/i,
      });
      await expect(locationBtn).toBeVisible();
      await locationBtn.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: /Corrigir localização|Onde você está\?/i }),
      ).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });

    await test.step("4. Acessar Histórico de Entregas", async () => {
      await page.goto("/delivery-dashboard/historico");
      await expect(page).toHaveURL(/\/delivery-dashboard\/historico/, {
        timeout: 15_000,
      });
      await expect(
        page.getByRole("banner").getByText("Histórico"),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step("5. Acessar Ajustes do Entregador", async () => {
      await page.goto("/delivery-dashboard/ajustes");
      await expect(page).toHaveURL(/\/delivery-dashboard\/ajustes/, {
        timeout: 15_000,
      });
      await expect(
        page.getByRole("banner").getByText("Ajustes"),
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Pedir confirmação")).toBeVisible();
    });
  });
});
