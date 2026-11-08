import { expect, test } from "@playwright/test";

import { loginViaUI } from "./helpers/session";
import { hasClientCredentials } from "./helpers/test-config";

test.describe("Autenticação do cliente", () => {
  test.skip(
    !hasClientCredentials,
    "Defina E2E_CLIENT_EMAIL e E2E_CLIENT_PASSWORD para rodar o login.",
  );

  test("login com o cliente de teste entra e fecha o modal", async ({
    page,
  }) => {
    await loginViaUI(page);

    // Continua autenticado na home: o botão "Entrar" do cabeçalho sumiu.
    await expect(
      page.getByRole("banner").getByRole("button", { name: "Entrar" }),
    ).toHaveCount(0);
  });

  test("login com senha errada mostra erro e mantém o modal aberto", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Entrar" })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.locator("#email").fill("nao-existe+e2e@example.com");
    await dialog.locator("#password").fill("SenhaErrada!1");
    await dialog.getByRole("button", { name: "Entrar" }).click();

    // Mensagem de erro do back/validação e o modal segue aberto.
    await expect(dialog.getByText(/incorret|inválid|erro/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog).toBeVisible();
  });
});
