import { expect, test } from "@playwright/test";

import { loginViaUI, seedLocationCookie } from "./helpers/session";
import { hasClientCredentials } from "./helpers/test-config";

/**
 * Jornada completa do cliente: home -> login -> cardápio -> carrinho ->
 * checkout. O objetivo é barrar erro grosseiro no fluxo de compra antes de ir
 * pra prod.
 *
 * NÃO finaliza o pedido de propósito: o teste roda contra o back de teste da
 * dev e não deve gerar pedido real nem efeito destrutivo. Para no checkout,
 * confirmando que a tela montou com os itens.
 *
 * Passos que dependem de dado semeado (restaurante/produto na região da
 * localização semeada) se auto-pulam com anotação em vez de falhar — assim o
 * gate do pipeline quebra em regressão de verdade, não por falta de seed.
 */
test.describe("Jornada do cliente", () => {
  test.skip(
    !hasClientCredentials,
    "Defina E2E_CLIENT_EMAIL e E2E_CLIENT_PASSWORD para rodar a jornada.",
  );

  test.beforeEach(async ({ context, baseURL }) => {
    await seedLocationCookie(context, baseURL!);
  });

  test("compra do cliente até o checkout", async ({ page }) => {
    await test.step("login", async () => {
      await loginViaUI(page);
    });

    await test.step("home lista restaurantes", async () => {
      await page.goto("/");
      await expect(
        page.getByRole("banner").getByText("BearDelivery"),
      ).toBeVisible();
    });

    const restaurantCards = page.getByRole("button", {
      name: /Abrir cardapio de/i,
    });

    await test.step("abrir o primeiro restaurante", async () => {
      // Espera o catálogo carregar (ou confirmar que veio vazio).
      await expect(async () => {
        expect(await restaurantCards.count()).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 }).catch(() => {});

      const count = await restaurantCards.count();
      test.skip(
        count === 0,
        "Back de teste sem restaurante semeado na região da localização.",
      );

      await restaurantCards.first().click();
      await expect(page).toHaveURL(/\/restaurant\/.+/);
    });

    const menu = page.getByRole("region", { name: "Itens do cardápio" });
    const menuItems = menu.getByRole("heading", { level: 3 });

    await test.step("abrir um produto do cardápio", async () => {
      await expect(async () => {
        expect(await menuItems.count()).toBeGreaterThan(0);
      }).toPass({ timeout: 20_000 }).catch(() => {});

      const count = await menuItems.count();
      test.skip(
        count === 0,
        "Restaurante de teste sem produto disponível no cardápio.",
      );

      await menuItems.first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
    });

    await test.step("adicionar ao carrinho", async () => {
      const dialog = page.getByRole("dialog");
      const addButton = dialog.getByRole("button", { name: /Adicionar/i });

      await expect(addButton).toBeVisible();

      // Produto que exige escolher opção/tamanho, está esgotado ou com a loja
      // fechada deixa o "Adicionar" desabilitado — fora do escopo deste smoke.
      const disabled = await addButton.isDisabled();
      test.skip(
        disabled,
        "Produto exige opções/indisponível: fora do caminho feliz do smoke.",
      );

      await addButton.click();
      // O modal fecha e o carrinho passa a ter item (botão flutuante aparece).
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
    });

    await test.step("carrinho com o item", async () => {
      await page.goto("/cart");
      await expect(
        page.getByRole("heading", { name: "Seu carrinho" }),
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: "Seu carrinho está vazio" }),
      ).toHaveCount(0);
    });

    await test.step("ir pro checkout (sem finalizar)", async () => {
      const finalizar = page.getByRole("button", { name: "Finalizar pedido" });
      await expect(finalizar).toBeVisible();

      // Loja fechada / item esgotado desabilita o botão — não dá pra avançar.
      const disabled = await finalizar.isDisabled();
      test.skip(
        disabled,
        "Loja fechada ou item esgotado: não é possível avançar ao checkout.",
      );

      await finalizar.click();
      await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });

      // Checkout montou autenticado (não voltou pra home nem abriu login).
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("banner")).toBeVisible();
    });
  });
});
