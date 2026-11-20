import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers/session";
import { hasOwnerCredentials } from "./helpers/test-config";

/**
 * Fluxo 5 (guia-de-testes.html) — Frente de Caixa & Módulo Financeiro:
 * - Controle de Caixa (/financial-management/cash-register): abertura, entrada/suprimento e saída/sangria
 * - Pedidos (/financial-management/orders)
 * - Pagamentos (/financial-management/finance)
 * - Dashboard (/financial-management/dashboard)
 * - Clientes (/financial-management/customers)
 * - Configurações (/financial-management/settings)
 */
test.describe("Financeiro - Caixa, Pedidos e Relatórios", () => {
  test.skip(
    !hasOwnerCredentials,
    "Defina credenciais de proprietário (E2E_OWNER_EMAIL / PASSWORD) para rodar.",
  );

  test("controle de caixa (abertura, entrada, saída) e navegação no módulo financeiro", async ({
    page,
  }) => {
    await test.step("1. Login como Proprietário", async () => {
      await loginAsOwner(page);
    });

    await test.step("2. Acessar Controle de Caixa e validar abertura/modais de movimentação", async () => {
      await page.goto("/financial-management/cash-register");
      await expect(page).toHaveURL(/\/financial-management\/cash-register/, {
        timeout: 15_000,
      });
      await expect(
        page.getByRole("heading", { name: "Controle de Caixa" }),
      ).toBeVisible({ timeout: 15_000 });

      // Aguarda carregar estado aberto ou fechado
      const openButton = page.getByRole("button", { name: "Abrir caixa" });
      const entradaButton = page
        .getByRole("button", { name: "Entrada" })
        .first();

      await expect(openButton.or(entradaButton)).toBeVisible({
        timeout: 15_000,
      });

      if (await openButton.isVisible()) {
        const balanceInput = page.getByPlaceholder("0,00").first();
        await balanceInput.fill("100,00");
        await openButton.click();
        await expect(entradaButton).toBeVisible({ timeout: 15_000 });
      }

      // Modal de Entrada / Suprimento
      if (await entradaButton.isVisible()) {
        await entradaButton.click();
        const modal = page.getByRole("dialog");
        await expect(modal).toBeVisible();
        await expect(modal.getByText("Registrar entrada")).toBeVisible();

        const depositBtn = modal.getByRole("button", { name: "Suprimento" });
        if (await depositBtn.isVisible()) {
          await depositBtn.click();
        }
        await modal.getByPlaceholder(/Sangria, reforço/i).fill("Suprimento E2E");
        await modal.getByPlaceholder("0,00").fill("50,00");

        await modal.getByRole("button", { name: "Cancelar" }).click();
        await expect(modal).toBeHidden({ timeout: 10_000 });
      }

      // Modal de Saída / Sangria
      const saidaButton = page.getByRole("button", { name: "Saída" }).first();
      if (await saidaButton.isVisible()) {
        await saidaButton.click();
        const modal = page.getByRole("dialog");
        await expect(modal).toBeVisible();
        await expect(modal.getByText("Registrar saída")).toBeVisible();

        const withdrawalBtn = modal.getByRole("button", { name: "Sangria" });
        if (await withdrawalBtn.isVisible()) {
          await withdrawalBtn.click();
        }
        await expect(modal.locator("select")).toBeVisible();
        await modal.getByPlaceholder(/Sangria, reforço/i).fill("Sangria E2E");
        await modal.getByPlaceholder("0,00").fill("20,00");

        await modal.getByRole("button", { name: "Cancelar" }).click();
        await expect(modal).toBeHidden({ timeout: 10_000 });
      }
    });

    await test.step("3. Validar telas do módulo financeiro", async () => {
      const routes: { path: string; heading: string }[] = [
        { path: "/financial-management/orders", heading: "Pedidos" },
        { path: "/financial-management/finance", heading: "Pagamentos" },
        { path: "/financial-management/dashboard", heading: "Dashboard" },
        { path: "/financial-management/customers", heading: "Clientes" },
        { path: "/financial-management/settings", heading: "Configurações" },
      ];

      for (const route of routes) {
        await page.goto(route.path);
        await expect(page).toHaveURL(new RegExp(route.path), {
          timeout: 15_000,
        });
        await expect(
          page.getByRole("heading", { name: route.heading }).first(),
        ).toBeVisible({ timeout: 15_000 });
      }
    });
  });
});
