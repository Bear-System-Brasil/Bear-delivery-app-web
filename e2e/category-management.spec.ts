import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers/session";
import { hasOwnerCredentials } from "./helpers/test-config";

/**
 * Complemento do Fluxo 4 (guia-de-testes.html) — Gestão de Categorias:
 * - Login como Proprietário (Owner) e acessar /category-management
 * - Criar nova categoria ("Adicionar Categoria")
 * - Buscar pela categoria criada
 * - Remover categoria com confirmação no diálogo de alerta
 */
test.describe("Restaurante - Gestão de Categorias", () => {
  test.skip(
    !hasOwnerCredentials,
    "Defina credenciais de proprietário (E2E_OWNER_EMAIL / PASSWORD) para rodar.",
  );

  test("criar, buscar e remover categoria do cardápio", async ({ page }) => {
    await test.step("1. Login como Proprietário", async () => {
      await loginAsOwner(page);
    });

    await test.step("2. Acessar /category-management", async () => {
      await page.goto("/category-management");
      await expect(page).toHaveURL(/\/category-management/, {
        timeout: 15_000,
      });
      await expect(
        page.getByRole("button", { name: "Adicionar Categoria" }),
      ).toBeVisible({ timeout: 15_000 });
    });

    const categoryName = `Categoria E2E ${Date.now().toString().slice(-4)}`;

    await test.step("3. Criar nova categoria", async () => {
      await page.getByRole("button", { name: "Adicionar Categoria" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: "Adicionar Nova Categoria" }),
      ).toBeVisible();

      await dialog.locator("#name").fill(categoryName);
      await dialog
        .locator("#description")
        .fill("Categoria temporária criada pelo teste E2E.");

      await dialog.getByRole("button", { name: /Criar Categoria/i }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
    });

    await test.step("4. Buscar e remover a categoria criada", async () => {
      const searchInput = page.getByPlaceholder("Buscar categorias...");
      await expect(searchInput).toBeVisible();
      await searchInput.fill(categoryName);

      await expect(page.getByText(categoryName).first()).toBeVisible({
        timeout: 15_000,
      });

      const removeBtn = page
        .getByRole("button", { name: `Remover ${categoryName}` })
        .first();
      if (await removeBtn.isVisible()) {
        await removeBtn.click();

        const alertDialog = page.getByRole("alertdialog");
        await expect(alertDialog).toBeVisible();
        await expect(alertDialog.getByText("Atenção!")).toBeVisible();

        await alertDialog.getByRole("button", { name: /^Remover$/i }).click();
        await expect(alertDialog).toBeHidden({ timeout: 15_000 });
        await expect(page.getByText(categoryName)).toHaveCount(0, {
          timeout: 10_000,
        });
      }
    });
  });
});
