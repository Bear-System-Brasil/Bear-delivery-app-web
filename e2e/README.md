# Testes E2E (Playwright)

Cobrem a jornada do cliente pra barrar erro grosseiro no fluxo de compra antes
de ir pra prod. Rodam contra o back de **teste** da dev
(`like-delivery-backend.onrender.com`), nunca contra a prod.

## O que tem aqui

- `home.spec.ts` — smoke da home (cabeçalho, busca, modal de auth).
- `protected-routes.spec.ts` — guarda de rotas pra visitante sem login.
- `auth.spec.ts` — login do cliente de teste (sucesso e senha errada).
- `customer-journey.spec.ts` — jornada completa: home → login → cardápio →
  carrinho → **checkout** (para no checkout de propósito, sem finalizar pedido,
  pra não gerar efeito destrutivo no back de teste).

## Variáveis de ambiente

Credenciais **nunca** ficam no código — só em variável de ambiente (secret do
Jenkins no pipeline, ou export local). Sem elas, os testes que dependem de
login se auto-pulam (`test.skip`).

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `E2E_CLIENT_EMAIL` | sim (p/ login) | e-mail do cliente de teste pré-ativado |
| `E2E_CLIENT_PASSWORD` | sim (p/ login) | senha do cliente de teste |
| `API_URL` | recomendada | back que o front server-side consome |
| `E2E_SEED_LAT` / `E2E_SEED_LNG` | opcional | região semeada no cookie de localização (default: São Paulo) |
| `E2E_SEED_CITY` | opcional | cidade do cookie de localização |
| `E2E_WEBSERVER_CMD` | opcional | comando do webServer (CI usa `next start`) |

> ⚠️ Nunca use a conta **DeCasa** como cliente de teste.

## Rodando local

```bash
# 1) apontar pro back de teste e informar o cliente de teste
export API_URL="https://like-delivery-backend.onrender.com"
export E2E_CLIENT_EMAIL="<cliente-de-teste>"
export E2E_CLIENT_PASSWORD="<senha>"   # nunca comitar

# 2) rodar (sobe o Next em dev automaticamente na porta 3100)
pnpm test:e2e

# interface interativa
pnpm test:e2e:ui
```

Sem `E2E_CLIENT_EMAIL`/`E2E_CLIENT_PASSWORD`, só os smokes (`home`,
`protected-routes`) rodam; o resto pula com a razão anotada no relatório.

## Passos que dependem de dado semeado

A jornada depende de haver restaurante/produto semeado na região da
localização. Quando não há, os passos se auto-pulam com anotação em vez de
falhar — assim o gate quebra em regressão de verdade, não por falta de seed.
Para apontar pra região certa, ajuste `E2E_SEED_LAT`/`E2E_SEED_LNG`.
