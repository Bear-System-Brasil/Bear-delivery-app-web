import { expect, test } from "@playwright/test";

/**
 * Teste E2E de Criação de Conta de Restaurante (Empresa / Owner):
 * - Acessar a rota /restaurant-register
 * - Preencher dados da empresa (Nome Fantasia, Razão Social, CNPJ, Raio de Entrega)
 * - Preencher dados do proprietário (E-mail, Telefone, Senha e Nascimento)
 * - Aceitar termos de parceria
 * - Submeter cadastro
 */
test.describe("Criação de Conta - Restaurante & Proprietário", () => {
  test("cadastro completo de novo restaurante parceiro", async ({ page }) => {
    await page.goto("/restaurant-register");
    await expect(page).toHaveURL(/\/restaurant-register/, { timeout: 15_000 });

    const uniqueId = Date.now().toString().slice(-4);
    const storeEmail = `restaurante.teste.${uniqueId}@bear.com`;

    // 1. Dados da Empresa
    await page.locator("#tradeName").fill(`Restaurante Urso ${uniqueId}`);
    await page.locator("#legalName").fill(`Restaurante Urso ${uniqueId} LTDA`);

    // CNPJ fictício formatado (14 dígitos)
    const cnpjInput = page.locator("#cnpj");
    await cnpjInput.fill("12.345.678/0001-90");

    // Descrição e raio de atendimento
    const descInput = page.locator("#description");
    if (await descInput.isVisible()) {
      await descInput.fill("Restaurante parceiro especializado em hambúrgueres e lanches artesanais.");
    }

    const radiusInput = page.locator("#actionRadius");
    if (await radiusInput.isVisible()) {
      await radiusInput.fill("7");
    }

    // 2. Dados de Acesso do Responsável
    await page.locator("#email").fill(storeEmail);
    await page.locator("#phone").fill("(11) 98888-7777");
    await page.locator("#password").fill("Teste@1234");
    await page.locator("#confirmPassword").fill("Teste@1234");

    const birthDateInput = page.locator("#birthDate");
    if (await birthDateInput.isVisible()) {
      await birthDateInput.fill("10/08/1990");
    }

    // 3. Termos de Adesão
    const termsCheckbox = page.locator("#acceptTerms");
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
                id: `e2e-owner-${uniqueId}`,
                name: `Restaurante Urso ${uniqueId}`,
                email: storeEmail,
                role: "owner",
              },
            },
          },
        }),
      });
    });

    // 4. Botão de Finalizar Cadastro
    const submitBtn = page.getByRole("button", { name: /Cadastrar restaurante|Cadastrar/i });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeEnabled();

    await submitBtn.click();
  });
});
