/**
 * Configuração compartilhada dos testes E2E.
 *
 * Credenciais NUNCA ficam no código: vêm só de variável de ambiente, injetadas
 * pelo pipeline (secret do Jenkins) ou pelo shell local. Sem elas, os testes
 * que dependem de login se auto-pulam (test.skip) em vez de falhar.
 */

/** E-mail do cliente de teste (pré-ativado no back de teste). */
export const CLIENT_EMAIL =
  process.env.E2E_CLIENT_EMAIL ?? "Teste+Client@bear.com";

/** Senha do cliente de teste. */
export const CLIENT_PASSWORD =
  process.env.E2E_CLIENT_PASSWORD ?? "Teste@123";

/** E-mail do dono da loja de teste. */
export const OWNER_EMAIL =
  process.env.E2E_OWNER_EMAIL ?? "Teste+Owner@bear.com";

/** Senha do dono da loja de teste. */
export const OWNER_PASSWORD =
  process.env.E2E_OWNER_PASSWORD ?? "Teste@123";

/** E-mail do entregador de teste. */
export const COURIER_EMAIL =
  process.env.E2E_COURIER_EMAIL ?? "Teste+Courier@bear.com";

/** Senha do entregador de teste. */
export const COURIER_PASSWORD =
  process.env.E2E_COURIER_PASSWORD ?? "Teste@123";

/** E-mail da gerência (Second) de teste. */
export const MANAGER_EMAIL =
  process.env.E2E_MANAGER_EMAIL ?? "Teste+Second@bear.com";

/** Senha da gerência de teste. */
export const MANAGER_PASSWORD =
  process.env.E2E_MANAGER_PASSWORD ?? "Teste@123";

/** Só roda a jornada autenticada quando as credenciais existem. */
export const hasClientCredentials = Boolean(CLIENT_EMAIL && CLIENT_PASSWORD);
export const hasOwnerCredentials = Boolean(OWNER_EMAIL && OWNER_PASSWORD);
export const hasCourierCredentials = Boolean(COURIER_EMAIL && COURIER_PASSWORD);
export const hasManagerCredentials = Boolean(MANAGER_EMAIL && MANAGER_PASSWORD);

/**
 * Localização semeada no cookie `userLocation`. Sem endereço a home não chama
 * o back (ver home-page-wrapper), então o catálogo nunca apareceria. As
 * coordenadas podem ser sobrescritas por env pra apontar pra região onde o
 * back de teste tem restaurante semeado. O default é o centro de São Paulo.
 */
export const SEED_LAT = Number(process.env.E2E_SEED_LAT ?? "-8.2833");
export const SEED_LNG = Number(process.env.E2E_SEED_LNG ?? "-35.9761");
export const SEED_CITY = process.env.E2E_SEED_CITY ?? "Caruaru";
