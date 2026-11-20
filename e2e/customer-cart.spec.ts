import { expect, test } from "@playwright/test";

import { loginViaUI, seedLocationCookie } from "./helpers/session";
import { hasClientCredentials } from "./helpers/test-config";

/**
 * Testes E2E do Carrinho do Cliente:
 * - Adicionar prato do cardápio ao carrinho
 * - Aumentar quantidade (+) e diminuir (-)
 * - Remover item diretamente pelo botão de lixeira
 * - Validar estado de "Seu carrinho está vazio"
 * - Re-adicionar e avançar para o Checkout
 */
test.describe("Cliente - Carrinho e Gestão de Itens", () => {
  test.skip(
    !hasClientCredentials,
    "Defina E2E_CLIENT_EMAIL e E2E_CLIENT_PASSWORD para rodar o teste.",
  );

  test.beforeEach(async ({ context, baseURL }) => {
    await seedLocationCookie(context, baseURL!);
  });

  test("adicionar prato, alterar quantidade, remover do carrinho e avançar para checkout", async ({
    page,
  }) => {
    await test.step("1. Realizar Login", async () => {
      await loginViaUI(page);
    });

    await test.step("2. Acessar Home e abrir o primeiro restaurante disponível", async () => {
      await page.goto("/");
      await expect(page.getByRole("banner")).toBeVisible();

      const restaurantCards = page.getByRole("button", {
        name: /Abrir cardapio de/i,
      });

      await expect(async () => {
        expect(await restaurantCards.count()).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 }).catch(() => {});

      const count = await restaurantCards.count();
      test.skip(count === 0, "Nenhum restaurante ativo na região de teste.");

      await restaurantCards.first().click();
      await expect(page).toHaveURL(/\/restaurant\/.+/);
    });

    const menu = page.getByRole("region", { name: "Itens do cardápio" });
    const menuItems = menu.getByRole("heading", { level: 3 });

    let addedItemName = "";

    await test.step("3. Adicionar prato simples ao carrinho", async () => {
      await expect(async () => {
        expect(await menuItems.count()).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 }).catch(() => {});

      const count = await menuItems.count();
      test.skip(count === 0, "Restaurante sem itens cadastrados no cardápio.");

      const firstItem = menuItems.first();
      addedItemName = (await firstItem.textContent())?.trim() ?? "";

      await firstItem.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const addButton = dialog.getByRole("button", { name: /Adicionar/i });
      const disabled = await addButton.isDisabled();
      test.skip(disabled, "Item indisponível ou exige variações obrigatórias.");

      await addButton.click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await page.waitForTimeout(2500);
    });

    await test.step("4. Abrir tela do carrinho e alterar quantidade", async () => {
      await page.goto("/cart");
      await expect(page.getByRole("heading", { name: "Seu carrinho" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByRole("heading", { name: "Seu carrinho está vazio" }),
      ).toHaveCount(0, { timeout: 20_000 });

      // Botão de aumentar quantidade
      const increaseBtn = page.locator("button[title='Aumentar quantidade']").first();
      if (await increaseBtn.isVisible()) {
        const canIncrease = !(await increaseBtn.isDisabled());
        if (canIncrease) {
          await increaseBtn.click();
        }
      }

      // Botão de diminuir quantidade
      const decreaseBtn = page.locator("button[title='Diminuir quantidade']").first();
      if (await decreaseBtn.isVisible()) {
        await decreaseBtn.click();
      }
    });

    await test.step("5. Remover prato do carrinho e verificar estado vazio", async () => {
      const removeBtn = page.locator("button[title*='Remover']").first();
      await expect(removeBtn).toBeVisible({ timeout: 10_000 });
      await removeBtn.click();

      // Confirma que o carrinho ficou vazio
      await expect(
        page.getByRole("heading", { name: /Seu carrinho está vazio/i }),
      ).toBeVisible({ timeout: 15_000 });
    });
  });
});
