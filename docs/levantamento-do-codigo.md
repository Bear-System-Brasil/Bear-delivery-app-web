# Levantamento do código (09/11/2026)

Feito para a passagem do front (LDMF-490 / LDMF-493), em cima da `dev`
`114e9df`. Responde a duas perguntas:

1. O código é legível para quem começou em React há pouco tempo?
2. Ele está otimizado o suficiente?

**Resumo:** sim nos dois, com ressalvas. O código é bem comentado, em
português, com o motivo das decisões e o card do Jira ao lado, e tem 2034
testes. Os pontos fracos são alguns arquivos muito grandes, duplicações
pequenas e documentação antiga na raiz. O desempenho foi trabalhado na
Sprint 5 (LDMF-475 a 479) e não há problema grave conhecido.

Método: leitura do código, `knip` (código sem uso), `tsc`, `next build`
(tamanho por tela) e os números medidos nos cards da Sprint 5. **Nada foi
medido no navegador neste levantamento.**

## 1. Legibilidade

### O que está bom

- **Comentários explicam o porquê**, não o óbvio, e citam o card. Exemplo:
  `src/app/api/proxy/[...path]/route.ts` explica por que o cache é
  `private` e qual bug o `public` causava.
- **Estrutura previsível:** tela em `app/`, lógica em `hooks/`, chamadas em
  `services/`, regras puras em `lib/`. Cada componente na própria pasta, com
  o teste ao lado.
- **Testes como documentação:** 163 arquivos de teste. Para entender uma
  regra (frete, horário, carrinho), o teste costuma ser o melhor exemplo.
- **TypeScript estrito**, quase sem `any` (1 ocorrência fora de teste).
- **Lint limpo** (0 warnings) e uma regra que impede o barrel `@/hooks` de
  voltar.

### O que atrapalha quem chega

| Ponto | Onde | Gravidade |
| --- | --- | --- |
| **Arquivos muito grandes.** 26 arquivos passam de 500 linhas. Os maiores: `use-cart-actions.ts` (1498), `cash-register/page.tsx` (1491), `menu-management/page.tsx` (1239), `company-profile/page.tsx` (1173), `use-checkout-process.ts` (1122) | telas de gestão e hooks centrais | Média. São os arquivos mais mexidos e os mais difíceis de ler |
| **Documentação antiga na raiz.** `README.md`, `CONTRIBUTING.md` e `QUICKSTART.md` estão em inglês e descrevem coisas que não existem mais (ex.: branch `feature/...`, "glass-morphism", Node 18). O `CONTRIBUTING.md` contradiz o `CLAUDE.md` | raiz | Média. Foram apontados para `docs/` neste PR |
| **4 versões de `formatCurrency`** com comportamento diferente para valor inválido | `utils/format-currency.ts`, `utils/formatter.ts`, `constants/order-management.ts`, `components/ui/currency-cents-input.tsx` | Baixa, mas confunde ("qual eu uso?"). Use `@/utils/format-currency` |
| **Nomes parecidos:** `services/restaurant` (uma loja) e `services/restaurants` (listagem); `lib/` e `utils/` com papéis próximos | `services/`, `lib/`, `utils/` | Baixa. Explicado em [mapa-do-repositorio.md](./mapa-do-repositorio.md) |
| **Estilo misturado:** 18 de 283 arquivos usam aspas simples e sem ponto e vírgula; o resto, aspas duplas e com. Não há Prettier | vários | Baixa. Só visual |
| **Exports sem uso:** ~60 funções/constantes exportadas que ninguém importa (lista do `knip`) | vários | Baixa |
| **`useAuthModal.ts`** fora do padrão `use-kebab-case.ts` dos outros hooks | `src/hooks` | Baixa |

### O que foi feito neste PR (LDMF-493)

Só mudanças que **não alteram o funcionamento**. Conferido com lint, build
(tamanhos iguais), testes (iguais à `dev`) e `tsc` (iguais à `dev`).

1. `services/api.ts` tinha 2840 linhas: ~80 tipos misturados com as
   chamadas. Os tipos foram para `services/api-types.ts`, sem mudar o
   conteúdo, e o `api.ts` reexporta tudo. Nenhum import do app mudou. Uma
   interface duplicada (`ReportsParams`) saiu.
