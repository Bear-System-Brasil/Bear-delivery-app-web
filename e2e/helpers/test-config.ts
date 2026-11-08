/**
 * Configuração compartilhada dos testes E2E.
 *
 * Credenciais NUNCA ficam no código: vêm só de variável de ambiente, injetadas
 * pelo pipeline (secret do Jenkins) ou pelo shell local. Sem elas, os testes
 * que dependem de login se auto-pulam (test.skip) em vez de falhar.
 */

/** E-mail do cliente de teste (pré-ativado no back de teste). */
export const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";

/** Senha do cliente de teste. */
export const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";

/** Só roda a jornada autenticada quando as duas credenciais existem. */
export const hasClientCredentials = Boolean(CLIENT_EMAIL && CLIENT_PASSWORD);

/**
 * Localização semeada no cookie `userLocation`. Sem endereço a home não chama
 * o back (ver home-page-wrapper), então o catálogo nunca apareceria. As
 * coordenadas podem ser sobrescritas por env pra apontar pra região onde o
 * back de teste tem restaurante semeado. O default é o centro de São Paulo.
 */
export const SEED_LAT = Number(process.env.E2E_SEED_LAT ?? "-23.55052");
export const SEED_LNG = Number(process.env.E2E_SEED_LNG ?? "-46.633308");
export const SEED_CITY = process.env.E2E_SEED_CITY ?? "Sao Paulo";
