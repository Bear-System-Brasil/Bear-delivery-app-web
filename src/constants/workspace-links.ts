import {
  Bike,
  ChefHat,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Areas de trabalho do menu, por role.
 *
 * Era um slot unico por role: owner via "Gestao", cook via "Cozinha", e por
 * ai. Isso serve para quem faz uma coisa so, e nao para quem faz tudo - o
 * primeiro cliente e uma pessoa so, que e dono, cozinheiro e entregador, e
 * enxergava apenas Gestao.
 *
 * Quem administra o restaurante (owner, admin, manager) passa a ver as areas
 * do restaurante; as demais roles continuam com a sua. Nada de tela nova: sao
 * as mesmas rotas que as outras roles ja usam.
 *
 * Entregas fica de fora da gerencia (LDMF-324): a tela lista as entregas do
 * entregador logado, e a gerencia nao pega entrega por ela.
 *
 * A lista tem de ser subconjunto do que a role alcanca em ROUTE_PERMISSIONS e
 * no middleware - item apontando pra rota negada leva direto pro "Acesso
 * Negado". `src/utils/permissions.test.ts` trava esse par.
 */
export interface WorkspaceLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

const MANAGEMENT: WorkspaceLink = {
  label: "Gestão",
  href: "/menu-management",
  icon: Store,
};

const KITCHEN: WorkspaceLink = {
  label: "Cozinha",
  href: "/kitchen",
  icon: ChefHat,
};

const DELIVERIES: WorkspaceLink = {
  label: "Entregas",
  href: "/delivery-dashboard",
  icon: Bike,
};

const FINANCIAL: WorkspaceLink = {
  label: "Financeiro",
  href: "/financial-management/dashboard",
  icon: Wallet,
};

/**
 * Ordem importa: o primeiro item e o destino do slot unico da barra inferior
 * (ver `getPrimaryWorkspaceLink`), entao cada role comeca pela area onde ela
 * de fato trabalha.
 */
const MANAGEMENT_AREAS: WorkspaceLink[] = [MANAGEMENT, KITCHEN, FINANCIAL];

export const WORKSPACE_LINKS_BY_ROLE: Record<string, WorkspaceLink[]> = {
  owner: MANAGEMENT_AREAS,
  admin: MANAGEMENT_AREAS,
  manager: MANAGEMENT_AREAS,
  cook: [KITCHEN],
  delivery: [DELIVERIES],
  financial: [FINANCIAL],
};

/**
 * Areas que a role enxerga no menu. Role fora do mapa (ex.: client) devolve
 * lista vazia, e o menu nao mostra a secao.
 */
export function getWorkspaceLinks(role?: string): WorkspaceLink[] {
  if (!role) return [];
  return WORKSPACE_LINKS_BY_ROLE[role] ?? [];
}

/**
 * Area principal da role - a primeira da lista.
 *
 * Existe para a barra inferior do mobile, que tem tres colunas (Inicio, area,
 * Perfil) e nao comporta cinco destinos. Quem faz tudo alcanca as demais pelo
 * menu do cabecalho, que e uma lista vertical.
 */
export function getPrimaryWorkspaceLink(role?: string): WorkspaceLink | null {
  return getWorkspaceLinks(role)[0] ?? null;
}