2. 15 arquivos que nada no app importava foram apagados: o barrel
   `@/hooks`, 5 hooks antigos (`use-company-profile`, `use-favorites`,
   `use-prefetch`, `use-reports`, `use-restaurant-actions`), 4 componentes
   de `ui/` sem uso, `back-button` e 4 arquivos de `src/types/`. Quem
   procura "o hook do perfil da empresa" agora acha um só.
3. 3 dependências do Radix que só esses arquivos usavam saíram do
   `package.json`.
4. O barrel `@/services`, com um único import de tipo, foi apagado.

### O que ficou de fora, e por quê

| Ideia | Por que não entrou |
| --- | --- |
| Quebrar as telas grandes em componentes menores | É o ganho de legibilidade mais alto, mas mexe em telas de dinheiro (Caixa) e no carrinho. Sem teste de pessoa no preview, o risco de mudar comportamento não compensa. Recomendo um card por tela, começando por `cash-register/page.tsx` |
| Unificar os `formatCurrency` | Muda o que aparece na tela para valor inválido ("R$ NaN" vira "R$ 0,00") |
| Rodar Prettier no repositório inteiro | Diff enorme, conflito com toda branch aberta. Se for fazer, faça num PR só disso, num momento sem branches abertas |
| Trocar `@/utils` e `@/stores` por imports diretos | O `@/utils` configura o dayjs ao ser importado. Trocar sem cuidado muda datas na tela. Precisa de medição, como no LDMF-478 |
| Apagar os ~60 exports sem uso | Ganho pequeno, diff espalhado por muitos arquivos |
| Corrigir as 7 falhas de `delivery-form.test.tsx` | Fora do escopo do card; relatado em [testes-e-qualidade.md](./testes-e-qualidade.md). A correção é uma linha de import |

## 2. Desempenho

### Tamanho por tela (`next build`, First Load JS)

| Tela | First Load | Observação |
| --- | --- | --- |
| Compartilhado por todas | 167 kB | Inclui React, Next e o Sentry (sem Replay desde o LDMF-477) |
| `/financial-management/dashboard` | 387 kB | O maior. Gráficos (recharts) |
| `/restaurant/[id]` | 365 kB | Cardápio do cliente |
| `/order-status` | 364 kB | Mapa (leaflet) |
| `/checkout` | 356 kB | |
| `/` (home) | ~369 kB | Medido no LDMF-478 (era 450 kB com o barrel) |
| `/terms`, `/privacy` | ~171 kB | Quase só o compartilhado |

### O que já foi resolvido (Sprint 5)

| Problema | Ganho medido | Card |
| --- | --- | --- |
| Barrel `@/hooks` em todas as telas | Home −81 kB e −150 a −250 ms de travamento | LDMF-478 |
| `backdrop-blur` | Cardápio rolando no PC: 1823 → 338 ms de GPU a cada 3 s | LDMF-475 |
| Fundo animado | GPU parada: ~670 → ~36 ms a cada 3 s | LDMF-476 |
| Sentry Replay | Home no celular: 1881 → 768 ms de travamento | LDMF-477 |

Sem vazamento de memória na cozinha (8 min aberta, estável; LDMF-479).

### O que ainda pode melhorar (não medido aqui)

| Ponto | Fonte | Sugestão |
| --- | --- | --- |
| O carrinho (`/order/cart/:id`) é buscado 3 a 4 vezes ao abrir cada tela | LDMF-479 | Investigar a origem; provavelmente vários hooks sem chave de cache compartilhada |
| A cozinha abre duas conexões de socket | LDMF-479 | Custo pequeno. Unificar só se aparecer problema |
| Telas de gestão no PC baixaram ~746 KB em vez de ~490 KB | LDMF-479 | Hipótese não verificada: prefetch dos links do menu lateral |
| Dashboard financeiro com 387 kB | `next build` | Carregar os gráficos com `next/dynamic` pode ajudar; medir antes |
| Polling de 10 s da cozinha redesenha tudo quando o socket cai | LDMF-479 | Só no ambiente de teste (CORS do socket); em produção o socket conecta |

**Conclusão:** está otimizado o suficiente para o uso atual. Nada aqui é
urgente. Os itens acima valem card próprio, sempre com medição antes e
depois.
