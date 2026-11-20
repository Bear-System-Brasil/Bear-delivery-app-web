import { expect, test } from "@playwright/test";

import { loginViaUI, seedLocationCookie } from "./helpers/session";
import { hasClientCredentials } from "./helpers/test-config";

/**
 * Complemento do Fluxo 1 (guia-de-testes.html):
 * - Seletor de localização e endereço no header
 * - Abas da página pública da loja (Cardápio, Informações, Avaliações)
 * - Histórico de pedidos (/orders) e status (/order-status) do cliente logado
 */
test.describe("Cliente - Localização, Abas da Loja e Pedidos", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await seedLocationCookie(context, baseURL!);
  });

  test("seletor de localização no header abre o formulário de endereço e CEP", async ({
    page,
  }) => {
    await page.goto("/");

    const locationTrigger = page
      .getByRole("banner")
      .getByRole("button", { name: /Entregar em:/i });
    await expect(locationTrigger).toBeVisible();
    await locationTrigger.click();

    const sheetDialog = page.getByRole("dialog");
    await expect(sheetDialog).toBeVisible();

    const changeBtn = sheetDialog.getByRole("button", { name: /Trocar/i });
    if (await changeBtn.isVisible()) {
      await changeBtn.click();
    }

    await expect(sheetDialog.getByText("Seu endereço")).toBeVisible();
    await expect(
      sheetDialog.getByText(/Comece pelo CEP ou escolha estado e cidade/i),
    ).toBeVisible();
  });

  test("página pública do restaurante alterna entre Cardápio, Informações e Avaliações", async ({
    page,
  }) => {
    await page.goto("/");

    const restaurantCards = page.getByRole("button", {
      name: /Abrir cardapio de/i,
    });

    await expect(async () => {
      expect(await restaurantCards.count()).toBeGreaterThan(0);
    })
      .toPass({ timeout: 20_000 })
      .catch(() => {});

    const count = await restaurantCards.count();
    test.skip(count === 0, "Nenhum restaurante ativo na região semeada.");

    await restaurantCards.first().click();
    await expect(page).toHaveURL(/\/restaurant\/.+/);

    const tablist = page.getByRole("tablist", { name: "Seções da loja" });
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    // Aba Informações
    await tablist.locator("#tab-info").click();
    const infoPanel = page.locator("#painel-info");
    await expect(infoPanel).toBeVisible();
    await expect(infoPanel.getByText(/Horário de funcionamento/i)).toBeVisible();

    // Aba Avaliações
    await tablist.locator("#tab-reviews").click();
    await expect(page.locator("#painel-reviews")).toBeVisible();

    // Retornar para Cardápio
    await tablist.locator("#tab-menu").click();
    await expect(page.locator("#painel-menu")).toBeVisible();
  });

  test("cliente logado acessa /orders e /order-status sem erros", async ({
    page,
  }) => {
    test.skip(
      !hasClientCredentials,
      "Defina E2E_CLIENT_EMAIL e E2E_CLIENT_PASSWORD para rodar.",
    );

    await loginViaUI(page);

    await test.step("Histórico de pedidos (/orders)", async () => {
      await page.goto("/orders");
      await expect(page).toHaveURL(/\/orders/, { timeout: 15_000 });
      await expect(
        page.getByRole("heading", { name: "Meus pedidos" }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Acompanhamento de pedido (/order-status)", async () => {
      await page.goto("/order-status");
      await expect(page).toHaveURL(/\/order-status/, { timeout: 15_000 });

      // Sem orderId na query, mostra estado limpo ("Pedido não encontrado" ou o status caso exista)
      const statusOrEmpty = page
        .getByText(/Pedido não encontrado|Status do Pedido|Voltar para Restaurantes/i)
        .first();
      await expect(statusOrEmpty).toBeVisible({ timeout: 15_000 });
    });
  });
});
