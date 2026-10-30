/**
 * Permission map by route
 * Defines which roles have access to each page
 */

import { CLIENT_ROLES, MANAGEMENT_ROLES } from "./role-helpers";

export const ROUTE_PERMISSIONS: { [key: string]: string[] } = {
  // Public pages (everyone can access)
  "/": ["owner", "admin", "manager", "cook", "delivery", "financial", "client"],
  "/restaurant/[id]": ["owner", "admin", "manager", "cook", "delivery", "financial", "client"],

  // Client & checkout pages
  "/cart": [...CLIENT_ROLES],
  "/checkout": [...CLIENT_ROLES],
  "/orders": [...CLIENT_ROLES],
  "/order-status": [
    ...CLIENT_ROLES,
    "delivery",
    ...MANAGEMENT_ROLES,
    "cook",
    "financial",
  ],

  // Menu management (restaurant)
  "/menu-management": ["owner", "admin", "manager"],
  "/category-management": ["owner", "admin", "manager"],

  // Equipe - mesma trinca da gestao do cardapio. A rota existia so no
  // middleware, e rota nao mapeada aqui e bloqueada por padrao em
  // hasRoutePermission: o link de Equipe no menu lateral funcionava (quem
  // enforce e o middleware, e ele libera), mas qualquer guard de front que
  // lesse este mapa negaria a tela - e e esse o padrao que os layouts de
  // /financial-management e /delivery-dashboard usam.
  "/team-management": ["owner", "admin", "manager"],

  // Kitchen
  "/kitchen": ["owner", "admin", "manager", "cook"],

  // Delivery - so o entregador (LDMF-324). A gerencia entrava aqui, mas a
  // tela lista as entregas do entregador logado e ela nao pega entrega por
  // ali: a tela ficava vazia pra ela.
  "/delivery-dashboard": ["delivery"],

  // Financial management - o role financial enxerga TODAS as telas de
  // /financial-management/*. Tela nova ali dentro entra nesta lista junto
  // com a rota: rota não mapeada é bloqueada por padrão em
  // hasRoutePermission, então esquecer a linha derruba o acesso do
  // financeiro (foi o que aconteceu com /cash-register).
  "/financial-management": ["owner", "admin", "manager", "financial"],
  "/financial-management/dashboard": ["owner", "admin", "manager", "financial"],
  "/financial-management/orders": ["owner", "admin", "manager", "financial"],
  "/financial-management/customers": ["owner", "admin", "manager", "financial"],
  "/financial-management/finance": ["owner", "admin", "manager", "financial"],
  "/financial-management/cash-register": [
    "owner",
    "admin",
    "manager",
    "financial",
  ],
  "/financial-management/settings": ["owner", "admin", "manager", "financial"],

  // Relatórios (GET /reports) - mesma tríade da gestão financeira
  "/reports": ["owner", "admin", "financial"],

  // Company profile (owner and admin)
  "/company-profile": ["owner", "admin"],

  // Profile (all authenticated users)
  "/profile": ["owner", "admin", "manager", "cook", "delivery", "financial", "client"],
};

/**
 * Roles disponíveis no sistema
 */
export const USER_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MANAGER: "manager",
  COOK: "cook",
  DELIVERY: "delivery",
  FINANCIAL: "financial",
  CLIENT: "client",
} as const;

/**
 * Labels amigáveis para os roles
 */
export const ROLE_LABELS: { [key: string]: string } = {
  owner: "Dono",
  admin: "Administrador",
  manager: "Gerente",
  cook: "Cozinheiro",
  delivery: "Entregador",
  financial: "Financeiro",
  client: "Cliente",
};

/**
 * Descrição dos roles
 */
export const ROLE_DESCRIPTIONS: { [key: string]: string } = {
  owner: "Proprietário do restaurante com acesso total",
  admin: "Administrador com acesso a todas as funcionalidades",
  manager: "Gerente com acesso à gestão operacional",
  cook: "Cozinheiro com acesso aos pedidos em produção",
  delivery: "Entregador com acesso aos pedidos para entrega",
  financial: "Financeiro com acesso à gestão financeira",
  client: "Cliente com acesso ao catálogo e pedidos",
};

/**
 * Resolve rotas com segmento dinâmico (ex: `/restaurant/[id]`) contra um
 * pathname real (ex: `/restaurant/abc123`) - `ROUTE_PERMISSIONS` usa a
 * mesma sintaxe de colchetes do App Router, então bater por string exata
 * nunca encontrava essas chaves quando chamado com o pathname de verdade.
 */
function findRolesForDynamicRoute(pathname: string): string[] | undefined {
  const pathSegments = pathname.split("/").filter(Boolean);

  for (const [pattern, roles] of Object.entries(ROUTE_PERMISSIONS)) {
    const patternSegments = pattern.split("/").filter(Boolean);
    if (patternSegments.length !== pathSegments.length) continue;

    const matches = patternSegments.every(
      (segment, i) =>
        (segment.startsWith("[") && segment.endsWith("]")) ||
        segment === pathSegments[i],
    );

    if (matches) return roles;
  }

  return undefined;
}

/**
 * Check if a role has permission to access a route
 */
export function hasRoutePermission(route: string, userRole: string): boolean {
  const allowedRoles =
    ROUTE_PERMISSIONS[route] ?? findRolesForDynamicRoute(route);

  if (!allowedRoles) {
    // If route is not mapped, block for security
    return false;
  }

  return allowedRoles.includes(userRole);
}

/**
 * Retorna as rotas que um role pode acessar
 */
export function getAccessibleRoutes(userRole: string): string[] {
  return Object.entries(ROUTE_PERMISSIONS)
    .filter(([_, roles]) => roles.includes(userRole))
    .map(([route]) => route);
}

/**
 * Verifica se um usuário é dono/admin/gerente (tem acesso administrativo)
 */
export function isRestaurantStaff(userRole: string): boolean {
  return ["owner", "admin", "manager"].includes(userRole);
}

/**
 * Verifica se um usuário é cliente
 */
export function isClient(userRole: string): boolean {
  return userRole === "client";
}
