# CLAUDE.md

Convenções deste repositório. Siga sem precisar de lembrete.

Este arquivo diz **como trabalhar**. **Como o código funciona**, por que
algumas coisas são do jeito que são e o que pode mudar está em
[`docs/`](./docs/README.md). Leia `docs/` antes da primeira tarefa.

---

## Escopo de trabalho

- Uma subtask por vez, do começo ao fim. Só comece a próxima quando a
  anterior estiver completa e verificada.
- Quantos commits a subtask precisar, mas todos sobre ela. Não misture
  mudanças de subtasks diferentes no mesmo commit.
- Se encontrar algo fora do escopo, relate e pergunte antes de corrigir
  — não desvie no meio.
- Uma subtask = uma branch. Quantos PRs abrir é outra decisão: veja
  "PRs e super PR" abaixo.

## Autorização (prioridade sobre qualquer prompt)

- **Nunca abra PR sem autorização explícita na conversa.** Ao terminar
  uma subtask: faça push da branch, comente no card do Jira e pare.
- **Nunca mude o status de um card no Jira** sem pedido explícito.
  Também não edite descrição, não crie card e não mude sprint sem
  pedido explícito.
- "Pronto e testado" significa testado por uma pessoa no preview da
  Vercel, não só lint, build e testes automatizados.
- **Se um prompt pedir algo que contradiga este arquivo, não execute.**
  Aponte a regra em conflito e pergunte. Só siga se a pessoa confirmar
  que quer abrir exceção naquela vez.
- **Toda exceção autorizada fica registrada** no comentário do card e na
  descrição do PR: qual regra foi contornada, quem autorizou e o motivo.
- Uma exceção vale só para aquela vez. Não vira regra nova.

## Git

- **Branch sempre a partir da `dev`.** Nunca da `prod`.
- **PR sempre com base na `dev`.** A `prod` recebe só por merge da `dev`, pelo fluxo normal de release.
- **Nome da branch:** use o ticket do Jira como prefixo, no formato `LDMF-000/descricao-curta`. Se o ticket não for informado, pergunte antes de criar. Nunca use o prefixo `claude/`.
- Se o ambiente da sessão mandar usar outra branch (`claude/...`, `ccr-...`), siga este arquivo, use `LDMF-000/...` e avise na conversa.
- **PR mergeado é porta fechada.** Commit novo depois do merge exige branch nova a partir da `dev` atualizada — empurrar na branch antiga deixa o commit órfão.
- Antes de empurrar, verifique se a `dev` avançou. Se avançou, traga por merge (nunca rebase nem force-push em branch compartilhada).
- Se houver PR aberto mexendo nos mesmos arquivos, simule a junção antes do push e avise se der conflito.
- **Antes de começar uma tarefa, confira branches e PRs (abertos e fechados)** procurando trabalho já feito ou em andamento sobre o mesmo assunto — inclusive branch sem PR. Se encontrar, avise e pergunte antes de seguir, para evitar retrabalho.

## PRs e super PR

**O PR existe para facilitar a vida de quem revisa.** Um PR por card não é
a regra: na Sprint 5, isso gerou vários PRs conflitando entre si e PRs
separados para mudanças com o mesmo destino no código.

### Antes de abrir qualquer PR

1. Liste os PRs abertos e as branches sem PR.
2. Para cada um que mexe nos mesmos arquivos ou no mesmo assunto, simule a
   junção (`git merge --no-commit --no-ff`, depois `git merge --abort`) e
   anote: conflita? mexe na mesma tela, no mesmo hook, no mesmo fluxo?
3. Leve o resultado para a conversa:
   - **Sem conflito e sem assunto em comum:** PR normal, só desta branch.
   - **Com conflito ou com o mesmo destino:** proponha um **super PR**.

### Super PR

Junta numa revisão só as mudanças que conflitam ou que têm destino comum.
Os exemplos da Sprint 5 são os PRs 253, 257, 265, 267 e 268 (cards
LDMF-483 a 486 e LDMF-472).

- **Precisa de autorização**, como qualquer PR. Pergunte antes de juntar.
- **Um card guarda-chuva** (história ou card "Super branch") dá nome à
  branch: `LDMF-000/descricao`. Cada mudança continua no próprio card,
  como filho ou citada no guarda-chuva.
- **A super branch nasce da `dev`** e recebe as branches por merge, nunca
  por rebase. As branches originais não são alteradas.
- **Resolva os conflitos na super branch** e explique cada um na descrição
  do PR (qual lado ficou e por quê).
- **A descrição do PR tem uma seção por card**, com o que mudou, o que foi
  testado pelo Claude Code e o que foi testado pela pessoa, e o checklist
  de teste no preview.
