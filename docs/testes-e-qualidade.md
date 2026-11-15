# Testes e qualidade

## As três checagens antes de commitar

```bash
pnpm lint     # next lint
pnpm build    # next build
pnpm test     # vitest run
```

O `CLAUDE.md` exige as três. Falha **sua** bloqueia o commit; falha que já
existe na `dev` não bloqueia, mas precisa ser relatada.

### Estado da `dev` em 09/11/2026 (commit `114e9df`)

| Checagem | Resultado |
| --- | --- |
| `next lint` | Limpo: 0 erros e 0 warnings (o PR 274 zerou os 46 warnings antigos) |
| `next build` | Ok. First Load JS compartilhado: 167 kB |
| `vitest run` | 2027 passando, **7 falhando**, todos em `delivery-form.test.tsx` |
| `tsc --noEmit` | 105 erros, **todos em arquivos de teste** (o build não confere testes) |

**As 7 falhas:** `ReferenceError: useAddressEditor is not defined`. O teste
usa `useAddressEditor` sem importar. O import se perdeu na junção dos PRs
265 (fim do barrel) e 268 (endereço), justamente o conflito de uma linha
que o card LDMF-472 avisava. O app não é afetado; só o teste.

Ao relatar warnings ou falhas, separe os que vieram da sua mudança dos que
já existiam. Em dúvida, rode na `dev` (ou use `git stash`) e compare.

## Testes unitários (Vitest + Testing Library)

- O teste fica ao lado do arquivo: `foo.ts` → `foo.test.ts`.
- Ambiente `jsdom` (`vitest.config.mts`, `vitest.setup.ts`).
- O jsdom **não calcula layout**. Teste de "cabe na tela" ou "não quebra
  linha" não prova nada aqui; meça no navegador (Playwright) e registre.
- Teste que depende de horário: rode também com
  `TZ=America/Sao_Paulo pnpm test`. Os testes de horário de loja foram
  validados nos dois fusos (LDMF-469).
- Um teste de carrinho (corrida entre rajadas e sync, LDMF-247) já falhou
  uma vez sob carga e passou nas rodadas seguintes. Se falhar sozinho, rode
  de novo antes de investigar.

### Armadilhas conhecidas nos testes

- **Mock com identidade nova a cada chamada causa laço infinito de
  render.** Guarde o objeto devolvido pelo mock numa referência estável
  (`vi.hoisted`). Exemplo: `src/components/profile/profile-wrapper/index.test.tsx`.
- `vi.mock` precisa ter **o mesmo caminho do import** do código testado.
  Quando o LDMF-478 trocou `@/hooks` por `@/hooks/use-...`, 13 arquivos de
  teste tiveram que mudar o mock.
- Teste novo de correção deve **falhar no código antigo**. É assim que se
  prova que ele pega o problema; os cards da Sprint 5 registram isso.

## E2E (Playwright)

- `pnpm test:e2e`. Detalhes em [`e2e/README.md`](../e2e/README.md).
- A jornada do cliente vai até o checkout e **para antes de finalizar**,
  para não criar pedido no back de teste (LDMF-470).
- As credenciais vêm de variável de ambiente (no Jenkins, da credencial
  `e2e-test-client`). Nunca use a conta DeCasa.

## Jenkins

O `Jenkinsfile` roda: checkout → install → lint → build → vitest → E2E →
aprovação manual → promove.

> ⚠️ **Divergência:** a última etapa promove para a branch `main`, mas o
> repositório usa `prod` (não existe `main`). Não foi verificado se o
> Jenkins está ativo. Antes de ligar o pipeline, confirme com a equipe qual
> branch ele deve promover.

## Back de teste das notificações

Para testar som, toast, sino e lembrete de pedido novo sem criar pedido
real: [`scripts/mock-notificacoes`](../scripts/mock-notificacoes/README.md)
(LDMF-457).

## Medir em vez de deduzir

Leitura de código já levou a diagnóstico errado neste projeto (LDMF-477 e
LDMF-478 têm exemplos). Para desempenho, o método dos cards LDMF-475 a
LDMF-479 é:

- build de produção local (`pnpm build && pnpm start`);
- Chrome/Playwright com CPU limitada (4x ou 6x) e, se fizer sentido, rede
  3G;
- várias rodadas, usando a mediana;
- antes × depois, na mesma máquina.

A medição sem GPU real serve para comparar, não como valor absoluto.

## O que conta como "testado"

- **Testado pelo Claude Code:** lint, build, testes e o que foi medido no
  navegador automatizado.
- **Testado por pessoa:** alguém abriu o preview (ou o
  `teste.beara.com.br`) e usou a tela.

A descrição do PR separa os dois. "Pronto e testado" exige o segundo.
