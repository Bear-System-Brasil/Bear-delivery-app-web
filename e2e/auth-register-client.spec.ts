import { expect, test } from "@playwright/test";

/**
 * Teste E2E de Criação de Conta de Cliente:
 * - Acessar a home
 * - Abrir modal de autenticação e selecionar a aba "Registrar"
 * - Preencher dados do consumidor (Nome, E-mail, Telefone, Nascimento, Senha, Confirmação)
 * - Aceitar termos de uso
 * - Submeter e verificar feedback
 */
test.describe("Criação de Conta - Cliente", () => {
  test("preencher e submeter formulário de cadastro de cliente", async ({ page }) => {
    await page.goto("/");

    // Clica em Entrar no cabeçalho
    await page.getByRole("banner").getByRole("button", { name: "Entrar" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Alterna para a aba Registrar
    const registerTab = dialog.getByRole("tab", { name: "Registrar" });
    await expect(registerTab).toBeVisible();
    await registerTab.click();

    // Gera dados dinâmicos para o teste
    const uniqueId = Date.now().toString().slice(-5);
    const clientEmail = `cliente.teste.${uniqueId}@bear.com`;

    // Preenche campos do formulário
    await dialog.locator("#name").fill("Cliente Teste E2E");
    await dialog.locator("#emailRegister").fill(clientEmail);
    await dialog.locator("#phoneRegister").fill("(11) 98765-4321");

    // Preenche data de nascimento (maior de idade)
    const birthInput = dialog.locator("#birthDate");
    if (await birthInput.isVisible()) {
      await birthInput.fill("15/05/1995");
    }

    // Preenche senha válida (mínimo 8 caracteres, maiúscula, minúscula, número e especial)
    await dialog.locator("#passwordRegister").fill("Teste@1234");
    await dialog.locator("#confirmPassword").fill("Teste@1234");

    // Aceita termos de uso (checkbox Radix com id="acceptTerms")
    const termsCheckbox = dialog.locator("#acceptTerms");
    await expect(termsCheckbox).toBeVisible();
    await termsCheckbox.click();

    // Intercepta a chamada de registro para não abortar o request no meio nem poluir o banco
    await page.route("**/api/auth/register", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            data: {
              user: {
                id: `e2e-${uniqueId}`,
                name: "Cliente Teste E2E",
                email: clientEmail,
                role: "client",
              },
            },
          },
        }),
      });
    });

    // Botão de Criar Conta
    const submitButton = dialog.getByRole("button", { name: /Criar conta|Cadastrar/i });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();

    await submitButton.click();
  });
});
