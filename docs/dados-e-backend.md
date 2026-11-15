# Dados e backend

O back é um NestJS em repositório separado (`like-delivery-backend`). A
documentação dos contratos fica lá, na pasta `docs/`. **Não invente
contrato:** se a doc do back não cobre, pergunte (regra do `CLAUDE.md`).

## O caminho de um dado

```
Tela (page.tsx / componente)
  └─ hook (src/hooks/use-*.ts)          TanStack Query: cache, loading, refetch
       └─ apiService.x()  (src/services/api.ts)
            └─ apiRequest() → fetch("/api/proxy/...")       navegador
                 └─ /api/proxy/[...path]  (route.ts)        servidor do Next
                      └─ NestJS (API_URL)                    back
```

### 1. `apiRequest` nunca lança erro (quase)

Toda chamada devolve um `ApiResponse<T>`:

```ts
const res = await apiService.companies.getById(id);
if (res.success && res.data) {
  // usa res.data
} else {
  // res.message já vem em português, pronta para o toast
  // res.status traz o código HTTP quando houver
}
```

- Erro de rede, 4xx e 5xx viram `{ success: false, message }`, não exceção.
  Por isso `try/catch` em volta de `apiService` quase nunca pega nada.
- A única exceção que sobe é o `AbortError`, para quem cancela de propósito
  (debounce) não confundir com falha.
- 401 numa chamada autenticada dispara o evento `auth:unauthorized`, que
  abre o login. Com `silentUnauthorized`, não abre (usado em GETs que
  visitante também faz).
- Falha é reportada ao Sentry por `reportApiFailure`.

### 2. Autenticação: cookie, não token no navegador

- O login passa pelas rotas do próprio Next (`/api/auth/login`, `register`,
  `session`, `logout`, `reset-password`). O token do back fica no cookie
  `like_session`, `httpOnly`: o JavaScript da página **não consegue ler**.
- O proxy só põe o `Authorization: Bearer` quando a chamada pede, com o
  cabeçalho `X-Auth-Required: 1`. No `apiService`, isso é o parâmetro
  `requiresAuth`.
- **Por que não mandar o token sempre?** O back responde diferente com token
  em algumas rotas públicas. Exemplo: `GET /company` com token tenta usar o
  endereço do usuário em vez da posição da busca, e quebra para quem não tem
  endereço salvo.
- O socket precisa de token, e o navegador não lê o cookie. Por isso existe
  `/api/auth/socket-token`, chamado a **cada** conexão e reconexão
  (`src/lib/socket-auth.ts`). Um token fixo travava a reconexão depois de
  expirar.

### 3. Cache do proxy

- GET **sem** auth sai com `private, max-age=20`: o navegador guarda por 20
  segundos.
- Todo o resto sai com `no-store`.
- Era `public` até o LDMF-348. Com `public`, o CDN da Vercel guardava a
  resposta e a tela mostrava dado velho por até ~2 min depois de salvar.
  **Não volte para `public`.**

### 4. Listas paginadas: use `toPaginated`

Algumas rotas devolvem `{ data, meta }` e outras devolvem um array cru, às
vezes a mesma rota em versões diferentes do back. O `apiRequest` não
desembrulha nada. Passe a resposta por `toPaginated(res.data)`, que aceita
os dois formatos e devolve sempre `{ items, meta }`.

## TanStack Query (dados do servidor)

Configurado em `src/providers/index.tsx`:

| Opção | Valor | Efeito |
| --- | --- | --- |
| `staleTime` | 5 min | O dado é considerado fresco por 5 min |
| `refetchOnWindowFocus` | `false` | Voltar para a aba não busca de novo |
| `refetchOnMount` | `false` | Abrir a tela de novo usa o cache |
| `retry` | até 3, nunca em 4xx | |

Consequência: **dado que muda sozinho precisa pedir atualização**. A cozinha
usa socket + `refetchInterval`; o selo "Aberta/Fechada" busca a cada
minuto (LDMF-374). Quem não fizer isso mostra dado de até 5 min atrás.

Ao sair ou trocar de conta, o cache é limpo (`bindQueryCacheToUser`, em
`src/lib/query-cache-session.ts`), para a conta nova não ver dado da
anterior.

## Zustand (estado global)

| Store | O que guarda | Vai para o `localStorage`? |
| --- | --- | --- |
| `auth-store` | Usuário logado | Sim, **sem** e-mail, telefone e nascimento (LDMF-424). Eles voltam para a memória pela `/api/auth/session` |
| `cart-store` | Carrinho | Só `orderId` e `ownerId`. Os itens vêm do back. O carrinho de verdade é o do back |
| `preferences-store` | Preferências do usuário | Sim |
| `financial-preferences-store` | Método de pagamento padrão do caixa | Sim, **só neste navegador** |
| `notifications-store` | Sino de notificações, por usuário | Sim |
| `favorites-store` | Favoritos, por usuário | Sim |
| `courier-position-store` | Última posição do entregador | Não |
| `ui-store` | Estado de interface | Não |

Regra de bolso: dado do servidor vai no TanStack Query; o Zustand guarda o
que é do navegador (sessão, preferências, ids). Nunca grave dado pessoal no
`localStorage`.

## Tempo real (socket.io)

Os sockets conectam **direto** do navegador ao back
(`NEXT_PUBLIC_API_URL`), sem passar pelo proxy.

| Onde | Namespace / uso | Arquivo |
| --- | --- | --- |
| Notificação de pedido novo (sino, som, toast) | `/orders` | `src/providers/notifications-provider.tsx` |
| Cozinha | `/orders`, com polling de reserva se o socket cair | `src/hooks/use-kitchen-orders.ts` |
| Entregador | rastreio da entrega | `src/hooks/use-delivery-driver.ts` |
| Cliente acompanhando o pedido | rastreio da entrega | `src/components/order-status-tracker` |

Na cozinha abrem duas conexões (a das notificações e a da cozinha). Custo
pequeno, medido no LDMF-479.

## Serviços externos chamados pelo front

| Serviço | Para quê | Arquivo |
| --- | --- | --- |
| BrasilAPI, com ViaCEP de reserva | CEP → endereço, e rua → CEP | `src/lib/cep.ts` |
| IBGE | Estados e cidades | `src/services/ibge.ts` |
| Nominatim (OpenStreetMap) | Endereço → posição no mapa | `src/lib/nominatim.ts` |
| BigDataCloud | Posição do GPS → cidade, no header | `src/components/main-header/index.tsx` |
| R2 e S3 | Fotos (só leitura; o upload passa pelo back) | `next.config.mjs` (`remotePatterns`) |

## Divergências conhecidas com o back

Registre aqui quando o front contorna algo do back, para saber o que
apagar quando o back corrigir.

| Contorno no front | Por quê | Card |
| --- | --- | --- |
| 403 "Usuário sem empresa" vira mensagem leve | O guard do back barra rotas de cliente | LDMF-466 |
| Loja aberta/fechada calculada no front | O `isOpen` guardado no back fica desatualizado | LDMF-469 |
| Lê `speciality` e `specialty` | A doc e o código usam grafias diferentes | LDMF-395 |
| `GET /product/recent` com reserva | A rota ainda não existe | ver `RecentProduct` em `api-types.ts` |
| Pedido do entregador à gerência desligado | A rota ainda não existe | LDMF-284 (`manager-requests.ts`) |
