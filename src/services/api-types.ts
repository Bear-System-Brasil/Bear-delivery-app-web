/**
 * =============================================================================
 * TIPOS DO CONTRATO COM O BACKEND
 * =============================================================================
 *
 * Interfaces, tipos e enums das requisições e respostas do back. Saíram do
 * `api.ts` só para deixar aquele arquivo com as chamadas HTTP; o conteúdo é
 * o mesmo.
 *
 * Não importe daqui: o `api.ts` reexporta tudo, então continue usando
 * `import type { Product } from "@/services/api"`.
 *
 * Campo que o back nem sempre devolve deve ser opcional (`campo?: tipo`).
 * Tipo que promete campo obrigatório que não chega compila limpo e quebra
 * em produção (ver CLAUDE.md, "Armadilhas conhecidas").
 */

import type { ProductCategory } from "@/types/restaurant";

export interface CreateUserRequest {
  name: string;
  email: string;
  cpf?: string;
  phone: string;
  password: string;
  birthDate: string;
  role?: string; // Optional - backend will assign 'client' by default if not provided
  termsVersion?: string;
  privacyVersion?: string;
}

export interface RegisterRequest
  extends Omit<CreateUserRequest, "cpf" | "birthDate"> {
  cpf?: string;
  birthDate?: string;
}

export interface UpdateUserRequest {
  name: string;
  email: string;
  cpf?: string;
  phone: string;
  password?: string; // Optional - only send if changing password
  birthDate: string;
  role: string;
  status: string;
  photoUrl?: string;
}

export interface VerifyOtpRequest {
  email: string;
  code: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  /** Status HTTP da resposta, quando houve resposta do servidor. */
  status?: number;
  /** Código de erro do back (ex.: `UNDERAGE`), quando o corpo traz `code`. */
  code?: string;
}

/**
 * Envelope das listas paginadas (ver pagination.md). `apiRequest` não
 * desembrulha isso - o corpo bruto `{data, meta}` cai inteiro em
 * `ApiResponse.data`, então quem consome precisa ler `.data.data`/`.data.meta`.
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** `getCompanyOrders` / `getCompanyOrdersByStatus` — filtro de intervalo (ISO 8601, inclusivo). */
export interface OrderDateRangeParams extends PaginationParams {
  startDate?: string;
  endDate?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  birthDate: string;
  role: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Recorte do cliente que o backend devolve embutido nas relações de
 * Order e Payment (ver order.md / payment.md). Existe para as telas
 * exibirem o nome - o `customerId` continua sendo a chave usada nas
 * chamadas de API, nunca o rótulo mostrado ao usuário.
 */
export interface CustomerRef {
  id: string;
  name: string;
  phone?: string;
  photoUrl?: string;
}

/** Os dois únicos valores de `status` em /company/customers. */
export type CompanyCustomerStatus = "active" | "inactive";

/**
 * Cliente vinculado à empresa autenticada (GET /company/customers).
 *
 * São exatamente os sete campos que a rota devolve - não é o `User` geral da
 * API. Tipar como `User` fazia a tela enxergar `cpf`, `birthDate`, `role` e
 * `updatedAt`, que essa rota não manda, e prometer um `createdAt` camelCase
 * que também não vem: aqui a data é `created_at`.
 */
export interface CompanyCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  photoUrl: string;
  status: CompanyCustomerStatus;
  created_at: string;
}

/**
 * Parâmetros de GET /company/customers.
 *
 * TODO(backend): `status` ainda NÃO é implementado pela rota - ela aceita o
 * param e devolve a lista inteira do mesmo jeito. O caminho daqui até a tela
 * já está ligado; o seletor é que fica desabilitado, para não parecer que
 * filtra. Ver STATUS_FILTER_DISABLED na tela de clientes.
 */
export interface CompanyCustomersParams extends PaginationParams {
  status?: CompanyCustomerStatus;
}

/**
 * Recorte da empresa que o backend devolve embutido na relação de Order
 * (ver order.md), simétrico ao `CustomerRef` acima.
 */
export interface OrderCompanyRef {
  id: string;
  tradeName: string;
  legalName?: string;
  logo_url?: string;
}

export interface LoginResponse {
  token: string;
  user: User | Company;
  type: "customer" | "company";
}

export interface LoginApiResponse {
  data: LoginResponse;
}

