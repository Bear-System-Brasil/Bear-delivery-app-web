import { expect, test } from "@playwright/test";

import { loginAsCourier, loginAsOwner, loginViaUI } from "./helpers/session";
import {
  hasClientCredentials,
  hasCourierCredentials,
  hasOwnerCredentials,
} from "./helpers/test-config";

test.describe("Rotas protegidas (visitante sem login)", () => {
  test("acessar /profile sem estar logado redireciona pra home e abre o modal de login", async ({
    page,
  }) => {
    await page.goto("/profile");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Entrar" })).toBeVisible();
  });

  test("acessar /menu-management sem estar logado redireciona pra home e abre o modal de login", async ({
    page,
  }) => {
    await page.goto("/menu-management");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("/cart é liberado pra visitante sem login (guestAllowed)", async ({ page }) => {
    const response = await page.goto("/cart");

    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});

test.describe("Rotas protegidas por perfil (Middleware)", () => {
  test("cliente logado não acessa /kitchen nem /company-profile", async ({
    page,
  }) => {
    test.skip(
      !hasClientCredentials,
      "Defina credenciais de cliente para rodar.",
    );

    await loginViaUI(page);

    await page.goto("/kitchen");
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 15_000 });
    await expect(page.getByText("Acesso Negado")).toBeVisible();

    await page.goto("/company-profile");
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 15_000 });
    await expect(page.getByText("Acesso Negado")).toBeVisible();
  });

  test("entregador logado não acessa /financial-management/dashboard", async ({
    page,
  }) => {
    test.skip(
      !hasCourierCredentials,
      "Defina credenciais de entregador para rodar.",
    );

    await loginAsCourier(page);

    await page.goto("/financial-management/dashboard");
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 15_000 });
    await expect(page.getByText("Acesso Negado")).toBeVisible();
  });

  test("proprietário logado não acessa /delivery-dashboard", async ({
    page,
  }) => {
    test.skip(
      !hasOwnerCredentials,
      "Defina credenciais de proprietário para rodar.",
    );

    await loginAsOwner(page);

    await page.goto("/delivery-dashboard");
    await expect(page).toHaveURL(/\/unauthorized/, { timeout: 15_000 });
    await expect(page.getByText("Acesso Negado")).toBeVisible();
  });
});
