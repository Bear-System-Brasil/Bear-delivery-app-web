import { expect, test } from "@playwright/test";

test.describe("Home", () => {
  test("carrega o cabeçalho com logo e busca", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("BearaDelivery")).toBeVisible();
    await expect(page.getByPlaceholder("Buscar...")).toBeVisible();
  });

  test("abre o modal de autenticação ao clicar em Entrar", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("banner").getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Entrar" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Registrar" })).toBeVisible();
  });
});
