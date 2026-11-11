# Primeiros passos

## Rodar na sua máquina

Precisa de Node 20 ou mais novo e do `pnpm`.

```bash
pnpm install
cp .env.example .env.local   # depois ajuste a URL do back (veja abaixo)
pnpm dev                     # http://localhost:3000
```

| Comando | Para quê |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm lint` | `next lint` (ESLint) |
| `pnpm build` | Build de produção. Também mostra o tamanho de cada tela |
| `pnpm test` | Testes unitários (`vitest run`) |
| `pnpm test:watch` | Testes em modo observação |
| `pnpm test:e2e` | Testes de ponta a ponta (Playwright). Veja [testes-e-qualidade.md](./testes-e-qualidade.md) |
| `pnpm mock:notificacoes` + `pnpm mock:front` | Back de teste das notificações da cozinha ([scripts/mock-notificacoes](../scripts/mock-notificacoes/README.md)) |

Antes de todo commit, rode `next lint`, `next build` e `vitest run`
(regra do [`CLAUDE.md`](../CLAUDE.md)).

## Variáveis de ambiente

| Variável | Onde é usada | Observação |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Navegador (sockets) e servidor (proxy) | URL do back NestJS |
| `API_URL` | Só servidor (proxy e rotas `/api/auth/*`) | Se existir, vence a de cima no servidor |
| `NEXT_PUBLIC_SENTRY_DSN` | Navegador | Sem ele o Sentry fica desligado |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Só no build | Sobem os source maps. O token é segredo |
| `CSP_ENFORCE`, `CSP_REPORT_URI` | `next.config.mjs` | A CSP roda em modo "só relata" por padrão (LDMF-426) |
| `NEXT_PUBLIC_KITCHEN_MOCK` | Cozinha | Enche a cozinha com pedidos falsos, para medir desempenho |
| `NEXT_PUBLIC_DELIVERY_TRACKING_DEBUG` | Rastreio da entrega | Liga os logs do socket de rastreio |

> ⚠️ **Sem nenhuma URL configurada, o front fala com `https://bearsystem.tech`**
> (`src/lib/api-config.ts`), que é o back com o **banco real**. Para
> desenvolver, aponte para o back de teste.

Regras de segurança (do `CLAUDE.md`): nunca coloque token ou senha no
código; `NEXT_PUBLIC_` vai para o navegador, então nunca use esse prefixo em
segredo; senha de conta de teste só em variável de ambiente; nunca use a
conta DeCasa para teste.

## Ambientes

Registrado nos cards LDMF-477, LDMF-479 e LDMF-481 (novembro de 2026).
Confira na Vercel antes de confiar, porque isso muda.

| Site | Projeto na Vercel | Back | Para quê |
| --- | --- | --- | --- |
| `beardelivery.vercel.app` | `beardelivery`, na conta `matheus-projects` da Vercel (não no time "Bear System") | banco real | Produção. Pelo fluxo, recebe a branch `prod` (não conferido na Vercel) |
| `teste.beara.com.br` | `likedeliveryapp` | back de teste (`like-delivery-backend.onrender.com`) | Teste integrado. Recebe a branch `kauan/teste-integrado` |
| `likedeliveryapp-kitchen.vercel.app` | `likedeliveryapp-kitchen` | `bearsystem.tech` | Projeto descrito como "de teste", mas, na última medição, apontava para o banco real. Ver [estado-da-passagem.md](./estado-da-passagem.md) |

### Deploy e preview

- **O preview automático já falhou e já funcionou.** Em 07/11/2026 a Vercel
  não gerava preview dos PRs ("private GitHub organization repository on the
  Hobby plan", LDMF-472) e os deploys eram disparados à mão. Em 09/11/2026 o
  PR 278 ganhou preview sozinho nos três projetos. Confira no comentário do
  bot da Vercel no PR: se ele não aparecer, dispare o deploy à mão.
- O deploy do `teste.beara.com.br` é manual (LDMF-481).
- Já aconteceu de alguém testar um deploy antigo achando que era o novo
  (LDMF-481). Antes de testar, confira **qual commit** está publicado.
- "Pronto e testado" no `CLAUDE.md` significa testado por uma pessoa no
  preview. Sem preview, o teste vai para o `teste.beara.com.br`.

### Fluxo das branches

```
LDMF-000/descricao  ──PR──▶  dev  ──PR (release)──▶  prod
```

- Toda branch nasce da `dev` e todo PR vai para a `dev`.
- A `prod` só recebe merge da `dev` (os PRs 270 a 275 são exemplos).
- A `kauan/teste-integrado` junta branches ainda sem merge para testar no
  `teste.beara.com.br`. Não abra PR a partir dela.