/**
 * Formato cru devolvido por /api/auth/login, /api/auth/register e
 * /api/auth/session (BFF) - mistura campos de cliente (User) e empresa
 * (Company) num único objeto, dependendo do tipo de conta. Os campos
 * específicos de cada tipo são opcionais porque só um dos dois conjuntos
 * vem preenchido; `role`/`companyId` distinguem qual é qual.
 */
export interface RawAuthUser {
  id: string;
  email: string;
  phone?: string;
  role?: string;
  companyId?: string | null;
  name?: string;
  cpf?: string;
  birthDate?: string;
  photoUrl?: string;
  tradeName?: string;
  legalName?: string;
  cnpj?: string;
  logo_url?: string;
  /** Se a conta tem CPF, sem o número (LDMF-302). */
  hasCpf?: boolean;
}

/**
 * Contrato real devolvido por /api/auth/login e /api/auth/register (BFF).
 * Sem token - a sessão vive no cookie httpOnly, o client só recebe o user.
 */
export interface AuthBffResponse {
  data: {
    user: RawAuthUser;
  };
}

export interface ReportsParams {
  month?: string;
  startDate?: string;
  endDate?: string;
}

// ======================
// Reports types
// ======================
export interface ReportsOrdersByStatus {
  status: string;
  totalOrders: number;
}

export interface ReportsRevenueByDay {
  date: string;
  totalRevenue: number;
}

export interface ReportsTopProduct {
  productId: string;
  name: string;
  totalQuantity: number;
}

/**
 * Receita agrupada por status do pedido. A forma lembra a de
 * `ordersByStatus`, mas o número é dinheiro, não contagem: o campo é
 * `totalRevenue`, igual em GET /reports e em
 * GET /reports/payment/revenue-by-status (ver reports.md).
 */
export interface ReportsRevenueByStatus {
  status: string;
  totalRevenue: number;
}

export interface ReportsExpenses {
  ingredientsCost: number;
  productsCost: number;
  shippingCost: number;
  discounts: number;
  totalExpenses: number;
}

/**
 * Capital parado em estoque. É uma foto do momento, não despesa do período:
 * não muda com o filtro de data e não entra em nenhum cálculo de margem.
 */
export interface ReportsStockCosts {
  totalStockCost: number;
}

export interface ReportsSummary {
  totalRevenue: number;
  totalOrders: number;
  totalCustomers: number;
  totalDeliveries: number;
  averageDeliveryTime?: number;
  ordersByStatus?: ReportsOrdersByStatus[];
  revenueByDay?: ReportsRevenueByDay[];
  topProducts?: ReportsTopProduct[];
  revenueByOrderStatus?: ReportsRevenueByStatus[];
  totalExpenses?: ReportsExpenses;
  stockCosts?: ReportsStockCosts;
}

export interface ProductImage {
  id: string;
  url: string;
  productId: string;
  created_at: string;
  updated_at: string;
}

export interface OrderedItem {
  id: string;
  created_at: string;
  deleted_at: string | null;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  updated_at: string;
}

/**
 * GET /product/company/:companyId devolve formas diferentes por papel: o
 * cliente recebe só id, companyId, name, description, salePrice,
 * isAvailable, imageURL e productCategories; usuário da empresa recebe
 * também costPrice, stockQuantity e orderedItems. Os quatro campos
 * opcionais abaixo existem apenas no retorno da empresa - tratá-los como
 * obrigatórios fazia o TypeScript garantir, no fluxo do cliente, campos
 * que não chegam.
 */
