# Mapa do repositório

## Pastas

```
src/
├── app/            Telas (uma pasta por rota) e rotas HTTP do servidor (app/api)
├── components/     Componentes. Cada um numa pasta com index.tsx (+ teste ao lado)
│   └── ui/         Peças genéricas (botão, card, dialog, select...), estilo shadcn/Radix
├── hooks/          Lógica das telas: busca de dados, formulários, regras
├── services/       Chamadas ao back e a serviços externos
│   ├── api.ts         apiService: quase todas as rotas do back
│   ├── api-types.ts   Tipos do contrato (Product, Order, Company...)
│   ├── kitchen.ts     Dados da cozinha (real ou mock)
│   ├── restaurant/    Uma loja (GET /company/:id no formato da tela pública)
│   ├── restaurants/   Listagem de lojas e filtro por endereço
│   ├── products/      Novidades, upload e duplicação de prato
│   └── ibge.ts, neighborhoods.ts, financial-dashboard.ts, manager-requests.ts
├── stores/         Estado global com Zustand (sessão, carrinho, preferências)
├── lib/            Funções puras e regras sem tela (frete, horário, endereço, som...)
├── utils/          Formatação, papéis de usuário, armazenamento local
├── constants/      Valores fixos (horários, colunas da cozinha, categorias...)
├── contexts/       AuthProvider (login/modal) e ConfirmProvider (diálogo de confirmação)
├── providers/      React Query e notificações (socket de pedido novo)
├── types/          Tipos que não são do contrato com o back (restaurante, coordenadas)
├── data/           Dados estáticos (lista local de bairros, reserva da rota do back)
├── mocks/          Pedidos falsos da cozinha (NEXT_PUBLIC_KITCHEN_MOCK)
└── middleware.ts   Quem pode abrir cada tela
e2e/                Testes Playwright
scripts/            Back de teste das notificações e geração dos sons
docs/               Esta documentação
```

### Onde colocar código novo

| Você vai... | Coloque em |
| --- | --- |
| Criar uma tela | `src/app/<rota>/page.tsx` |
| Chamar uma rota nova do back | um método em `apiService` (`src/services/api.ts`) + o tipo em `api-types.ts` |
| Buscar dado para a tela | um hook em `src/hooks/` com TanStack Query |
| Escrever uma regra sem tela (cálculo, validação) | `src/lib/`, com teste ao lado |
| Fazer um componente reaproveitável | `src/components/<nome>/index.tsx` |

**Imports:** use o caminho do arquivo, por exemplo
`import { useCartActions } from "@/hooks/use-cart-actions"`. O barrel
`@/hooks` foi apagado e o lint proíbe recriá-lo (LDMF-478; ver
[decisoes.md](./decisoes.md)).

## Telas

O acesso vem de `src/middleware.ts`. "Visitante" é quem não fez login.

### Cliente

| Rota | Tela | Quem abre |
| --- | --- | --- |
| `/` | Home: lojas, novidades, banners, seletor de endereço | Todos |
| `/restaurant/[id]` | Cardápio da loja | Todos (conta de restaurante vê só leitura, LDMF-473) |
| `/cart` | Carrinho | Cliente e visitante |
| `/checkout` | Finalizar pedido | Cliente e visitante |
| `/orders` | Meus pedidos | Cliente |
| `/order-status` | Acompanhar um pedido (com rastreio do entregador) | Todos (não está no middleware) |
| `/profile` | Meu perfil (staff não vê endereços nem histórico, LDMF-481) | Qualquer pessoa logada |

### Restaurante (gestão)

| Rota | Tela | Papéis |
| --- | --- | --- |
| `/menu-management` | Cardápio (pratos, tamanhos, complementos, duplicar) | owner, admin, manager |
| `/category-management` | Categorias (ordenar, desativar, prévia) | owner, admin, manager |
| `/kitchen` | Cozinha (KDS) e comanda impressa | owner, admin, manager, cook |
| `/team-management` | Equipe | owner, admin, manager |
| `/company-profile` | Perfil da empresa, horários, endereço | owner, admin |
| `/financial-management/dashboard` | Dashboard financeiro | owner, admin, manager, financial |
| `/financial-management/finance` | Pagamentos | owner, admin, manager, financial |
| `/financial-management/cash-register` | Caixa | owner, admin, manager, financial |
| `/financial-management/orders` | Pedidos da empresa | owner, admin, manager, financial |
| `/financial-management/customers` | Clientes | owner, admin, manager, financial |
| `/financial-management/settings` | Configurações do caixa (só neste navegador) | owner, admin, manager, financial |

As telas de gestão usam a casca `AdminPageLayout`
(`src/components/admin-page-layout`) com o menu lateral
`sidebar-menu-management`.

### Entregador

| Rota | Tela | Papéis |
| --- | --- | --- |
| `/delivery-dashboard` | Entregas disponíveis e em andamento | delivery (só ele, LDMF-324) |
| `/delivery-dashboard/historico` | Histórico | delivery |
| `/delivery-dashboard/ajustes` | Ajustes | delivery |

### Outras

`/restaurant-landing-page` (página de venda para restaurantes),
`/restaurant-register` (cadastro de restaurante), `/terms`, `/privacy`,
`/legal` e `/unauthorized`.

> O middleware ainda protege `/reports`, mas essa tela não existe. A regra
> não faz mal; dá para apagar quando alguém confirmar que não vai voltar.

## Papéis (roles)

Vêm do back (enum `UserRole`): `client`, `owner`, `admin`, `manager`,
`financial`, `cook` e `delivery`. Os outros seis são "staff" da empresa.
Os helpers ficam em `src/utils/role-helpers.ts` (por exemplo,
`isCompanyStaffRole`) e os rótulos em português em
`src/utils/permissions.ts` (`ROLE_LABELS`; owner aparece como "Dono").

## Arquivos que valem conhecer primeiro

| Arquivo | Por quê |
| --- | --- |
| `src/app/layout.tsx` | Tudo que envolve todas as telas: tema, providers (React Query, login, notificações), `AppFrame` e fontes |
| `src/services/api.ts` | `apiRequest` e o `apiService` |
| `src/app/api/proxy/[...path]/route.ts` | Por onde passa toda chamada ao back |
| `src/stores/auth-store.ts` e `cart-store.ts` | O que fica salvo no navegador |
| `src/hooks/use-cart-actions.ts` | Carrinho sincronizado com o back (o fluxo mais delicado do app) |
| `src/hooks/use-checkout-process.ts` | Finalização do pedido |
| `src/hooks/use-kitchen-orders.ts` | Cozinha: socket + polling |
| `src/constants/opening-hours.ts` | Loja aberta/fechada calculada pelo horário |