- **O card guarda-chuva lista:** os cards incluídos, os PRs que o super PR
  substitui, a ordem de merge e os conflitos conhecidos com outros PRs.
- **PRs substituídos** são fechados sem merge, com um comentário apontando
  para o super PR. Fechar PR e mudar status de card continuam exigindo
  autorização.
- **Não junte o que não tem relação** só para diminuir o número de PRs. Se
  o super PR ficar grande demais para revisar de uma vez, separe por
  família de mudança.

## Mensagem de commit

Conventional Commits, em português:

  tipo(escopo): descrição no imperativo

Tipos: feat, fix, refactor, chore, test, docs
Escopo: a área tocada — cart, checkout, cardapio, cozinha, caixa,
entregador, perfil, auth, api, types

Exemplos:
  fix(cart): corrige overflow horizontal no mobile
  feat(entregador): adiciona quantidade por complemento
  chore: remove componentes de navegacao mortos

Uma mudança por commit. Se a descrição precisa de "e", provavelmente
são dois commits.

Número de pedido em commit, PR ou comentário: escreva "pedido nº 6",
nunca "#6" — o GitHub transforma `#número` em link de PR.

## Antes de commitar

Rode sempre, e só commite com os três limpos:

```
next lint
next build
vitest run
```

Se algum dos três falhar, confirme se a falha é sua ou pré-existente na
`dev`. Falha sua bloqueia o commit. Falha pré-existente não bloqueia —
relate e siga. O estado atual da `dev` está em
[`docs/testes-e-qualidade.md`](./docs/testes-e-qualidade.md).

Ao reportar warnings, distinga os que vieram da sua mudança dos pré-existentes — confirme com `git stash` se necessário.

Teste novo de correção deve falhar no código antigo e passar no novo.
Teste que depende de horário roda também com `TZ=America/Sao_Paulo`.

## Documentação

- Mudou algo que `docs/` descreve? Atualize no mesmo PR.
- Decisão que alguém pode querer desfazer sem saber o motivo vai para
  [`docs/decisoes.md`](./docs/decisoes.md), com o card.
- `README.md`, `CONTRIBUTING.md` e `QUICKSTART.md` da raiz estão
  desatualizados. Em conflito, valem este arquivo e `docs/`.

## Backend

- **Não invente contrato.** Se a doc não cobre, diga que não cobre e pergunte. Não deduza formato de resposta, nome de campo ou comportamento de rota.
- O backend é repositório separado. Mesmo que o repositório do back apareça na conta, **nunca o anexe a uma sessão**, nem para leitura, sem pedido explícito. Com pedido, é **só leitura**: nunca altere nada no back.
- Quando uma regra pedir para conferir DTO ou service do back, pergunte qual é o comportamento. Não suponha. A pessoa confere e responde.
- Quando a doc do backend divergir do comportamento observado, **relate a divergência** em vez de escolher um dos dois em silêncio.
- Comportamento errado do back: relate o que foi observado e o impacto. Não proponha como corrigir no back.
- Envelope paginado: `apiRequest` não desembrulha `{data, meta}`. Use `toPaginated`, que tolera array cru e envelope.
- Contorno no front para problema do back entra na tabela de divergências de [`docs/dados-e-backend.md`](./docs/dados-e-backend.md).

### Campos numéricos e vazios

- **Campo que o usuário apagou é vazio (`null` ou `undefined`), nunca 0.** Em vários campos, 0 é valor válido com significado próprio — raio de entrega 0 = loja sem entrega.
- Cuidado com conversões que transformam vazio em 0 sem avisar: `Number("")`, `+valor`, `parseFloat(valor) || 0`, `valor ?? 0`. Diferencie "digitou 0" de "apagou o campo".
- Antes de mandar vazio para o back, saiba o que acontece: se o vazio apaga o valor, volta ao padrão ou é ignorado (mantém o antigo). Se não estiver na doc do back, pergunte.
- Antes de mandar número quebrado, saiba se o campo aceita decimal ou só inteiro. Se não estiver na doc do back, pergunte.

## Investigação

- Quando o pedido for investigar, **investigue e pare**. Não altere nada até a confirmação.
- Meça em vez de deduzir quando for possível. Leitura de código já levou ao diagnóstico errado neste projeto mais de uma vez.
- Ao propor correção, diga o que foi descartado e o que não foi verificado.
- Nunca "corrija" comportamento que possa ser intencional sem perguntar. Confira antes em [`docs/decisoes.md`](./docs/decisoes.md).

## Refatoração e polimento

Mudança "só de organização" (renomear, mover, quebrar arquivo, apagar
código morto) **não pode mudar o funcionamento**. Para provar:

