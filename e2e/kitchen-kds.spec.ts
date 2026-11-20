import { expect, test } from "@playwright/test";

import { loginAsManager } from "./helpers/session";
import { hasManagerCredentials } from "./helpers/test-config";

/**
 * Fluxo 2 (guia-de-testes.html) — Gestão da Cozinha (KDS & Comandas):
 * - Login como Gerência (Second) ou Dono
 * - Acessar /kitchen e validar controles do KDS (Atualizar, Período, Cancelados)
 * - Alternar entre as colunas (Novos, Em Preparo, Prontos, Concluídos)
 * - Abrir detalhes / acionar impressão quando houver pedido ativo
 */
test.describe("Cozinha (KDS) - Painel e Comandas", () => {
  test.skip(
    !hasManagerCredentials,
    "Defina credenciais de gerência (E2E_MANAGER_EMAIL / PASSWORD) para rodar.",
  );

  test("painel KDS carrega colunas, filtros de período e ações de pedido", async ({
    page,
  }) => {
    await test.step("1. Login como Gerência (Second)", async () => {
      await loginAsManager(page);
    });

    await test.step("2. Acessar /kitchen e validar controles do topo", async () => {
      await page.goto("/kitchen");
      await expect(page).toHaveURL(/\/kitchen/, { timeout: 15_000 });
      await expect(page.getByRole("heading", { name: "Cozinha" })).toBeVisible({
        timeout: 15_000,
      });

      await expect(
        page.getByRole("button", { name: "Atualizar" }),
      ).toBeVisible();

      const periodSelect = page.getByLabel(
        "Período de Concluídos e Cancelados",
      );
      await expect(periodSelect).toBeVisible();

      const toggleCanceledBtn = page.getByRole("button", {
        name: /Ver cancelados|Ocultar cancelados/i,
      });
      await expect(toggleCanceledBtn).toBeVisible();
      await toggleCanceledBtn.click();
      await toggleCanceledBtn.click();
    });

    await test.step("3. Validar abas/contadores de colunas do KDS", async () => {
      const columnTabs = page.getByRole("tablist", {
        name: "Colunas da cozinha",
      });
      await expect(columnTabs).toBeVisible();

      const tabs = columnTabs.getByRole("tab");
      const tabCount = await tabs.count();
      expect(tabCount).toBeGreaterThanOrEqual(3);

      // Navega entre as abas de status
      for (let i = 0; i < tabCount; i++) {
        await tabs.nth(i).click();
        await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
      }
      await tabs.first().click();
    });

    await test.step("4. Se houver pedidos ativos, verificar detalhes e comanda", async () => {
      const firstOrderCard = page.locator("article").first();
      if (await firstOrderCard.isVisible()) {
        const detailsBtn = firstOrderCard.getByRole("button", {
          name: /Ver detalhes do pedido/i,
        });
        if (await detailsBtn.isVisible()) {
          await detailsBtn.click();
          const detailDialog = page.getByRole("dialog");
          await expect(detailDialog).toBeVisible({ timeout: 10_000 });
          await page.keyboard.press("Escape");
          await expect(detailDialog).toBeHidden({ timeout: 10_000 });
        }

        const printBtn = firstOrderCard.getByRole("button", {
          name: /Imprimir pedido/i,
        });
        if (await printBtn.isVisible()) {
          await expect(printBtn).toBeEnabled();
        }
      }
    });
  });
});
