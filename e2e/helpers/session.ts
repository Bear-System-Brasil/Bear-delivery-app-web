/**
 * Helpers de sessão pros testes E2E: semear a localização e logar pela UI.
 */
import { expect, type BrowserContext, type Page } from "@playwright/test";

import {
  CLIENT_EMAIL,
  CLIENT_PASSWORD,
  SEED_CITY,
  SEED_LAT,
  SEED_LNG,
} from "./test-config";

/**
 * Grava o cookie `userLocation` antes de abrir a home, pra ela buscar o
 * catálogo. Mesmo formato que o front grava (JSON url-encoded com lat/lng).
 */
export async function seedLocationCookie(
  context: BrowserContext,
  baseURL: string,
  coords: { lat: number; lng: number; city?: string } = {
    lat: SEED_LAT,
    lng: SEED_LNG,
    city: SEED_CITY,
  },
): Promise<void> {
  const value = encodeURIComponent(
    JSON.stringify({ lat: coords.lat, lng: coords.lng, city: coords.city }),
  );

  await context.addCookies([
    {
      name: "userLocation",
      value,
      url: baseURL,
    },
  ]);
}

/**
 * Loga pela interface com o cliente de teste. O login NÃO passa por OTP (só o
 * cadastro passa — ver useAuthModal), então basta e-mail + senha. Deixa a
 * sessão pronta (cookie httpOnly gravado pelo BFF) e o modal fechado.
 */
export async function loginViaUI(page: Page): Promise<void> {
  await page.goto("/");

  await page
    .getByRole("banner")
    .getByRole("button", { name: "Entrar" })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // IDs únicos do formulário de login (o cadastro usa emailRegister/
  // passwordRegister), então não há ambiguidade com a aba Registrar.
  await dialog.locator("#email").fill(CLIENT_EMAIL);
  await dialog.locator("#password").fill(CLIENT_PASSWORD);

  await dialog.getByRole("button", { name: "Entrar" }).click();

  // Sucesso: a mensagem aparece e, em seguida, o modal fecha sozinho.
  await expect(dialog.getByText(/Login realizado com sucesso/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });

  // Logado, o cabeçalho troca "Entrar" pelo menu de perfil.
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Entrar" }),
  ).toHaveCount(0);
}

export { CLIENT_EMAIL, CLIENT_PASSWORD };