export interface Product {
  id: string;
  name: string;
  description: string;
  costPrice?: number;
  salePrice: number;
  isAvailable: boolean;
  companyId: string;
  stockQuantity?: number;
  imageURL?: ProductImage[];
  orderedItems?: OrderedItem[];
  productCategories?: ProductCategory[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Contrato proposto para GET /product/recent (TODO(backend): a rota ainda
 * não existe - hoje responde 404 e a home cai na agregação por loja, ver
 * services/products/new-dishes.ts). Devolve os pratos cadastrados mais
 * recentemente, do mais novo pro mais antigo, já com o resumo da loja -
 * é o que a seção "Novidades" precisa e a listagem por loja não traz
 * (`created_at`, preço promocional, frete e tempo de entrega).
 */
export interface RecentProduct extends Product {
  created_at: string;
  /** Preço promocional vigente; `salePrice` segue sendo o preço cheio. */
  promotionalPrice?: number | null;
  company: {
    id: string;
    tradeName: string;
    logo_url?: string | null;
    deliveryFee?: string | number | null;
    /** Tempo estimado de entrega, ex: "35-45 min". */
    time?: string | null;
    isOpen?: boolean;
  };
}

export interface RecentProductsParams {
  /** Com lat/lng o backend limita ao raio de atuação das lojas. */
  lat?: number;
  lng?: number;
  limit?: number;
}

// Product types
export interface CreateProductRequest {
  name: string;
  description: string;
  costPrice: number;
  salePrice: number;
  isAvailable: boolean;
  stockQuantity: number;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  costPrice?: number;
  salePrice?: number;
  isAvailable?: boolean;
  stockQuantity?: number;
}

// Product add-on types ("Complementos" - ex: Queijo Extra +R$3,50)
export interface ProductAddOn {
  id: string;
  name: string;
  priceModifier: number;
  maxQuantity?: number;
  isAvailable: boolean;
  productId: string;
  created_at: string;
  updated_at: string;
}

export interface SaveProductAddOnRequest {
  name: string;
  priceModifier: number;
  maxQuantity?: number;
  isAvailable?: boolean;
}

// Product variation types ("Tamanhos" - ex: Grande +R$10,00)
export interface ProductVariation {
  id: string;
  name: string;
  priceModifier: number;
  isAvailable: boolean;
  stockQuantity?: number;
  productId: string;
  created_at: string;
  updated_at: string;
}

export interface SaveProductVariationRequest {
  name: string;
  priceModifier: number;
  // Sempre obrigatório e sempre controlado pro backend (diferente de
  // AddOns, onde é opcional e null = ilimitado) - ver
  // variations-and-addons.md.
  stockQuantity: number;
  isAvailable?: boolean;
}

// Category types
export interface CreateCategoryRequest {
  name: string;
  description: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  companyId: string;
  created_at: string;
  updated_at: string;
  // Ordem de exibição vinda do back (LDMF-345). Opcional de propósito:
  // produção só passa a mandar o campo depois do release do back, então o
  // front não pode exigir que ele exista.
  position?: number;
}

// Specialty types (restaurant types)
export interface Specialty {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// Company types
export interface CreateCompanyRequest {
  tradeName: string;
  legalName: string;
  description: string;
  actionRadius?: string;
  cnpj: string;
  email: string;
  phone: string;
  ownerId?: string;
  mainCategoryId?: string;
}

export interface Company {
  id: string;
  tradeName: string;
  legalName: string;
  description?: string;
  cnpj: string;
  email: string;
  phone: string;
  ownerId?: string;
  photoUrl?: string;
  logo_url?: string;
  cover_url?: string;
  status: string;
  /** Se a loja está aceitando pedidos agora (não confundir com `status`). */
  isOpen?: boolean;
  categories?: Category[];
  specialty?: Specialty[];
  /**
   * Formas aceitas pelo restaurante (LDMF-289). Só vem em GET /company/:id,
   * não na listagem. Opcional: ausente, o checkout oferece todas.
   */
  acceptedPaymentMethods?: PaymentMethod[];
  created_at: string;
  updated_at: string;
}

/**
 * Espelha o StaffRoleEnum do backend - são as únicas funções que
 * POST /company/invite aceita. `admin` NÃO entra aqui: é provisionada fora
 * dessa API, e mandá-la no convite volta 400.
 */
export type StaffRole = "manager" | "cook" | "delivery" | "financial";

export interface InviteStaffRequest {
  email: string;
  /**
   * O DTO do backend valida `staffRole`, não `role` (ver company.md) - e o
   * class-validator roda em whitelist, então mandar `role` volta 400 com
   * "property role should not exist". A tela guarda o campo como `role` no
   * formulário; a tradução pro contrato acontece na borda, aqui.
   */
  staffRole: StaffRole;
}

/**
 * Item de GET /company/staff. A rota responde um array cru, sem o envelope
 * `{data, meta}` das listas paginadas - por isso nada de `toPaginated` aqui.
 *
 * Não traz `status` nem data de convite: a tela de equipe mostra só o que
 * está aqui. Quem vale para exibir a função é `staffRole` (o que o convite
 * define), não `user.role`.
 */
export interface CompanyStaffMember {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  companyId: string;
  staffRole: StaffRole;
}

/** Convite recém-criado (POST /company/invite). */
export interface StaffInvite {
  id?: string;
  email?: string;
  staffRole?: StaffRole;
  status?: string;
  invitedAt?: string;
  createdAt?: string;
  created_at?: string;
}

/**
 * Um dia da grade de horários. `day` é 0-6 com domingo = 0 (igual ao
 * `Date.getDay()`), e os horários vêm em "HH:mm".
 *
 * Não existe flag de "fechado" por dia: dia fechado é dia que não está na
 * lista. Como o PUT é upsert por dia, isso significa que desmarcar um dia na
 * tela não tem como ser gravado - ver o comentário em `toOpeningHoursDays`.
 */
export interface OpeningHourDay {
  id: string;
  companyId: string;
  day: number;
  openTime: string;
  closeTime: string;
  /** Intervalo (almoço), opcional - os dois vêm juntos ou nenhum. */
  breakStart?: string;
  breakEnd?: string;
}

/**
 * Resposta de GET /opening-hours/:companyId (pública) e de
 * GET /opening-hours/me.
 *
 * `isOpen` é o status atual da loja e é **cacheado** no backend: só muda
 * quando o horário é salvo, não com o relógio. O front busca de novo a cada
 * minuto (useRestaurantOpeningHours) para pegar essa mudança sem recarregar.
 * Quando `linkedToCashRegister` é true, quem manda nesse status é o caixa
 * aberto/fechado, não a grade de horários.
 */
export interface OpeningHoursResponse {
  isOpen: boolean;
  linkedToCashRegister: boolean;
  days: OpeningHourDay[];
}

/**
 * Dia como vai no PUT. Sem `id` e sem `companyId` de propósito: a chave do
 * upsert é `day`, e o class-validator do backend roda em whitelist - campo
 * a mais volta 400 (foi o que aconteceu com `role` no convite de staff).
 */
export interface UpdateOpeningHoursDay {
  day: number;
  openTime: string;
  closeTime: string;
  breakStart?: string;
  breakEnd?: string;
}

export interface UpdateOpeningHoursRequest {
  days: UpdateOpeningHoursDay[];
}

// Address types
export interface Address {
  id: string;
  zipCode: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  number: string;
  complement?: string;
  reference?: string;
  latitude: number;
  longitude: number;
  customerId?: string; // Campo correto do Prisma (customers)
  userId?: string; // Mantido para compatibilidade
  companyId?: string;
  isDefault: boolean;
  // Soft delete - DELETE /address/me/:id só marca isActive: false, não
  // apaga o registro. Ausente = tratar como ativo (respostas antigas/mock).
  isActive?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAddressRequest {
  zipCode: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  number: string;
  complement?: string;
  reference?: string;
  // Breaking change do backend: agora exige number (@IsLatitude/@IsLongitude
  // rejeitam string). Nunca enviar como string.
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
}

export interface UpdateAddressRequest {
  zipCode?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  number?: string;
  complement?: string;
  reference?: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

// Order types
export interface Order {
  id: string;
  customerId: string;
  /** Relação incluída por GET /order/company (ver order.md). */
  customer?: CustomerRef;
  /** Relação incluída por GET /order/customer/me (ver order.md). */
  company?: OrderCompanyRef;
  discount: number;
  totalShipping: number;
  totalValue: number;
  status:
  | "CART"
  | "ORDERED"
  | "AWAITING_PAYMENT"
  | "IN_PRODUCTION"
  | "READY_FOR_PICKUP"
  | "COMPLETED"
  | "CANCELED"
  | "ABANDONED";
  orderedItems?: OrderItem[];
  /**
   * Pagamentos do pedido. Vem aninhado em
   * `GET /delivery/delivery-person/me` - é o que diz ao entregador se ele
   * precisa receber na entrega ou se o pedido já foi pago.
   *
   * É lista porque o pedido pode ser dividido em mais de um pagamento.
   */
  payments?: Payment[];
  created_at: string;
  updated_at: string;
  /** Quando entrou no `status` atual — referência do cronômetro de coluna, não `updated_at`. */
  statusChangedAt: string;
  /** Fonte da verdade para entrega vs. retirada — não deduzir pela relação `delivery`. */
  fulfillmentType: "DELIVERY" | "PICKUP";
  cancelReason?: string | null;
  companyId: string;
  /**
   * Troco para quanto: o valor que o cliente entrega em dinheiro, NÃO o
   * troco calculado. Num pedido de R$ 35,90 com `changeFor: 50`, o troco é
   * R$ 14,10.
   *
   * É campo do PEDIDO, não do pagamento - chega ao backend por
   * `FinishOrderRequest` e volta aqui aninhado em
   * `GET /delivery/delivery-person/me`. Ausente quando o pagamento não é em
   * dinheiro ou o cliente dispensou o troco.
   */
  changeFor?: number;
  /** Observação geral do pedido, enviada em POST /order (ver order.md). */
  observations?: string | null;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  /** Relação incluída por GET /order-item/order/:orderId (ver order.md). */
  product?: Pick<Product, "id" | "name" | "salePrice" | "imageURL">;
  created_at: string;
  updated_at: string;
}

/**
 * Corpo de POST /order/:id (finalizar). O pedido nasce no carrinho sem
 * saber como vai ser atendido - a escolha entre entrega e retirada só
 * existe no checkout, então ela viaja aqui, na finalização.
 */
export interface FinishOrderRequest {
  /**
   * O backend usa este campo para criar a entrega sozinho quando é
   * "DELIVERY". Sem ele nenhum registro de entrega é gerado e a lista do
   * entregador fica vazia.
   */
  fulfillmentType: "DELIVERY" | "PICKUP";
  /**
   * Quanto o cliente entrega em dinheiro, não o troco calculado: num
   * pedido de R$ 35,90 com `changeFor: 50`, o troco é R$ 14,10. Omitido
   * quando o pagamento não é em dinheiro ou quando o cliente dispensa o
   * troco.
   */
  changeFor?: number;
}

export interface CreateOrderRequest {
  companyId: string; // OBRIGATÓRIO - ID do restaurante
  discount: number;
  totalShipping: number;
  totalValue: number;
  status:
  | "CART"
  | "ORDERED"
  | "AWAITING_PAYMENT"
  | "IN_PRODUCTION"
  | "READY_FOR_PICKUP"
  | "COMPLETED";
  observations?: string;
  payment?: string;
  orderedItems?: {
    productId: string;
    quantity: number;
    unitPrice: number;
    addIngredient?: {
      ingredientId: string;
      quantity: number;
      unitPrice: number;
    }[];
  }[];
}

// Ingredient types
export interface Ingredient {
  id: string;
  description: string;
  category: string;
  supplier: string;
  batch: string;
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  expirationDate: string;
  allergic?: string;
  isAvailable: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateIngredientRequest {
  description: string;
  category: string;
  supplier: string;
  batch: string;
  costPrice: number;
  salePrice: number;
  stockQuantity: number;
  expirationDate: string;
  allergic?: string;
  isAvailable: boolean;
}

export interface UpdateIngredientRequest {
  description?: string;
  category?: string;
  supplier?: string;
  batch?: string;
  costPrice?: number;
  salePrice?: number;
  stockQuantity?: number;
  expirationDate?: string;
  allergic?: string;
  isAvailable?: boolean;
}

// Payment types
export enum PaymentMethod {
  CASH = "CASH",
  CREDIT_CARD = "CREDIT_CARD",
  DEBIT_CARD = "DEBIT_CARD",
  PIX = "PIX",
  BANK_TRANSFER = "BANK_TRANSFER",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export interface Payment {
  id: string;
  amount: number;
  orderId: string;
  customerId: string;
  /** Relação incluída pelas listas de /payment (ver payment.md). */
  customer?: CustomerRef;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  transaction?: string;
  /** Devolvido em métodos que exigem redirecionamento externo (ex. PIX via gateway). */
  gatewayUrl?: string;
  date?: Date;
  created_at?: string;
  updated_at?: string;
}

export interface CreatePaymentRequest {
  amount: number;
  orderId: string;
  // customerId: string;
  paymentMethod: PaymentMethod;
  // status: PaymentStatus;
}

export interface UpdatePaymentRequest {
  amount?: number;
  orderId?: string;
  customerId?: string;
  paymentMethod?: PaymentMethod;
  status?: PaymentStatus;
}

// ======================
// Cash Movement types
// ======================
/**
 * Os quatro POST de /cash-movement levam o mesmo corpo — { amount,
 * paymentMethod, description } (ver cash-movement.md).
 *
 * `paymentMethod` é obrigatório nos quatro porque o backend calcula saldo e
 * valida por método: movimento sem método não entra em total nenhum, some do
 * saldo disponível e aparece com "—" na coluna de método do extrato. Foi o
 * defeito do suprimento, e sangria e reembolso tinham o mesmo.
 */
export interface CashWithdrawalRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
}

export interface CashDepositRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
}

export interface CashSaleRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
}

export interface CashRefundRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
  orderId?: string;
}

export enum CashMovementType {
  SALE = "SALE",
  DEPOSIT = "DEPOSIT",
  WITHDRAWAL = "WITHDRAWAL",
  REFUND = "REFUND",
}

/** AUTOMATIC = gerado por um pedido; MANUAL = lançado pelo operador. */
export enum CashMovementSource {
  AUTOMATIC = "AUTOMATIC",
  MANUAL = "MANUAL",
}

/**
 * Linha do extrato de GET /cash-movement. O backend nem sempre devolve
 * relação/origem em todo movimento (sangria não tem pedido, venda automática
 * não tem descrição), então tudo além de id/type/amount é opcional.
 */
export interface CashMovement {
  id: string;
  type: CashMovementType;
  amount: number;
  description?: string;
  paymentMethod?: PaymentMethod;
  source?: CashMovementSource;
  cashRegisterId?: string;
  orderId?: string;
  userId?: string;
  user?: CustomerRef;
  createdAt?: string;
  created_at?: string;
}

/** Todos os filtros são opcionais (ver cash-movement.md). */
export interface CashMovementListParams extends PaginationParams {
  cashRegisterId?: string;
  type?: CashMovementType;
  source?: CashMovementSource;
  paymentMethod?: PaymentMethod;
}

// ======================
// Cash Register types
// ======================
export interface OpenCashRegisterRequest {
  openingBalance: number;
  observations?: string;
}

export interface CloseCashRegisterRequest {
  countedTotal: number;
  observations?: string;
}

export interface CashRegister {
  id: string;
  openingBalance: number;
  openedAt: string;
  closedAt?: string;
  countedTotal?: number;
  observations?: string;
  status?: string;
  /** Quem abriu o caixa - pode não ser o usuário logado (ex.: dono vendo o caixa do operador). */
  operatorId?: string;
  /** Observado em GET /cash-register/open/current; opcional porque nem toda resposta traz. */
  operator?: { id: string; name?: string };
}

/**
 * Resumo do caixa aberto (GET /cash-movement/summary/current).
 *
 * ATENÇÃO: os totais por método de pagamento (`totalCash`, `totalCredit`,
 * `totalDebit`, `totalPix`, `totalTransfer`) já vêm LÍQUIDOS do backend -
 * `SALE + DEPOSIT − WITHDRAWAL − REFUND` daquele método. Ou seja, sangria e
 * reembolso já estão descontados: subtrair `totalWithdrawals`/`totalRefunds`
 * de novo conta a saída duas vezes, e um método pode vir negativo (mais
 * sangria do que venda no turno). `totalSales`, `totalDeposits`,
 * `totalWithdrawals` e `totalRefunds` são os brutos por tipo de movimento,
 * úteis só como detalhamento - nunca para recompor o líquido.
 */
export interface CashMovementSummary {
  /** Dinheiro esperado na gaveta: fundo de troco + `totalCash` (líquido). */
  availableBalance: number;
  totalSales: number;
  totalWithdrawals: number;
  totalDeposits: number;
  totalRefunds?: number;
  totalCash: number;
  totalCredit: number;
  totalDebit: number;
  totalPix: number;
  totalTransfer: number;
}

// Delivery types
export interface Delivery {
  id: string;
  orderId: string;
  driverId?: string;
  status:
  | "PENDING"
  | "ACCEPTED"
  | "PICKED_UP"
  | "DELIVERED"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELED";
  pickupTime?: string;
  deliveryTime?: string;
  cancellationReason?: string;
  /**
   * Ganho do entregador pela corrida - diferente de `order.totalValue`, que é
   * o que o cliente pagou pelo pedido.
   *
   * O backend ainda NÃO envia este campo e o nome definitivo precisa ser
   * confirmado com a API antes de valer como contrato. Até lá
   * `getCourierEarnings` devolve null e o bloco de ganho fica oculto no card
   * do entregador, em vez de exibir R$ 0,00 como se fosse real.
   */
  courierEarnings?: number;
  deliveryAddress: Address;
  estimatedTime: string;
  observations?: string;
  created_at: string;
  updated_at: string;
  order: Order;
}

export interface CreateDeliveryRequest {
  orderId: string; // UUID obrigatório
  deliveryAddressId: string; // UUID obrigatório - ID do endereço salvo
  deliveryPersonId?: string; // UUID opcional - ID do entregador
  observations?: string; // Observações sobre a entrega
  estimatedTime?: string; // Tempo estimado de entrega
}
