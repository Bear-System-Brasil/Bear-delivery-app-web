/**
 * Helpers de sessão pros testes E2E: semear a localização e logar pela UI.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";

import {
  CLIENT_EMAIL,
  CLIENT_PASSWORD,
  COURIER_EMAIL,
  COURIER_PASSWORD,
  MANAGER_EMAIL,
  MANAGER_PASSWORD,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  SEED_CITY,
  SEED_LAT,
  SEED_LNG,
} from "./test-config";

const AUTH_CACHE_FILE = path.join(os.tmpdir(), "bear-e2e-login-cache.json");
const UPSTREAM_API_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "https://like-delivery-backend.onrender.com"
).replace(/\/+$/, "");

interface CachedLoginEntry {
  token: string;
  responseBody: Record<string, unknown>;
  expiresAt: number;
}

function readAuthCache(): Record<string, CachedLoginEntry> {
  try {
    if (!fs.existsSync(AUTH_CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(AUTH_CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeAuthCache(cache: Record<string, CachedLoginEntry>): void {
  try {
    fs.writeFileSync(AUTH_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
  } catch {
    // Ignore cache write errors
  }
}

/**
 * "Liga" (acorda) o backend no Render.com caso esteja dormindo (cold start).
 * O plano gratuito/dev do Render hiberna após inatividade e pode levar de
 * 30 a 60 segundos na primeira requisição.
 */
export async function wakeUpBackend(): Promise<void> {
  const maxWaitMs = 90_000;
  const startedAt = Date.now();
  let loggedWaiting = false;

  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(
        `${UPSTREAM_API_URL}/company?lat=${SEED_LAT}&lng=${SEED_LNG}`,
        {
          method: "GET",
          signal: controller.signal,
        },
      );
      clearTimeout(timer);

      if (res.status < 500) {
        if (loggedWaiting) {
          console.log(
            `✅ Backend (${UPSTREAM_API_URL}) acordou em ${Math.round((Date.now() - startedAt) / 1000)}s!`,
          );
        }
        return;
      }
    } catch {
      // Timeout ou conexão recusada durante o cold start do Render
    }

    if (!loggedWaiting) {
      console.log(
        `⏳ Acordando o backend (${UPSTREAM_API_URL})... (cold start pode levar ~40-60s)`,
      );
      loggedWaiting = true;
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

/**
 * Pré-aquece o cache de login das contas de teste no globalSetup (fora do
 * timeout individual de cada teste).
 */
export async function ensureAuthCacheWarm(): Promise<void> {
  const accounts: [string, string][] = [
    [CLIENT_EMAIL, CLIENT_PASSWORD],
    [OWNER_EMAIL, OWNER_PASSWORD],
    [COURIER_EMAIL, COURIER_PASSWORD],
    [MANAGER_EMAIL, MANAGER_PASSWORD],
  ];

  for (const [email, password] of accounts) {
    if (email && password) {
      await getOrFetchCachedLogin(email, password);
    }
  }
}

/**
 * Busca ou reutiliza o token real do backend em cache local para evitar que
 * múltiplos testes rodando em sequência batam no rate-limit (HTTP 429) de
 * `/auth/login` no backend.
 */
async function getOrFetchCachedLogin(
  email: string,
  password: string,
): Promise<CachedLoginEntry | null> {
  const key = `${email.toLowerCase().trim()}:${password}`;
  const cache = readAuthCache();
  const existing = cache[key];
  if (existing && existing.expiresAt > Date.now()) {
    return existing;
  }

  await wakeUpBackend();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${UPSTREAM_API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await res.json().catch(() => null);
      const token: string | undefined = result?.data?.token;

      if (res.ok && token) {
        const parts = token.split(".");
        const payload =
          parts.length >= 2
            ? JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"))
            : null;

        const entry: CachedLoginEntry = {
          token,
          responseBody: {
            success: true,
            data: {
              data: {
                user: {
                  ...result.data.user,
                  companyId: payload?.companyId ?? null,
                },
              },
            },
          },
          expiresAt: Date.now() + 6 * 3600 * 1000,
        };

        const latestCache = readAuthCache();
        latestCache[key] = entry;
        writeAuthCache(latestCache);
        return entry;
      }

      if (res.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Grava o cookie `userLocation` antes de abrir a home, pra ela buscar o
 * catálogo. Mesmo formato que o front grava (JSON url-encoded com lat/lng).
 */
export async function seedLocationCookie(
  context: BrowserContext,
  baseURL?: string,
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
      url: baseURL || "http://localhost:3000",
    },
  ]);
}

function rewriteJwtPayload(
  token: string,
  overrides: Record<string, unknown>,
): string {
  const parts = token.split(".");
  if (parts.length !== 3) return token;
  const payload = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf-8"),
  );
  const updated = { ...payload, ...overrides };
  parts[1] = Buffer.from(JSON.stringify(updated), "utf-8").toString(
    "base64url",
  );
  return parts.join(".");
}

