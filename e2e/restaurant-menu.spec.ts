import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers/session";
import { hasOwnerCredentials } from "./helpers/test-config";

/**
 * Testes E2E de Gestão do Cardápio (Owner / Gerente):
 * - Acessar a tela de gestão do cardápio (/menu-management)
 * - Abrir o modal de adicionar novo prato
 * - Preencher dados obrigatórios (Nome, Categoria, Descrição, Preço de venda)
 * - Salvar prato
 * - Testar o fluxo de remoção com confirmação de diálogo de alerta
 */
test.describe("Restaurante - Gestão de Cardápio", () => {
  test.skip(
    !hasOwnerCredentials,
    "Defina credenciais de proprietário (E2E_OWNER_EMAIL / PASSWORD) para rodar.",
  );

  test("adicionar e gerenciar prato no cardápio", async ({ page }) => {
    await test.step("1. Login como Proprietário (Owner)", async () => {
      await loginAsOwner(page);
    });

    await test.step("2. Acessar a página de Gestão de Cardápio", async () => {
      await page.goto("/menu-management");
      await expect(page).toHaveURL(/\/menu-management/, { timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: "Cardápio" }),
      ).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step("2.1. Testar Prévia interativa e alternar modo Duplicar", async () => {
      const previewBtn = page.getByRole("button", { name: "Prévia" });
      await expect(previewBtn).toBeVisible();
      await previewBtn.click();

      const previewDialog = page.getByRole("dialog");
      await expect(previewDialog).toBeVisible();
      await expect(previewDialog.getByText("Prévia no app")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(previewDialog).toBeHidden({ timeout: 10_000 });

      const duplicateBtn = page.getByRole("button", { name: "Duplicar" });
      if (await duplicateBtn.isEnabled()) {
        await duplicateBtn.click();
        const cancelDuplicateBtn = page.getByRole("button", {
          name: "Cancelar",
        });
        await expect(cancelDuplicateBtn).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await cancelDuplicateBtn.click();
      }
    });

    const addDishButton = page.getByRole("button", { name: "Adicionar Prato" });
    await expect(addDishButton).toBeVisible();

    const testDishName = `Prato Teste ${Date.now().toString().slice(-4)}`;

    await test.step("3. Abrir modal e cadastrar novo prato", async () => {
      await addDishButton.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: "Adicionar Novo Prato" }),
      ).toBeVisible();

      // Nome do prato
      await dialog.locator("#name").fill(testDishName);

      // Categoria: seletor ou criar nova
      const categorySelect = dialog.locator("select");
      if (await categorySelect.isVisible()) {
        const optionsCount = await categorySelect.locator("option").count();
        if (optionsCount > 1) {
          await categorySelect.selectOption({ index: 1 });
        } else {
          // Criar nova se não tiver nenhuma
          await dialog.getByText("+ Criar nova").click();
          await dialog
            .locator("#newCategory")
            .fill(`Categoria ${Date.now().toString().slice(-4)}`);
        }
      }

      // Descrição
      await dialog.locator("#description").fill("Descrição detalhada do prato criado para teste automatizado.");

      // Preço de custo (R$ 15,00) e Preço de venda (R$ 29,90)
      const costPriceInput = dialog.locator("#costPrice");
      if (await costPriceInput.isVisible()) {
        await costPriceInput.fill("1500");
      }

      const salePriceInput = dialog.locator("#salePrice");
      await salePriceInput.fill("2990");

      // Quantidade em estoque
      const stockInput = dialog.locator("#stockQuantity");
      if (await stockInput.isVisible()) {
        await stockInput.fill("10");
      }

      // Clicar em Criar Prato
      const submitBtn = dialog.getByRole("button", { name: /Criar Prato/i });
      await submitBtn.click();

      // Diálogo deve fechar após sucesso
      await expect(dialog).toBeHidden({ timeout: 30_000 });
    });

    await test.step("4. Localizar prato cadastrado e acionar remoção", async () => {
      // Procura o prato criado na lista
      const createdDishCard = page.locator(`text=${testDishName}`).first();
      await expect(createdDishCard).toBeVisible({ timeout: 15_000 });

      // Localiza o botão de excluir prato associado
      const dishContainer = page
        .locator("div")
        .filter({ hasText: testDishName })
        .last();

      const deleteBtn = dishContainer.locator("button[title*='Excluir'], button[aria-label*='Excluir']").first();
      
      if (await deleteBtn.isVisible()) {
        await deleteBtn.click();

        // Modal de confirmação
        const alertContent = page.getByRole("alertdialog");
        await expect(alertContent).toBeVisible();
        await expect(alertContent.getByText("Atenção!")).toBeVisible();

        // Confirmar remoção
        const confirmDeleteBtn = alertContent.getByRole("button", { name: "Remover Prato" });
        await confirmDeleteBtn.click();

        await expect(alertContent).toBeHidden({ timeout: 15_000 });
        await expect(page.locator(`text=${testDishName}`)).toHaveCount(0, {
          timeout: 10_000,
        });
      }
    });
  });
});
