# Estado da passagem (09/11/2026)

Uma foto do trabalho em aberto quando o front passou para o Marcos e o
Matheus. Fonte: Sprint 5 no Jira (92 cards e comentários), PRs abertos e
fechados e branches do GitHub, lidos em 09/11/2026. **Não atualize este
arquivo:** ele é o registro de um momento. O que mudar vai para o Jira.

## Cards que ainda pedem atenção

| Card | Situação | O que falta |
| --- | --- | --- |
| **LDMF-482** | To Do | **Remover item do carrinho usa a rota antiga** (`.../products/:productId/:quantity`). No back de teste, ela responde 404; o back passou a usar `.../items/:orderItemId/:quantity`. Impacto provável: remover item pelo app não funciona contra o back atual. Não foi conferido no back de produção |
| **LDMF-480** | In Review | Selo Aberta/Fechada na listagem de lojas. Investigação e decisões feitas (loja fechada continua clicável, mantém a ordem, mostra "Abre…"). **Não há branch com implementação** |
| **LDMF-251** | In Progress | Configurações do restaurante. Formas de pagamento feitas. Tempo de preparo e frete dependem do back: **o frete e o tempo mostrados na página da loja são valores fixos de teste no front** (R$ 99,00), iguais para todas as lojas |
| **LDMF-489** | In Review | Duplicar prato. O PR 276 já entrou na `dev` (09/11). Falta o teste de uma pessoa |
| **LDMF-357** | To Do | "Pedir novamente" dobra o carrinho a cada clique |
| LDMF-355, 361, 411, 413 | a refinar | Vitrine de produção sem lojas de teste, entrega de pedido cancelado (back), conteúdo do modal de ajuda e o épico do MVP |

Vários cards foram para Done com o teste de pessoa ainda pendente (por
exceção registrada no card). Os principais: LDMF-471 (comanda numa térmica
real), LDMF-475 (modo escuro e aparelho fraco), LDMF-478 (celular fraco) e
LDMF-456 (2 testes da Cozinha, que dependem do back de teste).

## Super branches da Sprint 5 (o protótipo do "super PR")

| Card | PR | Juntou |
| --- | --- | --- |
| LDMF-483 | 265 | Menu lateral (443) + prévia no Cardápio (454/465) + fim do barrel (478) + PR 266. Substituiu os PRs 254, 260, 263 e 266 |
| LDMF-484 | 267 | Fundo parado (476) + sem Replay (477) + sem desfoque (475). Substituiu 261, 262 e 264 |
| LDMF-485 | 257 | Status da loja pelo horário (469) + teto do carrinho (334) |
| LDMF-486 | 253 | Notificações da cozinha: 460, 461, 459 e 458 |
| LDMF-472 | 268 | Endereço unificado: 260, 262, 282 e 481 |

Todas entraram na `dev` em 08/11. A regra que saiu disso está no
`CLAUDE.md` ("PRs e super PR").

## Branches

**Abertas no GitHub:** nenhum PR aberto em 09/11.

**Com trabalho fora da `dev`:**

| Branch | O que tem | Sugestão |
| --- | --- | --- |
| `LDMF-345/setas-ordenar-toque-celular` | Aumenta o alvo de toque das setas de ordenar categorias no celular. **O PR 233 foi fechado sem merge** | Decidir se o ajuste ainda vale (a tela de Categorias mudou depois, no LDMF-453) |
| `LDMF-442/desativar-categoria` | O mesmo commit da LDMF-345 | Mesma decisão |
| `preview/banners-antigos` | Volta os 4 banners antigos, só para preview | Apagar quando não precisar mais |
| `kauan/teste-integrado` | Branch do `teste.beara.com.br`. Está **atrás** da `dev` (não tem o PR 276) | Trazer a `dev` antes do próximo teste |

**Já mergeadas** (podem ser apagadas, a critério de quem cuida do
repositório): as demais `LDMF-*`, `ccr-*`, `super/menulateral-nav-cardapio`,
`fix/*`, `feat/toggle-senha-confirmacao` e `revert-*`.

## Divergências e problemas fora do código do front

| Assunto | Detalhe | Fonte |
| --- | --- | --- |
| Back de teste: colunas da Cozinha | `/order/company/status/...` respondeu 400 ("ID do recurso é obrigatório") em 04/11 | LDMF-456 |
| Back de teste: socket | Recusa por CORS o socket vindo de `teste.beara.com.br`. A cozinha cai no polling de 10 s. Em produção, o socket conecta | LDMF-479 |
| Back de teste: cadastro | `POST /auth/register` sem CPF responde 400, embora o LDMF-302 diga que o CPF é opcional | LDMF-362 |
| Projeto `likedeliveryapp-kitchen` | A variável de Production diz "API de teste", mas o deploy no ar apontava para o banco real | LDMF-479 |
| Jenkins | Promove para `main`, que não existe (o repositório usa `prod`) | `Jenkinsfile` |
| Testes | 7 falhas em `delivery-form.test.tsx`: falta um import | [testes-e-qualidade.md](./testes-e-qualidade.md) |
| Vercel | Não gera preview sozinha (organização privada no plano Hobby) | LDMF-472 |
