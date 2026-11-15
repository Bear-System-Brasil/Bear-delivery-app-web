/**
 * =============================================================================
 * API SERVICE - CENTRAL DE INTEGRAÇÃO COM BACKEND
 * =============================================================================
 *
 * Quase todas as chamadas ao backend passam por aqui (`apiService`), sempre
 * pelo proxy do Next (`/api/proxy`). Os tipos do contrato ficam em
 * `api-types.ts` e são reexportados por este arquivo.
 *
 * PADRÃO: Todas as respostas seguem o formato ApiResponse<T>:
 * {
 *   success: boolean,  // true se deu certo, false se erro
 *   data?: T,          // dados retornados (se success = true)
 *   message?: string   // mensagem de erro (se success = false)
 * }
 *
 * IMPORTANTE: SEMPRE acesse response.data, nunca use response diretamente!
 *
 * Exemplo de uso correto:
 * ```typescript
 * const response = await apiService.getAllProducts()
 * if (response.success && response.data) {
 *   setProducts(response.data) // ✅ Correto
 * }
 * ```
 *
 * @see docs/ para o fluxo de dados completo
 */

import { Coords, Restaurant } from "@/types/restaurant";
import { STORAGE_KEYS, storageManager } from "@/utils/storage-manager";
import {
  BIRTH_DATE_MESSAGES,
  getErrorMessage,
  toDateBackendFormat,
} from "@/utils";
import { reportApiFailure } from "@/lib/monitoring";
import type { User as AuthUser } from "@/stores/auth-store";

// Tipos e enums do contrato com o back ficam em ./api-types (só para deixar
// este arquivo com as chamadas HTTP). O reexport abaixo mantém
// `import { Product } from "@/services/api"` funcionando em todo o app.
export * from "./api-types";
import { PaymentMethod, PaymentStatus } from "./api-types";
import type {
  CreateUserRequest,
  RegisterRequest,
  UpdateUserRequest,
  VerifyOtpRequest,
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  OrderDateRangeParams,
  User,
  CompanyCustomer,
  CompanyCustomersParams,
  LoginResponse,
  RawAuthUser,
  AuthBffResponse,
  ReportsParams,
  ReportsSummary,
  Product,
  RecentProduct,
  RecentProductsParams,
  CreateProductRequest,
  UpdateProductRequest,
  ProductAddOn,
  SaveProductAddOnRequest,
  ProductVariation,
  SaveProductVariationRequest,
  CreateCategoryRequest,
  Category,
  Specialty,
  CreateCompanyRequest,
  Company,
  InviteStaffRequest,
  CompanyStaffMember,
  StaffInvite,
  OpeningHoursResponse,
  UpdateOpeningHoursRequest,
  Address,
  CreateAddressRequest,
  UpdateAddressRequest,
  Order,
  OrderItem,
  FinishOrderRequest,
  CreateOrderRequest,
  Ingredient,
  CreateIngredientRequest,
  UpdateIngredientRequest,
  Payment,
  CreatePaymentRequest,
  UpdatePaymentRequest,
  CashWithdrawalRequest,
  CashDepositRequest,
  CashSaleRequest,
  CashRefundRequest,
  CashMovement,
  CashMovementListParams,
  OpenCashRegisterRequest,
  CloseCashRegisterRequest,
  CashRegister,
  CashMovementSummary,
  Delivery,
  CreateDeliveryRequest,
} from "./api-types";

/**
 * Client fala com o BFF do próprio Next. Cookie httpOnly vai junto
 * automaticamente (same-origin). Nada de token no browser.
 */
const API_BASE_URL = "/api/proxy";

/**
 * Helper para obter usuário autenticado
 * Tenta primeiro do Zustand store, depois fallback para formato legado
 */
const getAuthUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;

  try {
    // Tentar pegar do Zustand store
    const authData = storageManager.local.get<{ state?: { user?: AuthUser } }>(
      STORAGE_KEYS.AUTH,
    );
    if (authData?.state?.user) {
      return authData.state.user;
    }

    // Fallback para formato legado
    const legacyUser = storageManager.local.get<AuthUser>(
      STORAGE_KEYS.LEGACY_USER,
    );
    return legacyUser;
  } catch {
    return null;
  }
};

/**
 * Helper para encode de orderId na URL
 * Não faz encode de chaves Redis (que começam com 'cart:')
 * pois o backend precisa reconhecer o prefixo
 */
const encodeOrderId = (orderId: string): string => {
  // Se é uma chave Redis, não fazer encode
  if (orderId.startsWith("cart:")) {
    return orderId;
  }
  // Para UUIDs normais, fazer encode
  return encodeURIComponent(orderId);
};

/**
 * Contorno temporário (LDMF-466). O backend aplica o CompanyGuard global e
 * responde 403 "Usuário sem empresa" em rotas de cliente que ainda não
 * declaram @AllowNoCompany (carrinho, perfil, logout). Enquanto o back não
 * ajusta, o front reconhece esse caso por `code` e mostra uma mensagem leve
 * em vez de quebrar a tela. Remover quando o back aplicar o decorator (ver
 * company-guard-rotas-cliente.md no backend).
 */
export const NO_COMPANY_SCOPE_CODE = "NO_COMPANY_SCOPE";
export const NO_COMPANY_SCOPE_MESSAGE =
  "Essa parte ainda está de portas fechadas pro seu login. Já está sendo resolvido. 😅";

/** Reconhece o 403 "sem empresa" do CompanyGuard (ver acima). */
export function isNoCompanyScopeError(response: { code?: string }): boolean {
  return response.code === NO_COMPANY_SCOPE_CODE;
}

/**
 * Erros de data de nascimento do back (contrato do LDMF-302, 16/10): vêm com
 * `code` e `message` em array, e o front mostra `message[0]`.
 */
/**
 * Mensagem para mostrar no campo de data quando o back recusa a data, ou null
 * se o erro não é de data. `message` já chega como `message[0]` (apiRequest);
 * se não for texto simples, usa a mensagem local em vez do JSON cru.
 */
