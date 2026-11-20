# Testes E2E (Playwright)

Cobrem os fluxos de Cliente, Restaurante, Cozinha (KDS), Entregador, Financeiro e Segurança de Rotas mapeados em `public/guia-de-testes.html`. Rodam contra o back de **teste** da dev (`like-delivery-backend.onrender.com`), nunca contra a prod.

> 💡 **Wake-up automático do Backend (Render):** O `globalSetup` ([e2e/helpers/global-setup.ts](./helpers/global-setup.ts)) acorda automaticamente o backend no Render antes de iniciar os testes (aguardando o *cold start* de ~40-60s caso esteja hibernando) e pré-aquece o cache de login para evitar bloqueio de *rate-limit* (`HTTP 429`).

## Como rodar

```bash
# Rodar toda a suíte (sobe o Next em dev automaticamente na porta 3000)
pnpm test:e2e

# Interface interativa do Playwright (Modo UI)
pnpm test:e2e:ui

# Abrir o navegador na tela em câmera lenta (700ms por ação)
SLOWMO=700 pnpm exec playwright test --headed

# Rodar apenas um arquivo específico em câmera lenta
SLOWMO=700 pnpm exec playwright test e2e/customer-cart.spec.ts --headed
```

> Pode rodar tanto da raiz do projeto quanto de dentro da pasta `e2e/`.

## Variáveis de ambiente (opcionais localmente)

Por padrão, os testes já utilizam as 4 contas de ambiente de teste (`Teste+Client@bear.com`, `Teste+Owner@bear.com`, `Teste+Courier@bear.com`, `Teste+Second@bear.com`), podendo ser sobrescritas via variáveis de ambiente:

| Variável | Default | Para quê |
| --- | --- | --- |
| `E2E_CLIENT_EMAIL` / `E2E_CLIENT_PASSWORD` | `Teste+Client@bear.com` | Cliente de teste |
| `E2E_OWNER_EMAIL` / `E2E_OWNER_PASSWORD` | `Teste+Owner@bear.com` | Proprietário da loja (`Teste Pizzaria`) |
| `E2E_COURIER_EMAIL` / `E2E_COURIER_PASSWORD` | `Teste+Courier@bear.com` | Entregador |
| `E2E_MANAGER_EMAIL` / `E2E_MANAGER_PASSWORD` | `Teste+Second@bear.com` | Gerência / Cozinha |
| `API_URL` | `https://like-delivery-backend.onrender.com` | URL do backend |
| `E2E_SEED_LAT` / `E2E_SEED_LNG` | `-8.2833` / `-35.9761` | Coordenadas semeadas no cookie `userLocation` |
| `E2E_SEED_CITY` | `Caruaru` | Cidade do cookie de localização |
| `SLOWMO` | `0` | Delay em ms entre ações no modo `--headed` |
