# CLAUDE.md

Convenções deste repositório. Siga sem precisar de lembrete.

---

## Escopo de trabalho

- Uma subtask por vez, do começo ao fim. Só comece a próxima quando a
  anterior estiver completa e verificada.
- Quantos commits a subtask precisar, mas todos sobre ela. Não misture
  mudanças de subtasks diferentes no mesmo commit.
- Se encontrar algo fora do escopo, relate e pergunte antes de corrigir
  — não desvie no meio.
- Um PR por subtask. Subtasks da mesma família (que só fazem sentido
  juntas) podem ir no mesmo PR: pergunte antes de juntar.

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

## Git e PRs

- **Branch sempre a partir da `dev`.** Nunca da `prod`.
- **PR sempre com base na `dev`.** A `prod` recebe só por merge da `dev`, pelo fluxo normal de release.
- **Nome da branch:** use o ticket do Jira como prefixo, no formato `LDMF-000/descricao-curta`. Se o ticket não for informado, pergunte antes de criar. Nunca use o prefixo `claude/`.
- **PR mergeado é porta fechada.** Commit novo depois do merge exige branch nova a partir da `dev` atualizada — empurrar na branch antiga deixa o commit órfão.
- Antes de empurrar, verifique se a `dev` avançou. Se avançou, traga por merge (nunca rebase nem force-push em branch compartilhada).
- Se houver PR aberto mexendo nos mesmos arquivos, simule a junção antes do push e avise se der conflito.
- **Antes de começar uma tarefa, confira branches e PRs (abertos e fechados)** procurando trabalho já feito ou em andamento sobre o mesmo assunto — inclusive branch sem PR. Se encontrar, avise e pergunte antes de seguir, para evitar retrabalho.
- **Descrição do PR:** separe o que foi testado pelo Claude Code do que foi testado pela pessoa.

## Mensagem de commit

Conventional Commits, em português:

  tipo(escopo): descrição no imperativo

Tipos: feat, fix, refactor, chore, test, docs
Escopo: a área tocada — cart, entregador, cozinha, checkout, types

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
relate e siga.

Ao reportar warnings, distinga os que vieram da sua mudança dos pré-existentes — confirme com `git stash` se necessário.

## Backend

- **Não invente contrato.** Se a doc não cobre, diga que não cobre e pergunte. Não deduza formato de resposta, nome de campo ou comportamento de rota.
- O backend é repositório separado. Mesmo que o repositório do back apareça na conta, **nunca o anexe a uma sessão**, nem para leitura, sem pedido explícito.
- Quando uma regra pedir para conferir DTO ou service do back, pergunte qual é o comportamento. Não suponha. A pessoa confere e responde.
- Quando a doc do backend divergir do comportamento observado, **relate a divergência** em vez de escolher um dos dois em silêncio.
- Comportamento errado do back: relate o que foi observado e o impacto. Não proponha como corrigir no back.
- Envelope paginado: `apiRequest` não desembrulha `{data, meta}`. Use `toPaginated`, que tolera array cru e envelope.

### Campos numéricos e vazios

- **Campo que o usuário apagou é vazio (`null` ou `undefined`), nunca 0.** Em vários campos, 0 é valor válido com significado próprio — raio de entrega 0 = loja sem entrega.
- Cuidado com conversões que transformam vazio em 0 sem avisar: `Number("")`, `+valor`, `parseFloat(valor) || 0`, `valor ?? 0`. Diferencie "digitou 0" de "apagou o campo".
- Antes de mandar vazio para o back, saiba o que acontece: se o vazio apaga o valor, volta ao padrão ou é ignorado (mantém o antigo). Se não estiver na doc do back, pergunte.
- Antes de mandar número quebrado, saiba se o campo aceita decimal ou só inteiro. Se não estiver na doc do back, pergunte.

## Investigação

- Quando o pedido for investigar, **investigue e pare**. Não altere nada até a confirmação.
- Meça em vez de deduzir quando for possível. Leitura de código já levou ao diagnóstico errado neste projeto mais de uma vez.
- Ao propor correção, diga o que foi descartado e o que não foi verificado.
- Nunca "corrija" comportamento que possa ser intencional sem perguntar.

## Imagens

As imagens do projeto vêm de R2 e S3. O `next/image` exige o host declarado em `images.remotePatterns` no `next.config`, e host não declarado **derruba a página em runtime** — tela branca, não imagem quebrada.

- Em código novo ou alterado, o padrão é `<Image>` do Next, desde que o host esteja declarado em `images.remotePatterns`.
- Host novo: declare no mesmo PR e teste a tela no preview da Vercel.
- ⚠️ Continuam como `<img>` de propósito, até decisão em card próprio: foto do cliente, logo do restaurante, imagem do prato e miniaturas da tela do entregador. Não converta.

## Componentes

- `<Link>` para navegação interna. `<a>` continua correto para link externo, `tel:` e `mailto:`.
- Server Components são o default, mas este app é fortemente client-side: Zustand, TanStack Query e socket.io. Quando o componente precisa de hook, estado ou socket, `"use client"` é o correto — não é exceção a evitar.
- Não adicione `"use client"` em componente que não precisa.

## Segurança

- Nunca coloque token, chave ou credencial no código. Use `process.env`.
- `NEXT_PUBLIC_` expõe a variável no navegador. Nunca use para segredo de backend.
- Contas de teste: nunca use a DeCasa. Senha só em variável de ambiente — nunca em arquivo, commit, card, comentário ou relatório.
- Evite `dangerouslySetInnerHTML`. Se for inevitável com HTML vindo da API, avise e sanitize.

## Armadilhas conhecidas

- **Mock com identidade nova a cada chamada causa laço infinito de render** nos testes deste projeto. Estabilize as referências dos mocks de hook.
- **Campo que a tela promete e não chega ao backend** já apareceu quatro vezes aqui (`specialInstructions`, `changeAmount`, endereço padrão, `fulfillmentType`). Ao mexer em formulário, confirme que o campo sai na requisição.
- Tipo que declara campo obrigatório que o backend não devolve compila limpo e quebra em produção. Prefira opcional ao que é opcional de fato.

## Idioma

Responda em português. Comentários de código em português, sem acento em identificador.