export function getBirthDateApiError(error: {
  code?: unknown;
  message?: unknown;
}): string | null {
  const code = error.code;
  if (code !== "UNDERAGE" && code !== "INVALID_BIRTH_DATE") return null;

  const message = typeof error.message === "string" ? error.message.trim() : "";
  if (message && !/^[[{]/.test(message)) return message;
  return code === "UNDERAGE"
    ? BIRTH_DATE_MESSAGES.underage
    : BIRTH_DATE_MESSAGES.invalid;
}

/**
 * Normaliza o corpo de uma rota paginada em `{ items, meta }`.
 *
 * O envelope oficial é `{ data, meta }` (ver pagination.md), mas algumas
 * rotas mais antigas ainda respondem com o array cru. Ler `.data` direto
 * como array é justamente o que deixa a tela vazia quando vem o envelope -
 * este helper cobre os dois formatos num lugar só, e sempre devolve um
 * `meta` utilizável (derivado do array quando o backend não manda um).
 */
export function toPaginated<T>(
  body: PaginatedResponse<T> | T[] | null | undefined,
  fallback?: PaginationParams,
): { items: T[]; meta: PaginatedResponse<T>["meta"] } {
  const page = fallback?.page ?? 1;
  const limit = fallback?.limit ?? 0;

  if (Array.isArray(body)) {
    return {
      items: body,
      meta: {
        page,
        limit: limit || body.length,
        total: body.length,
        totalPages: 1,
      },
    };
  }

  const items = Array.isArray(body?.data) ? body.data : [];
  const meta = body?.meta;

  return {
    items,
    meta: {
      page: meta?.page ?? page,
      limit: meta?.limit ?? (limit || items.length),
      total: meta?.total ?? items.length,
      totalPages: meta?.totalPages ?? 1,
    },
  };
}

/** Máximo aceito pelo backend (ver pagination.md) - usar quando a tela
 * precisa do conjunto quase-completo numa única chamada (ex: Kanban ao vivo)
 * em vez de paginação de verdade. */
export const MAX_PAGE_LIMIT = 100;

function withPagination(endpoint: string, params?: PaginationParams): string {
  if (!params?.page && !params?.limit) return endpoint;
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}${qs.toString()}`;
}

function withCashMovementFilters(
  endpoint: string,
  params?: CashMovementListParams,
): string {
  if (!params) return endpoint;
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.cashRegisterId) qs.set("cashRegisterId", params.cashRegisterId);
  if (params.type) qs.set("type", params.type);
  if (params.source) qs.set("source", params.source);
  if (params.paymentMethod) qs.set("paymentMethod", params.paymentMethod);
  const query = qs.toString();
  if (!query) return endpoint;
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}${query}`;
}

function withOrderDateRange(
  endpoint: string,
  params?: OrderDateRangeParams,
): string {
  if (!params) return endpoint;
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.startDate) qs.set("startDate", params.startDate);
  if (params.endDate) qs.set("endDate", params.endDate);
  const query = qs.toString();
  if (!query) return endpoint;
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}${query}`;
}

/** Só entra na query string o que foi informado - sem `status`, a rota
 *  devolve ativos e inativos juntos. */
function withCompanyCustomerFilters(
  endpoint: string,
  params?: CompanyCustomersParams,
): string {
  if (!params) return endpoint;
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.status) qs.set("status", params.status);
  const query = qs.toString();
  if (!query) return endpoint;
  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}${query}`;
}

