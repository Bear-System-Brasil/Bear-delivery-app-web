/**
 * Marca a resposta para nenhum cache guardar (LDMF-348).
 *
 * Rota do Next sem Cache-Control sai da Vercel como
 * `public, max-age=0, must-revalidate`. Hoje isso não é reaproveitado, mas
 * continua `public`: uma regra de cache futura faria o CDN servir a resposta
 * de um usuário para outro, já que a chave do cache ignora o cookie de
 * sessão. Toda rota que devolve dado de usuário ou token passa por aqui.
 */
export function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
