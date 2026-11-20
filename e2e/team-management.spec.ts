import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers/session";
import { hasOwnerCredentials } from "./helpers/test-config";

/**
 * Teste E2E de Criação e Convite de Membros de Equipe (Staff):
 * - Acessar a tela /team-management logado como Proprietário (Owner)
 * - Abrir o modal de convite ("Convidar Membro")
 * - Cadastrar colaboradores com diferentes funções (Cozinheiro, Entregador, Gerente, Financeiro)
 * - Enviar convite e validar
 */
test.describe("Criação de Contas - Equipe e Permissões (Staff)", () => {
  test.skip(
    !hasOwnerCredentials,
    "Defina credenciais de proprietário (E2E_OWNER_EMAIL / PASSWORD) para rodar.",
  );

  test("convidar membros da equipe para cargos de Cozinheiro e Entregador", async ({
    page,
  }) => {
    await test.step("1. Login como Proprietário", async () => {
      await loginAsOwner(page);
    });

    await page.route("**/api/proxy/company/invite", async (route) => {
      const body = route.request().postDataJSON() ?? {};
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          id: `invite-${Date.now()}`,
          email: body.email,
          staffRole: body.staffRole,
          status: "PENDING",
        }),
      });
    });

    await test.step("2. Acessar tela de Gestão de Equipe", async () => {
      await page.goto("/team-management");
      await expect(page).toHaveURL(/\/team-management/, { timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: "Equipe" }),
      ).toBeVisible({ timeout: 15_000 });
    });

    const inviteButton = page.getByRole("button", { name: /Convidar Membro/i });
    await expect(inviteButton).toBeVisible();

    const uniqueId = Date.now().toString().slice(-4);

    await test.step("3. Convidar Cozinheiro (Cook)", async () => {
      await inviteButton.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Convidar Membro")).toBeVisible();

      await dialog.locator("#invite-email").fill(`cozinha.${uniqueId}@bear.com`);

      // Seleciona Cozinheiro
      const roleSelect = dialog.locator("#invite-role");
      await roleSelect.selectOption("cook");

      const sendBtn = dialog.getByRole("button", { name: "Enviar Convite" });
      await sendBtn.click();

      await expect(dialog).toBeHidden({ timeout: 15_000 });
    });

    await test.step("4. Convidar Entregador (Delivery)", async () => {
      await inviteButton.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.locator("#invite-email").fill(`entregador.${uniqueId}@bear.com`);

      // Seleciona Entregador
      const roleSelect = dialog.locator("#invite-role");
      await roleSelect.selectOption("delivery");

      const sendBtn = dialog.getByRole("button", { name: "Enviar Convite" });
      await sendBtn.click();

      await expect(dialog).toBeHidden({ timeout: 15_000 });
    });
  });
});
