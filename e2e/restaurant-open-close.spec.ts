import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers/session";
import { hasOwnerCredentials } from "./helpers/test-config";

/**
 * Teste E2E de Abertura, Fechamento e Horários da Loja:
 * - Acessar a tela de Perfil da Empresa (/company-profile) logado como Dono (Owner)
 * - Validar a exibição do status Aberto/Fechado
 * - Interagir com a grade de horários de funcionamento
 * - Salvar alterações de horário
 * - Acessar o controle de Caixa (/financial-management/cash-register)
 */
test.describe("Restaurante - Horários e Status Aberto/Fechado", () => {
  test.skip(
    !hasOwnerCredentials,
    "Defina credenciais de proprietário (E2E_OWNER_EMAIL / PASSWORD) para rodar.",
  );

  test("verificar status da loja, editar horários e checar frente de caixa", async ({
    page,
  }) => {
    await test.step("1. Login como Dono da Loja", async () => {
      await loginAsOwner(page);
    });

    await test.step("2. Acessar Perfil da Empresa", async () => {
      await page.goto("/company-profile");
      await expect(page).toHaveURL(/\/company-profile/, { timeout: 15_000 });
      await expect(
        page.getByText("Horário de Funcionamento"),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step("3. Verificar status da loja no topo da página", async () => {
      // O badge exibe "Aberto", "Fechado" ou "Segue o caixa"
      const statusBadge = page.locator("span:has-text('Aberto'), span:has-text('Fechado'), span:has-text('Segue o caixa')").first();
      await expect(statusBadge).toBeVisible({ timeout: 25_000 });
    });

    await test.step("4. Interagir com os horários dos dias da semana", async () => {
      // Localiza o card de horários de funcionamento
      const hoursCard = page.locator("section, div").filter({ hasText: "Horário de Funcionamento" }).first();
      await expect(hoursCard).toBeVisible();

      // Localiza o primeiro switch ou checkbox de dia aberto/fechado
      const dayToggle = hoursCard.locator("button[role='switch'], input[type='checkbox']").first();
      if (await dayToggle.isVisible()) {
        await dayToggle.click();
      }

      // Se a barra global de salvar aparecer, clica em Salvar Alterações
      const saveBarButton = page.getByRole("button", { name: /Salvar/i });
      if (await saveBarButton.isVisible()) {
        await saveBarButton.click();
      }
    });

    await test.step("5. Acessar Frente de Caixa que comanda abertura da loja", async () => {
      await page.goto("/financial-management/cash-register");
      await expect(page).toHaveURL(/\/financial-management\/cash-register/, {
        timeout: 15_000,
      });

      // Valida tela de caixa com botão de Abertura ou Fechamento
      const cashTitle = page.locator("text=/Controle de Caixa|Caixa/i").first();
      await expect(cashTitle).toBeVisible({ timeout: 15_000 });
    });
  });
});
