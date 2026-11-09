# Next para quem vem do React

Quem sabe React já sabe quase tudo deste projeto. O que o Next acrescenta
é pouco, mas confunde no começo. Esta página mostra só o que é usado aqui
(Next 15, App Router).

## 1. A pasta vira a rota

No React puro você declara as rotas (React Router). No Next, **a pasta é a
rota**:

| Arquivo | URL |
| --- | --- |
| `src/app/(home)/page.tsx` | `/` (parênteses não entram na URL; só agrupam) |
| `src/app/cart/page.tsx` | `/cart` |
| `src/app/restaurant/[id]/page.tsx` | `/restaurant/123` (`[id]` é parâmetro) |
| `src/app/financial-management/cash-register/page.tsx` | `/financial-management/cash-register` |

Arquivos com nome especial dentro de `src/app`:

| Arquivo | Para quê |
| --- | --- |
| `page.tsx` | A tela da rota |
| `layout.tsx` | Moldura que envolve as telas da pasta. O `src/app/layout.tsx` envolve **todas** |
| `global-error.tsx` | Tela de erro quando algo quebra no layout raiz |
| `route.ts` | Não é tela: é um endpoint HTTP (ver `src/app/api`) |

Para navegar entre telas use `<Link href="/cart">` (de `next/link`) ou
`useRouter()` (de `next/navigation`, não do `next/router`).

## 2. `"use client"`: onde o código roda

No Next, o componente roda **no servidor** por padrão. Para usar hook
(`useState`, `useEffect`, TanStack Query), Zustand, `window` ou socket, o
arquivo precisa começar com `"use client"`.

Este app é quase todo client-side, então você vai ver `"use client"` na
maioria das telas e componentes. **Isso é o correto aqui, não é um erro.**
A regra do `CLAUDE.md` é só não colocar `"use client"` em componente que
não precisa.

## 3. O servidor do Next também é um "back"

Dentro de `src/app/api` ficam rotas que rodam no servidor do Next (não no
navegador). O projeto usa isso para três coisas:

- **Proxy** (`/api/proxy/...`): todo pedido ao back passa por aqui. Ver
  [dados-e-backend.md](./dados-e-backend.md).
- **Login e sessão** (`/api/auth/*`): guardam o token num cookie que o
  JavaScript do navegador não consegue ler (`httpOnly`). É mais seguro que
  `localStorage`.
- **Download de foto de prato** (`/api/product-image/download`): o R2 e o
  S3 não liberam CORS, então o servidor baixa a foto (LDMF-489).

## 4. Middleware: quem pode abrir cada tela

`src/middleware.ts` roda antes de abrir a tela. Ele lê o cookie de sessão,
olha o papel (`role`) do usuário e redireciona:

- sem login → home com o modal de login aberto (`/?openAuth=true`);
- papel sem permissão → `/unauthorized`.

Rota protegida nova precisa entrar **na lista `PROTECTED` e no `matcher`**
do mesmo arquivo. O middleware só lê o token; quem garante a permissão de
verdade é o back.

## 5. Imagens: `next/image` x `<img>`

O `<Image>` do Next otimiza a imagem, mas **exige o host declarado** em
`images.remotePatterns` no `next.config.mjs`. Host não declarado derruba a
tela inteira (tela branca). Algumas imagens continuam `<img>` de propósito.
As regras estão no `CLAUDE.md`, seção "Imagens".

## 6. Variáveis de ambiente

`process.env.ALGUMA_COISA` só existe no servidor. Para chegar ao navegador,
o nome precisa começar com `NEXT_PUBLIC_`, e aí **qualquer pessoa vê o
valor**. Segredo nunca leva esse prefixo.

## 7. Onde está o resto

Estado, cache e chamadas ao back são React "normal" com bibliotecas:
TanStack Query (dados do servidor), Zustand (estado global) e socket.io
(tempo real). Tudo isso está em [dados-e-backend.md](./dados-e-backend.md).