async function apiRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  endpoint: string,
  data?: unknown,
  requiresAuth: boolean = false,
  // Alguns GETs exigem token só pra devolver dado (ex: complementos/tamanhos
  // de um prato, visíveis a qualquer visitante navegando o cardápio) - um
  // 401 aí não é "sessão expirada", é só "visitante sem login ainda". Não
  // dispara o popup global de login nem o toast de sessão nesses casos.
  silentUnauthorized: boolean = false,
  signal?: AbortSignal,
): Promise<ApiResponse<T>> {
  try {
    const config: RequestInit = {
      method,
      headers: { "Content-Type": "application/json" },
      signal,
    };

    // Add body for POST, PUT, PATCH requests
    if (data && method !== "GET") {
      config.body = JSON.stringify(data);
    }

    // Autenticação vai via cookie httpOnly, injetado pelo proxy do Next
    // (ver /api/proxy/[...path]) - mas só quando explicitamente pedido.
    // Sem esse sinal, o proxy manda tudo autenticado pra quem tá logado,
    // o que quebra endpoints publicos que o backend responde diferente
    // com token (ex: GET /company tenta usar o endereço do usuário).
    if (requiresAuth) {
      config.headers = { ...config.headers, "X-Auth-Required": "1" };
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

    if (response.status === 401 && requiresAuth) {
      if (!silentUnauthorized && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      }
      return {
        success: false,
        message: silentUnauthorized
          ? "Faça login para ver esta opção."
          : "Sessão expirada. Faça login novamente.",
        status: response.status,
      };
    }

    let result;

    // Verificar se a resposta tem conteúdo antes de parsear JSON
    // DELETE requests geralmente retornam 204 No Content
    const contentType = response.headers.get("content-type");
    const hasJsonContent =
      contentType && contentType.includes("application/json");

    if (response.status === 204 || !hasJsonContent) {
      // Resposta sem conteúdo (204 No Content) ou não-JSON
      result = null;
    } else {
      try {
        result = await response.json();
      } catch (_parseError) {
        reportApiFailure({ method, endpoint, status: response.status });
        return {
          success: false,
          message: `Erro ao processar resposta do servidor (Status ${response.status})`,
        };
      }
    }

    if (!response.ok) {
      // Se não tem resultado (204 ou sem conteúdo), usar mensagem padrão
      if (!result) {
        if (process.env.NODE_ENV !== "production") {
          console.error("API Error:", {
            status: response.status,
            statusText: response.statusText,
            endpoint,
            method,
          });
        }

        reportApiFailure({ method, endpoint, status: response.status });

        return {
          success: false,
          message: `Erro ${response.status}: ${response.statusText}`,
        };
      }

      // Extract error message in a simple way
      let errorMessage: string;

      if (Array.isArray(result.message) && result.message.length > 0) {
        // Se for array, pega o primeiro elemento
        const firstMsg = result.message[0];
        errorMessage =
          typeof firstMsg === "string" ? firstMsg : JSON.stringify(firstMsg);
      } else if (typeof result.message === "string" && result.message.trim()) {
        errorMessage = result.message;
      } else if (Array.isArray(result.error) && result.error.length > 0) {
        const firstErr = result.error[0];
        errorMessage =
          typeof firstErr === "string" ? firstErr : JSON.stringify(firstErr);
      } else if (typeof result.error === "string" && result.error.trim()) {
        errorMessage = result.error;
      } else if (result.message && typeof result.message === "object") {
        // Se message é um objeto, tenta extrair informações úteis
        try {
          errorMessage = JSON.stringify(result.message);
        } catch (_e) {
          errorMessage = "Erro ao processar resposta do servidor";
        }
      } else {
        errorMessage = `Erro ${response.status}: ${response.statusText}`;
      }

      // Contorno temporário (LDMF-466): o CompanyGuard global do backend
      // responde 403 "Usuário sem empresa" em rotas de cliente que ainda não
      // declaram @AllowNoCompany (carrinho, perfil, logout). Não é falha de
      // servidor, então não reporta no monitor e degrada com uma mensagem
      // leve. Some quando o back aplicar o decorator.
      if (response.status === 403 && /sem empresa/i.test(errorMessage)) {
        return {
          success: false,
          message: NO_COMPANY_SCOPE_MESSAGE,
          status: 403,
          code: NO_COMPANY_SCOPE_CODE,
        };
      }

      // Skip 404 logging on viewOrder - expected when no cart exists
      const is404OnViewOrder =
        response.status === 404 &&
        endpoint.includes("/order/") &&
        method === "GET";

      // Skip 404 logging on addProductToCart - expected when the orderId
      // persisted in localStorage points to a cart that already expired/
      // foi finalizado no backend. handleAddToCart já trata esse caso:
      // recria o carrinho e reenvia o item automaticamente.
      const is404OnAddToCart =
        response.status === 404 &&
        endpoint.includes("/order-item/cart") &&
        method === "POST";

      // GET /product/recent ainda não existe no backend (ver RecentProduct):
      // a home tenta uma vez por sessão e cai na agregação por loja.
      const is404OnRecentProducts =
        response.status === 404 && endpoint.startsWith("/product/recent");

      // Cidade sem lista de bairros: esperado, o cliente usa "Outro".
      const is404OnNeighborhoods =
        response.status === 404 && endpoint.startsWith("/neighborhoods");

      if (
        !is404OnViewOrder &&
        !is404OnAddToCart &&
        !is404OnRecentProducts &&
        !is404OnNeighborhoods &&
        process.env.NODE_ENV !== "production"
      ) {
        // `serverMessage` e o corpo bruto do erro: sem eles o log so diz "400"
        // e a validação que falhou fica invisível.
        console.error("API Error:", {
          status: response.status,
          endpoint,
          method,
          serverMessage: errorMessage,
          body: result,
        });
      }

      reportApiFailure({
        method,
        endpoint,
        status: response.status,
        message: errorMessage,
      });

      return {
        success: false,
        message: errorMessage,
        status: response.status,
        ...(typeof result?.code === "string" ? { code: result.code } : {}),
      };
    }

    return { success: true, data: result, status: response.status };
  } catch (error) {
    // Repropaga abort pro caller distinguir "cancelado de propósito" (ex:
    // debounce mandando uma chamada mais nova) de falha de rede de verdade -
    // sem isso, todo `AbortController.abort()` vira um `{success:false}`
    // normal e o caller reverte um estado otimista que só foi superado por
    // uma chamada mais nova, não por um erro real.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    reportApiFailure({ method, endpoint });

    return {
      success: false,
      message: "Erro de conexão. Verifique sua internet.",
    };
  }
}

export const apiService = {
  // User endpoints
  createUser: (userData: CreateUserRequest) => {
    const { cpf, ...rest } = userData;
    const cleanCpf = cpf ? cpf.replace(/\D/g, "") : undefined;
    const payload = {
      ...rest,
      ...(cleanCpf ? { cpf: cleanCpf } : {}),
      termsVersion: userData.termsVersion || "2026-10-04",
      privacyVersion: userData.privacyVersion || "2026-10-05",
    };
    return apiRequest<User>("POST", "/user", payload);
  },

  updateUser: (userData: Partial<UpdateUserRequest> & { id?: string }) => {
    const { cpf, id: _id, email: _email, phone, birthDate, ...rest } = userData;
    const cleanCpf =
      cpf && cpf.replace(/\D/g, "").length > 0
        ? cpf.replace(/\D/g, "")
        : undefined;
    const cleanPhone =
      phone && phone.replace(/\D/g, "").length > 0
        ? phone.replace(/\D/g, "")
        : undefined;
    const cleanBirthDate = birthDate
      ? toDateBackendFormat(birthDate)
      : undefined;
    const payload = {
      ...rest,
      ...(cleanCpf ? { cpf: cleanCpf } : {}),
      ...(cleanPhone ? { phone: cleanPhone } : {}),
      ...(cleanBirthDate ? { birthDate: cleanBirthDate } : {}),
    };
    return apiRequest<User>("PUT", `/user`, payload, true);
  },

  /**
   * Atualiza/registra o CPF do usuário autenticado (LDMF-301 / LDMF-335).
   * Chama a rota protegida PATCH /auth/cpf, com fallback para PUT /user
   * caso a rota nova ainda não tenha subido no backend (404).
   */
  updateCpf: async (cpf: string): Promise<ApiResponse<User>> => {
    const cleanCpf = cpf.replace(/\D/g, "");
    const res = await apiRequest<User>(
      "PATCH",
      "/auth/cpf",
      { cpf: cleanCpf },
      true,
    );
    if (!res.success && res.status === 404) {
      return apiService.updateUser({ cpf: cleanCpf });
    }
    return res;
  },

  verifyOtp: (otpData: VerifyOtpRequest) =>
    apiRequest<string>("POST", "/user/complet", otpData),

  // Clientes vinculados à empresa autenticada (ver pagination.md).
  // A rota saiu de /user/company/customers para /company/customers.
  getCompanyCustomers: (params?: CompanyCustomersParams) =>
    apiRequest<PaginatedResponse<CompanyCustomer>>(
      "GET",
      withCompanyCustomerFilters("/company/customers", params),
      undefined,
      true,
    ),

  // O back ja sanitiza /user/me (toMeResponse remove password/cpf). Mantemos
  // a remocao defensiva do password aqui para nunca deixar o hash chegar no
  // Zustand (persiste em localStorage via updateUser), caso algum retorno
  // volte a incluir o campo.
  getMe: async (): Promise<ApiResponse<User>> => {
    const response = await apiRequest<User & { password?: string }>(
      "GET",
      "/user/me",
      undefined,
      true,
    );
    if (response.success && response.data) {
      const { password: _password, ...safeUser } = response.data;
      return { ...response, data: safeUser };
    }
    return response as ApiResponse<User>;
  },

  // Auth endpoints - falam com as rotas BFF do Next (Set-Cookie httpOnly),
  // não com o proxy do NestJS.
  register: async (
    userData: RegisterRequest,
  ): Promise<ApiResponse<AuthBffResponse>> => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userData),
    });
    const result = await res.json().catch(() => null);
    return res.ok
      ? { success: true, data: result.data as AuthBffResponse }
      : { success: false, message: result?.message, status: res.status };
  },

  login: async (credentials: {
    email: string;
    password: string;
  }): Promise<ApiResponse<AuthBffResponse>> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    const result = await res.json().catch(() => null);
    return res.ok
      ? { success: true, data: result.data as AuthBffResponse }
      : { success: false, message: result?.message, status: res.status };
  },

  logout: async (): Promise<void> => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // O Zustand já foi limpo antes de chamar isso (ver auth-provider) -
      // sem rede, o cookie httpOnly expira sozinho; não há o que mais fazer.
    }
  },

  // Chamado sem tratamento de erro no boot da sessão (ver auth-provider.tsx)
  // derrubaria a reconciliação de sessão inteira com uma unhandled rejection
  // silenciosa - backend fora do ar ou corpo não-JSON precisa cair pra
  // "não autenticado" e não travar a inicialização do app.
  getSession: async (): Promise<{
    authenticated: boolean;
    user: RawAuthUser | null;
  }> => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      return await res.json();
    } catch {
      return { authenticated: false, user: null };
    }
  },

  getInitialPhone: () =>
    apiRequest<{ phone: string }>("GET", "/auth/login/initial"),

  completeLogin: (data: { phone: string; code: string }) =>
    apiRequest<LoginResponse>("POST", "/auth/login/complet", data),

  // Recuperação de senha - o backend identifica o usuário pelo e-mail e
  // manda o código por e-mail (LDMF-294).
  forgotPassword: (data: { email: string }) =>
    apiRequest<{ message: string }>("POST", "/auth/forgot-password", data),

  // reset-password devolve um token novo (login automático) - por isso,
  // diferente de forgotPassword, passa pelo BFF de auth (como login/register)
  // pra virar cookie de sessão httpOnly, em vez do proxy genérico.
  resetPassword: async (data: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<ApiResponse<AuthBffResponse>> => {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => null);
    return res.ok
      ? { success: true, data: result.data as AuthBffResponse }
      : { success: false, message: result?.message, status: res.status };
  },

  // Product endpoints
  getAllProducts: () => apiRequest<Product[]>("GET", "/product"),

  getProduct: (id: string) => apiRequest<Product>("GET", `/product/${id}`),

  // Ver RecentProduct - rota ainda não implementada no backend.
  getRecentProducts: (params?: RecentProductsParams) => {
    const qs = new URLSearchParams();
    if (params?.lat !== undefined) qs.set("lat", String(params.lat));
    if (params?.lng !== undefined) qs.set("lng", String(params.lng));
    if (params?.limit) qs.set("limit", String(params.limit));
    const query = qs.toString();
    return apiRequest<RecentProduct[] | PaginatedResponse<RecentProduct>>(
      "GET",
      `/product/recent${query ? `?${query}` : ""}`,
    );
  },

  getProductsByCompany: (companyId: string, params?: PaginationParams) =>
    apiRequest<PaginatedResponse<Product>>(
      "GET",
      withPagination(`/product/company/${companyId}`, params),
      undefined,
      true,
    ),

  createProduct: (productData: CreateProductRequest) =>
    apiRequest<Product>("POST", "/product", productData, true),

  updateProduct: (id: string, productData: UpdateProductRequest) =>
    apiRequest<Product>("PATCH", `/product/${id}`, productData, true),

  deleteProduct: (id: string) =>
    apiRequest<Product>("DELETE", `/product/${id}`, undefined, true),

  // Product image endpoints
  uploadProductImage: async (
    productId: string,
    file: File,
  ): Promise<ApiResponse<Product>> => {
    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(
        `${API_BASE_URL}/product/image/${productId}`,
        {
          method: "POST",
          headers: { "X-Auth-Required": "1" },
          body: formData,
        },
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          message: error.message || "Erro ao fazer upload da imagem",
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data,
      };
    } catch (_error) {
      return {
        success: false,
        message: "Erro ao fazer upload da imagem do produto",
      };
    }
  },

  deleteProductImage: (productId: string, imageId: string) =>
    apiRequest<Product>(
      "DELETE",
      `/product/image/${productId}/${imageId}`,
      undefined,
      true,
    ),

  // Product add-on endpoints ("Complementos")
  productAddOns: {
    // O backend filtra por empresa (via JWT ou ?companyId=), não por
    // produto - o filtro por productId é feito no hook
    // (use-product-add-ons.ts). Staff sempre tem companyId no token; para
    // client (JWT sem companyId) o backend exige o query param, por isso
    // aceita companyId aqui mesmo no getAll "normal".
    getAll: (companyId?: string) =>
      apiRequest<ProductAddOn[]>(
        "GET",
        companyId
          ? `/product-add-ons?companyId=${companyId}`
          : "/product-add-ons",
        undefined,
        true,
      ),

    // Usado pelo modal de personalização do prato, acessível a visitante
    // não-logado navegando o cardápio - um 401/403 aí não deve abrir o
    // popup global de login (isso hoje sempre falha pra role client - o
    // backend só libera leitura pra admin/owner/manager/cook).
    getAllPublic: (companyId?: string) =>
      apiRequest<ProductAddOn[]>(
        "GET",
        companyId
          ? `/product-add-ons?companyId=${companyId}`
          : "/product-add-ons",
        undefined,
        true,
        true,
      ),

    create: (productId: string, data: SaveProductAddOnRequest) =>
      apiRequest<ProductAddOn>(
        "POST",
        `/product-add-ons/${productId}`,
        data,
        true,
      ),

    // O PATCH exige name + priceModifier juntos, mesmo pra só alternar
    // isAvailable - não é um partial update de verdade.
    update: (id: string, data: SaveProductAddOnRequest) =>
      apiRequest<ProductAddOn>("PATCH", `/product-add-ons/${id}`, data, true),

    delete: (id: string) =>
      apiRequest<ProductAddOn>(
        "DELETE",
        `/product-add-ons/${id}`,
        undefined,
        true,
      ),
  },

  // Product variation endpoints ("Tamanhos")
  productVariations: {
    // Ver comentário em productAddOns.getAll - mesmo esquema de
    // companyId via JWT (staff) ou query (client, cujo JWT não tem
    // companyId).
    getAll: (companyId?: string) =>
      apiRequest<ProductVariation[]>(
        "GET",
        companyId
          ? `/product-variation?companyId=${companyId}`
          : "/product-variation",
        undefined,
        true,
      ),

    // Diferente de productAddOns, o backend já libera leitura pra role
    // client aqui - só precisa do companyId via query já que o JWT do
    // client não carrega companyId.
    getAllPublic: (companyId?: string) =>
      apiRequest<ProductVariation[]>(
        "GET",
        companyId
          ? `/product-variation?companyId=${companyId}`
          : "/product-variation",
        undefined,
        true,
        true,
      ),

    create: (productId: string, data: SaveProductVariationRequest) =>
      apiRequest<ProductVariation>(
        "POST",
        `/product-variation/${productId}`,
        data,
        true,
      ),

    update: (id: string, data: SaveProductVariationRequest) =>
      apiRequest<ProductVariation>(
        "PATCH",
        `/product-variation/${id}`,
        data,
        true,
      ),

    delete: (id: string) =>
      apiRequest<ProductVariation>(
        "DELETE",
        `/product-variation/${id}`,
        undefined,
        true,
      ),
  },

  // Category endpoints
  // Listagem pública (para a tela inicial do cliente) - Todos têm acesso
  getAllCategories: () => apiRequest<Category[]>("GET", "/categories"),

  // Listagem administrativa (Painel da Empresa) - Exige auth (Admin, Owner, Manager)
  getMyCategories: (params?: PaginationParams) =>
    apiRequest<PaginatedResponse<Category>>(
      "GET",
      withPagination("/categories/me", params),
      undefined,
      true,
    ),

  getCategory: (id: string) => apiRequest<Category>("GET", `/categories/${id}`),

  // Modificações - Exigem auth (Admin, Owner, Manager)
  createMyCategory: (categoryData: CreateCategoryRequest) =>
    apiRequest<Category>("POST", "/categories/me", categoryData, true),

  updateMyCategory: (id: string, categoryData: CreateCategoryRequest) =>
    apiRequest<Category>("PATCH", `/categories/me/${id}`, categoryData, true),

  // Remoção-Apenas Admin e Owner podem deletar (Manager recebe 403)
  deleteMyCategory: (id: string) =>
    apiRequest<Category>("DELETE", `/categories/me/${id}`, undefined, true),

  // Reordena as categorias da empresa (LDMF-345). Corpo { ids } na ordem
  // nova. Só owner e manager (admin recebe 403, ao contrário das outras
  // rotas de categoria). Resposta 200 = todas as categorias já ordenadas,
  // sem paginação. 404 = algum id não é desta empresa (nada é salvo).
  reorderMyCategories: (ids: string[]) =>
    apiRequest<Category[]>("PATCH", "/categories/order", { ids }, true),
  // Legacy global category endpoints
  createCategory: (categoryData: CreateCategoryRequest) =>
    apiRequest<Category>("POST", "/categories/me", categoryData, true),

  updateCategory: (id: string, categoryData: CreateCategoryRequest) =>
    apiRequest<Category>("PUT", `/categories/me/${id}`, categoryData, true),

  deleteCategory: (id: string) =>
    apiRequest<Category>("DELETE", `/categories/me/${id}`, undefined, true),

  assignCategoryToCompany: (categoryId: string) =>
    apiRequest<Category>(
      "POST",
      `/categories/company/${categoryId}`,
      undefined,
      true,
    ),

  // Category-Product endpoints (link/unlink categories to products)
  linkCategoryToProduct: (
    productId: string,
    categoryId: string,
    description: string,
  ) =>
    apiRequest<void>(
      "POST",
      `/category-product/${productId}/${categoryId}`,
      { description },
      true,
    ),

  // Rota exige productId + categoryId juntos (não o id da relação
  // productCategories) - ver category-product.md.
  unlinkCategoryFromProduct: (productId: string, categoryId: string) =>
    apiRequest<void>(
      "DELETE",
      `/category-product/${productId}/${categoryId}`,
      undefined,
      true,
    ),

  // Specialty endpoints (restaurant types)
  // Apesar do doc dizer que é rota pública, o backend real exige token aqui
  // (confirmado: 401 "Token inválido ou ausente." mesmo sem nenhum guard
  // documentado). Único caller hoje é /company-profile (owner/admin, sempre
  // autenticado), então é seguro exigir auth.
  // A rota do back é /specialities (doc specialities.md). O front chamava
  // /specialties, que responde 404 "Cannot GET /specialties" — a lista nunca
  // vinha, a tela caía na lista local e trocar o tipo não salvava (LDMF-395).
  // Divergência observada vs. o comentário antigo: a doc marca o GET como
  // público e um GET sem auth devolve 200, não o 401 que o comentário citava.
  getAllSpecialties: () =>
    apiRequest<Specialty[]>("GET", "/specialities", undefined, true),

  getCompaniesBySpecialty: (specialtyId: string) =>
    apiRequest<Company[]>("GET", `/specialities/${specialtyId}/companies`),

  assignSpecialtyToCompany: (specialtyId: string) =>
    apiRequest<Company>(
      "POST",
      `/specialities/${specialtyId}`,
      undefined,
      true,
    ),

  removeSpecialtyFromCompany: (specialtyId: string) =>
    apiRequest<Company>(
      "DELETE",
      `/specialities/${specialtyId}`,
      undefined,
      true,
    ),

  // Company endpoints
  companies: {
    // O cookie de sessão já foi setado pelo /api/auth/register - o proxy
    // injeta o Bearer sozinho, não precisa mais de token explícito aqui.
    // POST /company exige multipart/form-data (ver company.md) - mandar
    // JSON aqui fazia o cadastro de empresa falhar silenciosamente logo
    // após criar a conta, deixando o usuário preso como 'client' pra
    // sempre (a promoção pra 'owner' só acontece dentro desse POST).
    create: async (
      companyData: CreateCompanyRequest,
    ): Promise<ApiResponse<Company>> => {
      try {
        const formData = new FormData();
        const payloadWithRadius: CreateCompanyRequest = {
          ...companyData,
          actionRadius: companyData.actionRadius || "10",
        };

        Object.entries(payloadWithRadius).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") {
            formData.append(key, String(value));
          }
        });

        const config: RequestInit = {
          method: "POST",
          headers: { "X-Auth-Required": "1" },
          body: formData, // Não definir Content-Type - deixa o browser definir com boundary
        };

        const response = await fetch(`${API_BASE_URL}/company`, config);
        const result = await response.json().catch(() => null);

        if (!response.ok) {
          return {
            success: false,
            message: result?.message || `Erro ${response.status}`,
            status: response.status,
          };
        }

        return { success: true, data: result, status: response.status };
      } catch (error) {
        return {
          success: false,
          message: getErrorMessage(error, "Erro ao cadastrar empresa"),
        };
      }
    },

    getAll: (userLocation?: Coords) =>
      apiRequest<Restaurant[]>(
        "GET",
        userLocation
          ? `/company?lat=${userLocation.lat}&lng=${userLocation.lng}`
          : "/company",
      ),

    getById: (id: string) => apiRequest<Company>("GET", `/company/${id}`),

    /**
     * Grava as formas de pagamento aceitas (PATCH /company/:id, só admin e
     * owner). Vai em JSON porque não há arquivo: em multipart o `update`
     * abaixo transformaria a lista em "CASH,PIX", que o backend recusa. A
     * lista substitui a anterior inteira, então mande sempre a completa.
     */
    updateAcceptedPaymentMethods: (
      id: string,
      acceptedPaymentMethods: PaymentMethod[],
    ) =>
      apiRequest<Company>(
        "PATCH",
        `/company/${id}`,
        { acceptedPaymentMethods },
        true,
      ),

    update: async (
      id: string,
      companyData: Partial<CreateCompanyRequest>,
    ): Promise<ApiResponse<Company>> => {
      try {
        // Backend usa FileFieldsInterceptor, então precisa ser multipart/form-data
        const formData = new FormData();

        // Adicionar apenas os campos que foram enviados
        Object.entries(companyData).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });

        const config: RequestInit = {
          method: "PATCH",
          headers: { "X-Auth-Required": "1" },
          body: formData, // Não definir Content-Type - deixa o browser definir com boundary
        };

        const response = await fetch(`${API_BASE_URL}/company/${id}`, config);
        const result = await response.json();

        if (!response.ok) {
          return {
            success: false,
            message: result.message || `Erro ${response.status}`,
            data: undefined,
          };
        }

        return {
          success: true,
          data: result,
          message: undefined,
        };
      } catch (error) {
        return {
          success: false,
          message: getErrorMessage(error, "Erro ao atualizar empresa"),
          data: undefined,
        };
      }
    },

    /**
     * Convida um membro para a equipe da empresa autenticada. A empresa vem
     * do token, então o corpo é só e-mail + função (ver company.md).
     * O backend valida `role` contra o StaffRoleEnum e responde 400 para
     * função fora dele, 403 para quem não pode convidar e 409 para e-mail
     * já convidado/já na equipe.
     */
    invite: (data: InviteStaffRequest) =>
      apiRequest<StaffInvite>("POST", "/company/invite", data, true),

    /**
     * Equipe da empresa autenticada. A empresa vem do token, como no convite.
     */
    getStaff: () =>
      apiRequest<CompanyStaffMember[]>("GET", "/company/staff", undefined, true),

    /**
     * Remove um membro da equipe da empresa (DELETE /company/staff/:userId).
     *
     * A empresa vem do token JWT (ou por ?companyId= para admin).
     * Roles permitidas no backend: owner, admin, manager (LDMF-231).
     */
    removeStaff: (userId: string, companyId?: string) =>
      apiRequest<{ id: string; removed: boolean }>(
        "DELETE",
        companyId
          ? `/company/staff/${userId}?companyId=${encodeURIComponent(companyId)}`
          : `/company/staff/${userId}`,
        undefined,
        true,
      ),
  },

  openingHours: {
    /** Grade pública de uma loja - é de onde sai o badge Aberto/Fechado. */
    getByCompany: (companyId: string) =>
      apiRequest<OpeningHoursResponse>(
        "GET",
        `/opening-hours/${companyId}`,
      ),

    /** Grade da empresa autenticada (admin/owner/manager). */
    getMine: () =>
      apiRequest<OpeningHoursResponse>(
        "GET",
        "/opening-hours/me",
        undefined,
        true,
      ),

    /**
     * Upsert por dia: dia que não vai no corpo continua como estava no
     * banco - o PUT nunca apaga.
     */
    updateMine: (data: UpdateOpeningHoursRequest) =>
      apiRequest<OpeningHoursResponse>(
        "PUT",
        "/opening-hours/me",
        data,
        true,
      ),
  },

  // Upload endpoint (S3)
  uploadImage: async (
    file: File,
    folder: string = "products",
  ): Promise<ApiResponse<{ url: string }>> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", folder);

      const response = await fetch(`${API_BASE_URL}/s3/upload`, {
        method: "POST",
        headers: { "X-Auth-Required": "1" },
        body: formData,
      });

      if (!response.ok) {
        return {
          success: false,
          message: "Erro ao fazer upload da imagem",
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data,
      };
    } catch (_error) {
      return {
        success: false,
        message: "Erro ao fazer upload da imagem",
      };
    }
  },

  // Upload user photo via PUT /user endpoint
  uploadUserPhoto: async (
    file: File,
    userData?: { name?: string; email?: string; cpf?: string; phone?: string },
  ): Promise<ApiResponse<User>> => {
    try {
      let dataToSend: { name?: string } = {};

      // Se userData foi passado, usar esses dados
      if (userData && Object.keys(userData).length > 0) {
        dataToSend = userData;
      } else {
        // Buscar dados do Zustand store (salvos no login com todos os campos)
        const userFromStorage = getAuthUser();
        if (userFromStorage) {
          dataToSend = {
            name: userFromStorage.name || "",
          };
        }
      }

      const formData = new FormData();
      formData.append("photo", file);

      // Adicionar apenas o nome para satisfazer validação do backend
      // Não enviamos email, cpf ou phone para evitar conflito de unicidade
      if (dataToSend.name) formData.append("name", dataToSend.name);

      const response = await fetch(`${API_BASE_URL}/user`, {
        method: "PUT",
        headers: { "X-Auth-Required": "1" },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          message: error.message || "Erro ao fazer upload da foto",
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data,
      };
    } catch (_error) {
      return {
        success: false,
        message: "Erro ao fazer upload da foto",
      };
    }
  },

  // Upload company logo via PATCH /company/:id endpoint
  uploadCompanyLogo: async (
    file: File,
    companyId: string,
    companyData?: {
      tradeName?: string;
      legalName?: string;
      cnpj?: string;
      email?: string;
      phone?: string;
    },
  ): Promise<ApiResponse<Company>> => {
    try {
      let dataToSend: {
        tradeName?: string;
        legalName?: string;
        cnpj?: string;
        email?: string;
        phone?: string;
      } = {};

      // Se companyData foi passado, usar esses dados
      if (companyData && Object.keys(companyData).length > 0) {
        dataToSend = companyData;
      } else {
        // Buscar dados do localStorage (salvos no login com todos os campos)
        const userFromStorage = getAuthUser();
        if (userFromStorage) {
          dataToSend = {
            tradeName: userFromStorage.tradeName || "",
            legalName: userFromStorage.legalName || "",
            cnpj: userFromStorage.cnpj || "",
            email: userFromStorage.email || "",
            phone: userFromStorage.phone || "",
          };
        }
      }

      const formData = new FormData();
      formData.append("logo", file);

      // Adicionar campos obrigatórios para evitar erro de validação do backend
      if (dataToSend.tradeName)
        formData.append("tradeName", dataToSend.tradeName);
      if (dataToSend.legalName)
        formData.append("legalName", dataToSend.legalName);
      if (dataToSend.cnpj) formData.append("cnpj", dataToSend.cnpj);
      if (dataToSend.email) formData.append("email", dataToSend.email);
      if (dataToSend.phone) formData.append("phone", dataToSend.phone);

      const response = await fetch(`${API_BASE_URL}/company/${companyId}`, {
        method: "PATCH",
        headers: { "X-Auth-Required": "1" },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          message: error.message || "Erro ao fazer upload do logo",
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data,
      };
    } catch (_error) {
      return {
        success: false,
        message: "Erro ao fazer upload do logo",
      };
    }
  },

  // Upload company cover via PATCH /company/:id endpoint
  uploadCompanyCover: async (
    file: File,
    companyId: string,
    companyData?: {
      tradeName?: string;
      legalName?: string;
      cnpj?: string;
      email?: string;
      phone?: string;
    },
  ): Promise<ApiResponse<Company>> => {
    try {
      let dataToSend: {
        tradeName?: string;
        legalName?: string;
        cnpj?: string;
        email?: string;
        phone?: string;
      } = {};

      // Se companyData foi passado, usar esses dados
      if (companyData && Object.keys(companyData).length > 0) {
        dataToSend = companyData;
      } else {
        // Buscar dados do localStorage (salvos no login com todos os campos)
        const userFromStorage = getAuthUser();
        if (userFromStorage) {
          dataToSend = {
            tradeName: userFromStorage.tradeName || "",
            legalName: userFromStorage.legalName || "",
            cnpj: userFromStorage.cnpj || "",
            email: userFromStorage.email || "",
            phone: userFromStorage.phone || "",
          };
        }
      }

      const formData = new FormData();
      formData.append("cover", file);

      // Adicionar campos obrigatórios para evitar erro de validação do backend
      if (dataToSend.tradeName)
        formData.append("tradeName", dataToSend.tradeName);
      if (dataToSend.legalName)
        formData.append("legalName", dataToSend.legalName);
      if (dataToSend.cnpj) formData.append("cnpj", dataToSend.cnpj);
      if (dataToSend.email) formData.append("email", dataToSend.email);
      if (dataToSend.phone) formData.append("phone", dataToSend.phone);

      const response = await fetch(`${API_BASE_URL}/company/${companyId}`, {
        method: "PATCH",
        headers: { "X-Auth-Required": "1" },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          message: error.message || "Erro ao fazer upload do cover",
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: data,
      };
    } catch (_error) {
      return {
        success: false,
        message: "Erro ao fazer upload do cover",
      };
    }
  },

  // Bairros por estado e cidade (LDMF-264). Exige login; visitante usa a
  // lista local (ver services/neighborhoods). `query` já vem codificada.
  neighborhoods: {
    getByCity: (query: string) =>
      apiRequest<unknown>(
        "GET",
        `/neighborhoods?${query}`,
        undefined,
        true,
        true,
      ),
  },

  // Address endpoints
  // Contrato oficial (doc do backend): TUDO vive sob /address/me agora -
  // listar, criar, atualizar (/address/me/:id) e deletar (/address/me/:id).
  // Antes atualizar/deletar eram direto em /address/:id (sem /me); o back
  // mudou isso.
  address: {
    // User addresses
    getUserAddresses: () =>
      apiRequest<Address[]>("GET", "/address/me", undefined, true),

    createUserAddress: (addressData: CreateAddressRequest) =>
      apiRequest<Address>("POST", "/address/me", addressData, true),

    updateUserAddress: (id: string, addressData: UpdateAddressRequest) =>
      apiRequest<Address>("PATCH", `/address/me/${id}`, addressData, true),

    // Soft delete - backend marca isActive: false, não remove o registro.
    deleteUserAddress: (id: string) =>
      apiRequest<Address>("DELETE", `/address/me/${id}`, undefined, true),

    // Backward compatibility alias
    deleteAddress: (id: string) =>
      apiRequest<Address>("DELETE", `/address/me/${id}`, undefined, true),

    // Company addresses
    getCompanyAddresses: () =>
      apiRequest<Address[]>("GET", "/address/me", undefined, true),

    createCompanyAddress: (addressData: CreateAddressRequest) =>
      apiRequest<Address>("POST", "/address/me", addressData, true),

    updateCompanyAddress: (id: string, addressData: UpdateAddressRequest) =>
      apiRequest<Address>("PATCH", `/address/me/${id}`, addressData, true),

    deleteCompanyAddress: (id: string) =>
      apiRequest<Address>("DELETE", `/address/me/${id}`, undefined, true),
  },

  // Order endpoints
  orders: {
    openCart: (_customerId: string, orderData: CreateOrderRequest) =>
      apiRequest<Order>("POST", `/order`, orderData, true),

    viewOrder: (_customerId: string, orderId: string) =>
      apiRequest<Order>(
        "GET",
        `/order/${encodeOrderId(orderId)}`,
        undefined,
        true,
      ),

    finishOrder: (
      _customerId: string,
      orderId: string,
      data: FinishOrderRequest,
    ) =>
      apiRequest<Order>(
        "POST",
        `/order/${encodeOrderId(orderId)}`,
        data,
        true,
      ),

    clearCart: (_customerId: string, orderId: string) =>
      apiRequest<void>(
        "DELETE",
        `/order/${encodeOrderId(orderId)}`,
        undefined,
        true,
      ),

    // Pedidos do cliente logado. Role `client` - o backend resolve o
    // customerId pelo JWT.
    getCustomerOrders: () =>
      apiRequest<Order[]>("GET", "/order/customer/me", undefined, true),

    getCustomerOrder: (orderId: string) =>
      apiRequest<Order>(
        "GET",
        `/order/customer/me/${encodeOrderId(orderId)}`,
        undefined,
        true,
      ),

    // Atenção: `/order/abandoned` exige role admin/owner/manager.
    // Nao use para listar pedidos de um cliente - ele recebe 403.
    listAbandonedOrders: (customerId?: string) =>
      apiRequest<Order[]>(
        "GET",
        `/order/abandoned${customerId ? `?customerId=${customerId}` : ""}`,
        undefined,
        true,
      ),

    getCompanyOrders: (params?: OrderDateRangeParams) =>
      apiRequest<PaginatedResponse<Order>>(
        "GET",
        withOrderDateRange("/order/company", params),
        undefined,
        true,
      ),

    getCompanyOrdersByStatus: (status: string, params?: OrderDateRangeParams) =>
      apiRequest<PaginatedResponse<Order>>(
        "GET",
        withOrderDateRange(`/order/company/status/${status}`, params),
        undefined,
        true,
      ),

    updateOrderStatus: (
      orderId: string,
      status: string,
      cancelReason?: string,
    ) =>
      apiRequest<Order>(
        "PATCH",
        `/order/${orderId}/status`,
        { status, ...(cancelReason ? { cancelReason } : {}) },
        true,
      ),

    cancelOrder: (orderId: string, reason: string) =>
      apiRequest<Order>("PATCH", `/order/${orderId}/cancel`, { reason }, true),
  },

  // Order Item endpoints
  orderItems: {
    getOrderItem: (orderId: string, itemId: string, customerId?: string) =>
      apiRequest<OrderItem>(
        "GET",
        `/order-item/${itemId}${customerId ? `?customerId=${customerId}&orderId=${orderId}` : ""}`,
        undefined,
        true,
      ),

    listByOrder: (orderId: string, customerId?: string) =>
      apiRequest<OrderItem[]>(
        "GET",
        `/order-item/order/${encodeURIComponent(orderId)}${customerId ? `?customerId=${customerId}` : ""}`,
        undefined,
        true,
      ),

    addProductToCart: (
      orderId: string,
      productId: string,
      _customerId: string,
      quantity: number,
      extras?: {
        addOns?: { productAddOnsId: string; quantity: number }[];
        variations?: { productVariationId: string }[];
      },
      signal?: AbortSignal,
    ) =>
      apiRequest<Order>(
        "POST",
        `/order-item/cart`,
        {
          orderId,
          productId,
          quantity,
          ...(extras?.addOns?.length ? { addOns: extras.addOns } : {}),
          ...(extras?.variations?.length
            ? { variations: extras.variations }
            : {}),
        },
        true,
        false,
        signal,
      ),

    removeProductFromCart: (
      _customerId: string,
      orderId: string,
      productId: string,
      quantity: number,
      signal?: AbortSignal,
    ) =>
      apiRequest<void>(
        "DELETE",
        `/order-item/cart/${encodeOrderId(orderId)}/products/${productId}/${quantity}`,
        undefined,
        true,
        false,
        signal,
      ),
  },

  // Ingredient endpoints
  ingredients: {
    get: (id: string) =>
      apiRequest<Ingredient>("GET", `/ingredient/${id}`, undefined, true),

    create: (ingredientData: CreateIngredientRequest) =>
      apiRequest<Ingredient>("POST", "/ingredient", ingredientData, true),

    update: (id: string, ingredientData: UpdateIngredientRequest) =>
      apiRequest<Ingredient>(
        "PATCH",
        `/ingredient/${id}`,
        ingredientData,
        true,
      ),

    delete: (id: string) =>
      apiRequest<Ingredient>("DELETE", `/ingredient/${id}`, undefined, true),
  },

  // Payment endpoints
  payments: {
    create: (paymentData: CreatePaymentRequest) =>
      apiRequest<Payment>("POST", "/payment", paymentData, true),

    findById: (id: string) =>
      apiRequest<Payment>("GET", `/payment/${id}`, undefined, true),

    findByFilters: (
      filters: { id?: string; orderId?: string; customerId?: string },
      params?: PaginationParams,
    ) =>
      apiRequest<PaginatedResponse<Payment>>(
        "GET",
        withPagination(
          `/payment?${new URLSearchParams(filters as Record<string, string>).toString()}`,
          params,
        ),
        undefined,
        true,
      ),

    /**
     * `GET /payment?status=PENDING` - a contagem confiável vem de
     * `meta.total`; somar valor exige percorrer a página devolvida.
     */
    findByStatus: (status: PaymentStatus, params?: PaginationParams) =>
      apiRequest<PaginatedResponse<Payment>>(
        "GET",
        withPagination(`/payment?status=${status}`, params),
        undefined,
        true,
      ),

    findByMethod: (paymentMethod: PaymentMethod, params?: PaginationParams) =>
      apiRequest<PaginatedResponse<Payment>>(
        "GET",
        withPagination(
          `/payment/filter/by-method?paymentMethod=${paymentMethod}`,
          params,
        ),
        undefined,
        true,
      ),

    findByDateRange: (
      startDate: string,
      endDate: string,
      customerId?: string,
      params?: PaginationParams,
    ) =>
      apiRequest<PaginatedResponse<Payment>>(
        "GET",
        withPagination(
          `/payment/filter/by-date?startDate=${startDate}&endDate=${endDate}${customerId ? `&customerId=${customerId}` : ""}`,
          params,
        ),
        undefined,
        true,
      ),

    // Aprovar/rejeitar/estornar passam por /financial/... - as rotas
    // equivalentes em /payment/... são legadas e agora restritas no backend
    // para evitar bypass de regra de negócio (ver financial.md).
    approve: (id: string, transaction?: string) =>
      apiRequest<Payment>(
        "PATCH",
        `/financial/payment/${id}/approve`,
        transaction ? { transaction } : undefined,
        true,
      ),

    reject: (id: string) =>
      apiRequest<Payment>(
        "PATCH",
        `/financial/payment/${id}/reject`,
        undefined,
        true,
      ),

    update: (id: string, paymentData: UpdatePaymentRequest) =>
      apiRequest<Payment>("PATCH", `/payment/${id}`, paymentData, true),
    delete: (id: string) =>
      apiRequest<Payment>("DELETE", `/payment/${id}`, undefined, true),
    financialRefund: (id: string) =>
      apiRequest<Payment>(
        "PATCH",
        `/financial/payment/${id}/refund`,
        undefined,
        true,
      ),
  },

  // Delivery endpoints
  deliveries: {
    getAll: () => apiRequest<Delivery[]>("GET", "/delivery", undefined, true),

    getById: (id: string) =>
      apiRequest<Delivery>("GET", `/delivery/${id}`, undefined, true),

    create: (deliveryData: CreateDeliveryRequest) =>
      apiRequest<Delivery>("POST", "/delivery", deliveryData, true),

    /**
     * `coords` é a posição atual do ENTREGADOR, não do endereço de entrega.
     *
     * Obrigatória no aceite (status ACCEPTED): o backend recusa sem ela,
     * porque é a origem do cálculo de frete. Os outros avanços de status
     * (PICKED_UP, DELIVERED) não pedem e chamam sem o parâmetro.
     *
     * Os nomes são `lat`/`lng`, iguais aos do gateway de rastreamento - e
     * NÃO `latitude`/`longitude` como no DTO de Address. Mandar
     * `latitude` derruba a rota com 400 "property latitude should not
     * exist": o ValidationPipe deste backend roda com
     * `forbidNonWhitelisted`, então campo fora do DTO é erro, não é
     * ignorado. Nada de acrescentar campo "por garantia" aqui.
     */
    updateStatus: (
      id: string,
      status: string,
      coords?: { lat: number; lng: number },
    ) =>
      apiRequest<Delivery>(
        "PATCH",
        `/delivery/${id}/status`,
        {
          status,
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        },
        true,
      ),

    /**
     * Entregador desiste de uma entrega aceita, antes da coleta: ela volta
     * para PENDING, sem entregador, e fica disponível para outro (delivery.md,
     * "Devolver entrega ao pool"). `returnReason` é obrigatório e fica para
     * auditoria - não usar `cancelReason` aqui.
     *
     * É o que o entregador faz. Cancelar (abaixo) encerra a entrega de vez e
     * não é ação dele - e a rota de cancelamento respondeu 404 no teste da
     * LDMF-279.
     */
    returnToPool: (id: string, returnReason: string) =>
      apiRequest<Delivery>(
        "PATCH",
        `/delivery/${id}/status`,
        { status: "PENDING", returnReason },
        true,
      ),

    cancel: (id: string, reason: string, observations?: string) =>
      apiRequest<Delivery>(
        "PATCH",
        `/delivery/${id}/cancel`,
        { reason, ...(observations ? { observations } : {}) },
        true,
      ),

    // Customer endpoints (authenticated)
    getCustomerDeliveries: () =>
      apiRequest<Delivery[]>("GET", "/delivery/customer/me", undefined, true),

    getCustomerDeliveriesByStatus: (status: string) =>
      apiRequest<Delivery[]>(
        "GET",
        `/delivery/customer/me/status/${status}`,
        undefined,
        true,
      ),

    getCustomerDeliveryById: (id: string) =>
      apiRequest<Delivery>(
        "GET",
        `/delivery/customer/me/${id}`,
        undefined,
        true,
      ),

    // Company endpoints (authenticated)
    getCompanyDeliveries: () =>
      apiRequest<Delivery[]>("GET", "/delivery/company", undefined, true),

    getCompanyDeliveriesByStatus: (status: string) =>
      apiRequest<Delivery[]>(
        "GET",
        `/delivery/company/status/${status}`,
        undefined,
        true,
      ),

    // Calculate delivery cost
    calculateDeliveryCost: (deliveryId: string) =>
      apiRequest<{ cost: number }>(
        "GET",
        `/delivery/${deliveryId}/calculate`,
        undefined,
        true,
      ),

    // Delivery-person endpoints (authenticated, role delivery)
    /**
     * Devolve PENDING (disponíveis pra aceitar) + as próprias, qualquer
     * status, com `order.company`, `order.customer` e `order.payments`
     * aninhados.
     *
     * Rota paginada: responde no envelope `{ data, meta }`, aceita `page` e
     * `limit` (default 20, máximo 100). O tipo admite os dois formatos de
     * propósito - `apiRequest` não desembrulha envelope (ver
     * PaginatedResponse), então quem consome passa por `toPaginated`, que
     * normaliza envelope e array cru no mesmo `{ items, meta }`. Ler
     * `response.data` direto como array é o que quebra a tela quando o
     * backend manda o envelope.
     */
    getMyDeliveries: (params?: PaginationParams) =>
      apiRequest<PaginatedResponse<Delivery> | Delivery[]>(
        "GET",
        withPagination("/delivery/delivery-person/me", params),
        undefined,
        true,
      ),

    getMyDeliveriesByStatus: (status: string) =>
      apiRequest<Delivery[]>(
        "GET",
        `/delivery/delivery-person/me/status/${status}`,
        undefined,
        true,
      ),
  },
  // Cash Movement endpoints
  cashMovement: {
    getSummary: () =>
      apiRequest<CashMovementSummary>(
        "GET",
        "/cash-movement/summary/current",
        undefined,
        true,
      ),

    /**
     * Extrato paginado de movimentos - todos os filtros são opcionais.
     * Ex: /cash-movement?page=1&limit=20&type=SALE&paymentMethod=PIX
     */
    list: (params?: CashMovementListParams) =>
      apiRequest<PaginatedResponse<CashMovement>>(
        "GET",
        withCashMovementFilters("/cash-movement", params),
        undefined,
        true,
      ),
    withdrawal: (data: CashWithdrawalRequest) =>
      apiRequest<CashMovement>("POST", "/cash-movement/withdrawal", data, true),
    deposit: (data: CashDepositRequest) =>
      apiRequest<CashMovement>("POST", "/cash-movement/deposit", data, true),
    sale: (data: CashSaleRequest) =>
      apiRequest<CashMovement>("POST", "/cash-movement/sale", data, true),
    refund: (data: CashRefundRequest) =>
      apiRequest<CashMovement>("POST", "/cash-movement/refund", data, true),
  },
  // Cash Register endpoints
  cashRegister: {
    getCurrentOpen: () =>
      apiRequest<CashRegister>(
        "GET",
        "/cash-register/open/current",
        undefined,
        true,
      ),
    open: (data: OpenCashRegisterRequest) =>
      apiRequest<CashRegister>("POST", "/cash-register/open", data, true),
    close: (data: CloseCashRegisterRequest) =>
      apiRequest<CashRegister>("POST", "/cash-register/close", data, true),
  },
  // Reports endpoints
  reports: {
    getSummary: (params?: ReportsParams) => {
      const query = params
        ? "?" +
        new URLSearchParams(
          Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined),
          ) as Record<string, string>,
        ).toString()
        : "";
      return apiRequest<ReportsSummary>(
        "GET",
        `/reports${query}`,
        undefined,
        true,
      );
    },
  },
};