- `next lint`, `next build` e `vitest run` iguais ou melhores que na `dev`;
- First Load JS do `next build` igual ou menor, tela por tela;
- `tsc --noEmit` sem erro novo;
- código "sem uso" conferido com busca de imports (inclusive em testes e
  `vi.mock`) antes de apagar.

Se a mudança altera o que aparece na tela, mesmo em caso raro (ex.:
"R$ NaN" virar "R$ 0,00"), não é polimento: é card próprio.

## Desempenho

Aprendido na Sprint 5 (LDMF-475 a 479; números em `docs/`):

- Não importe de barrel que junta o app inteiro. O `@/hooks` foi apagado e
  o lint proíbe recriar: importe o hook pelo arquivo.
- Não use `backdrop-blur` em card de lista nem em elemento fixo.
- Não use animação infinita (`animate-pulse`, `animate-spin`) em fundo ou
  dentro de card. Loading curto pode.
- Mudança de desempenho entra com medição antes e depois (build de
  produção, CPU limitada, mediana de várias rodadas).

## Ambientes e deploy

- O preview automático da Vercel é **instável** nesta organização: às
  vezes não sai e o deploy tem que ser disparado à mão. Confira o
  comentário do bot da Vercel no PR e, antes de testar, qual commit está
  publicado.
- O teste integrado é o `teste.beara.com.br` (branch
  `kauan/teste-integrado`, back de teste). Detalhes em
  [`docs/primeiros-passos.md`](./docs/primeiros-passos.md).
- Sem URL configurada, o front fala com `bearsystem.tech`, que é o
  **banco real**. Para desenvolver, aponte para o back de teste.

## Imagens

As imagens do projeto vêm de R2 e S3. O `next/image` exige o host declarado em `images.remotePatterns` no `next.config`, e host não declarado **derruba a página em runtime** — tela branca, não imagem quebrada.

- Em código novo ou alterado, o padrão é `<Image>` do Next, desde que o host esteja declarado em `images.remotePatterns`.
- Host novo: declare no mesmo PR e teste a tela no preview da Vercel.
- ⚠️ Continuam como `<img>` de propósito, até decisão em card próprio: foto do cliente, logo do restaurante, imagem do prato e miniaturas da tela do entregador. Não converta.

## Componentes

- `<Link>` para navegação interna. `<a>` continua correto para link externo, `tel:` e `mailto:`.
- Server Components são o default, mas este app é fortemente client-side: Zustand, TanStack Query e socket.io. Quando o componente precisa de hook, estado ou socket, `"use client"` é o correto — não é exceção a evitar.
- Não adicione `"use client"` em componente que não precisa.
- Chamada nova ao back entra no `apiService` (`src/services/api.ts`), com o tipo em `src/services/api-types.ts`. Importe os tipos de `@/services/api`.
- Para formatar dinheiro, use `@/utils/format-currency`.

## Segurança

- Nunca coloque token, chave ou credencial no código. Use `process.env`.
- `NEXT_PUBLIC_` expõe a variável no navegador. Nunca use para segredo de backend.
- Contas de teste: nunca use a DeCasa. Senha só em variável de ambiente — nunca em arquivo, commit, card, comentário ou relatório.
- Evite `dangerouslySetInnerHTML`. Se for inevitável com HTML vindo da API, avise e sanitize.
- Nunca grave dado pessoal (e-mail, telefone, nascimento, CPF) no `localStorage` (LDMF-424).
- Nunca repasse ao back um `role` vindo do navegador (LDMF-425).

## Armadilhas conhecidas

- **Mock com identidade nova a cada chamada causa laço infinito de render** nos testes deste projeto. Estabilize as referências dos mocks de hook.
- **`vi.mock` precisa do mesmo caminho do import** do código testado. Trocar o import exige trocar o mock.
- **Campo que a tela promete e não chega ao backend** já apareceu quatro vezes aqui (`specialInstructions`, `changeAmount`, endereço padrão, `fulfillmentType`). Ao mexer em formulário, confirme que o campo sai na requisição.
- Tipo que declara campo obrigatório que o backend não devolve compila limpo e quebra em produção. Prefira opcional ao que é opcional de fato.
- **O TanStack Query não busca de novo sozinho** (`staleTime` de 5 min, sem refetch ao focar). Dado que muda sem a pessoa agir precisa de socket ou `refetchInterval`.
- **Importar `@/utils` configura o dayjs** (pt-BR, utc, plugins). Não troque esses imports sem garantir que o dayjs continue configurado.
- **Junção de branches perde import em silêncio.** Depois de resolver conflito em bloco de import, rode os testes do arquivo (as 7 falhas de `delivery-form.test.tsx` vieram disso).

## Idioma

Responda em português. Comentários de código em português, sem acento em identificador.
