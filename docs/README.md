# Documentação do front

Esta pasta é para quem vai mexer no front do Bear Delivery, e principalmente
para quem chegou agora. Ela explica **como o código funciona**, **por que
algumas coisas são do jeito que são** e **o que pode ou não mudar**.

Regras de trabalho (branch, commit, PR, Jira) não estão aqui: estão no
[`CLAUDE.md`](../CLAUDE.md), na raiz. As duas coisas se completam: o
`CLAUDE.md` diz *como trabalhar*, e estas docs dizem *como o código é*.

## Ordem de leitura

Quem começou em React há pouco tempo pode ler nesta ordem:

| # | Arquivo | O que tem |
| --- | --- | --- |
| 1 | [primeiros-passos.md](./primeiros-passos.md) | Rodar o projeto, variáveis de ambiente, ambientes (produção, teste) e deploy |
| 2 | [next-para-quem-vem-do-react.md](./next-para-quem-vem-do-react.md) | O que muda do React puro para o Next deste projeto |
| 3 | [mapa-do-repositorio.md](./mapa-do-repositorio.md) | Pastas, telas, quem pode abrir cada tela e onde fica cada coisa |
| 4 | [dados-e-backend.md](./dados-e-backend.md) | Como um dado sai do back e chega na tela (proxy, `apiService`, TanStack Query, Zustand, socket) |
| 5 | [decisoes.md](./decisoes.md) | Por que algumas coisas são assim, e se devem continuar |
| 6 | [testes-e-qualidade.md](./testes-e-qualidade.md) | Lint, build, testes, E2E, mock de notificações e armadilhas |
| 7 | [levantamento-do-codigo.md](./levantamento-do-codigo.md) | Estado do código em 09/11/2026: o que está bom, o que precisa de atenção |
| 8 | [estado-da-passagem.md](./estado-da-passagem.md) | Retrato do trabalho em aberto na passagem (cards, branches, divergências) |

Os arquivos 7 e 8 são uma foto de novembro de 2026. Os outros descrevem o
código e devem ser atualizados junto com ele.

## Como manter estas docs

- Mudou o comportamento que um arquivo daqui descreve? Atualize o arquivo
  no mesmo PR.
- Decidiu algo que alguém pode querer desfazer sem saber o motivo? Registre
  em [decisoes.md](./decisoes.md), com o card do Jira.
- Escreva o que foi **medido** separado do que foi **lido no código**. Este
  projeto já errou diagnóstico por confiar só na leitura.
- A documentação do back fica no repositório do back (`docs/`). Aqui só
  entra o que o front precisa saber, sempre com a fonte.