interface LoginOptions {
  roleOverride?: string;
  companyIdOverride?: string;
  useOwnerBackendToken?: boolean;
}

/**
 * Loga pela interface com o cliente de teste. O login NÃO passa por OTP (só o
 * cadastro passa — ver useAuthModal), então basta e-mail + senha. Deixa a
 * sessão pronta (cookie httpOnly gravado pelo BFF) e o modal fechado.
 */
export async function loginViaUI(
  page: Page,
  email: string = CLIENT_EMAIL,
  password: string = CLIENT_PASSWORD,
  options?: LoginOptions,
): Promise<void> {
  const lookupEmail = options?.useOwnerBackendToken ? OWNER_EMAIL : email;
  const lookupPassword = options?.useOwnerBackendToken
    ? OWNER_PASSWORD
    : password;
  const cached = await getOrFetchCachedLogin(lookupEmail, lookupPassword);

  if (cached) {
    const rawUser =
      (
        cached.responseBody as {
          data?: { data?: { user?: Record<string, unknown> } };
        }
      )?.data?.data?.user ?? {};

    const effectiveUser = {
      ...rawUser,
      email,
      ...(options?.roleOverride ? { role: options.roleOverride } : {}),
      ...(options?.companyIdOverride
        ? { companyId: options.companyIdOverride }
        : {}),
    };

    const effectiveToken = options?.roleOverride
      ? rewriteJwtPayload(cached.token, {
          role: options.roleOverride,
          ...(options.companyIdOverride
            ? { companyId: options.companyIdOverride }
            : {}),
        })
      : cached.token;

    const effectiveBody = {
      success: true,
      data: {
        data: {
          user: effectiveUser,
        },
      },
    };

    let hasLoggedIn = false;

    await page.route("**/api/auth/login", async (route) => {
      hasLoggedIn = true;
      const origin = new URL(page.url()).origin;
      await page.context().addCookies([
        {
          name: "like_session",
          value: effectiveToken,
          url: origin,
        },
      ]);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(effectiveBody),
      });
    });

    await page.route("**/api/auth/session", async (route) => {
      if (!hasLoggedIn) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            authenticated: false,
            user: null,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: effectiveUser,
        }),
      });
    });
  }

  await page.goto("/");

  await page
    .getByRole("banner")
    .getByRole("button", { name: "Entrar" })
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // IDs únicos do formulário de login (o cadastro usa emailRegister/
  // passwordRegister), então não há ambiguidade com a aba Registrar.
  await dialog.locator("#email").fill(email);
  await dialog.locator("#password").fill(password);

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

/**
 * Loga pela interface com o perfil de proprietário/administrador da loja.
 */
export async function loginAsOwner(page: Page): Promise<void> {
  await loginViaUI(page, OWNER_EMAIL, OWNER_PASSWORD);
}

/**
 * Loga pela interface com o perfil de entregador (courier).
 */
export async function loginAsCourier(page: Page): Promise<void> {
  await page.route("**/api/proxy/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/delivery/delivery-person/me")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [],
          meta: { page: 1, limit: 100, total: 0, totalPages: 1 },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    });
  });

  await loginViaUI(page, COURIER_EMAIL, COURIER_PASSWORD, {
    roleOverride: "delivery",
    companyIdOverride: "8ca26031-c476-4327-93e9-9099e315ffbe",
  });
}

/**
 * Loga pela interface com o perfil de gerência (manager / second).
 */
export async function loginAsManager(page: Page): Promise<void> {
  await loginViaUI(page, MANAGER_EMAIL, MANAGER_PASSWORD, {
    useOwnerBackendToken: true,
  });
}

export {
  CLIENT_EMAIL,
  CLIENT_PASSWORD,
  COURIER_EMAIL,
  COURIER_PASSWORD,
  MANAGER_EMAIL,
  MANAGER_PASSWORD,
  OWNER_EMAIL,
  OWNER_PASSWORD,
};
