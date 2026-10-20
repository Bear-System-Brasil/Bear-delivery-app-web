/**
 * Funções auxiliares para autenticação e autorização
 * 
 * NOTA: Estas funções são legadas e mantidas para compatibilidade.
 * Para novos códigos, use diretamente o useAuthStore do Zustand.
 */

import { ROLE_LABELS, USER_ROLES, hasRoutePermission } from "./permissions";
import { STORAGE_KEYS, storageManager } from "./storage-manager";
import type { User } from "@/stores/auth-store";

interface PersistedAuthState {
  state?: {
    token?: string;
    user?: User;
  };
}

/**
 * Verifica se há um token válido
 * @deprecated Use useAuthStore ao invés disso
 */
export function hasValidToken(): boolean {
  if (typeof window === "undefined") return false;

  // Tentar pegar do novo formato (Zustand)
  const authData = storageManager.local.get<PersistedAuthState>(STORAGE_KEYS.AUTH);
  if (authData?.state?.token) {
    return !!authData.state.token && authData.state.token.length > 0;
  }

  // Fallback para formato legado
  const legacyToken = storageManager.local.get<string>(STORAGE_KEYS.LEGACY_TOKEN);
  return !!legacyToken && legacyToken.length > 0;
}

/**
 * Recupera o usuário
 * @deprecated Use useAuthStore ao invés disso
 */
export function getStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    // Tentar pegar do novo formato (Zustand)
    const authData = storageManager.local.get<PersistedAuthState>(STORAGE_KEYS.AUTH);
    if (authData?.state?.user) {
      return authData.state.user;
    }

    // Fallback para formato legado
    const legacyUser = storageManager.local.get<User>(STORAGE_KEYS.LEGACY_USER);
    return legacyUser;
  } catch (error) {
    console.error("Erro ao recuperar usuário:", error);
    return null;
  }
}

/**
 * Save user data
 * @deprecated Use useAuthStore.login() instead — this is a no-op to prevent legacy double-writes
 */
export function saveUser(_user: User) {
  // No-op: legacy function kept for API compatibility.
  // Auth data is managed exclusively by Zustand auth-store.
}

/**
 * Save authentication token
 * @deprecated Use useAuthStore.login() instead — this is a no-op to prevent legacy double-writes
 */
export function saveToken(_token: string) {
  // No-op: legacy function kept for API compatibility.
  // Auth data is managed exclusively by Zustand auth-store.
}

/**
 * Remove dados de autenticação
 * @deprecated Use useAuthStore.logout() ao invés disso
 */
export function clearAuth() {
  if (typeof window === "undefined") return;

  storageManager.utils.clearAuth();
}

/**
 * Verifica se o usuário tem permissão para uma rota específica
 */
export function canAccessRoute(route: string): boolean {
  const user = getStoredUser();
  if (!user || !user.role) return false;

  return hasRoutePermission(route, user.role);
}

/**
 * Verifica se o usuário tem uma das roles especificadas
 */
export function hasAnyRole(allowedRoles: string[]): boolean {
  const user = getStoredUser();
  if (!user || !user.role) return false;

  return allowedRoles.includes(user.role);
}

/**
 * Retorna o nome amigável do role do usuário
 */
export function getUserRoleLabel(): string {
  const user = getStoredUser();
  if (!user || !user.role) return "Visitante";

  return ROLE_LABELS[user.role] || "Usuário";
}

/**
 * Verifica se o usuário é staff do restaurante (owner, admin, manager)
 */
export function isRestaurantStaff(): boolean {
  return hasAnyRole([USER_ROLES.OWNER, USER_ROLES.ADMIN, USER_ROLES.MANAGER]);
}

/**
 * Verifica se o usuário é cliente
 */
export function isClient(): boolean {
  return hasAnyRole([USER_ROLES.CLIENT]);
}

/**
 * Verifica se o usuário é dono
 */
export function isOwner(): boolean {
  return hasAnyRole([USER_ROLES.OWNER]);
}

/**
 * Verifica se o usuário é admin
 */
export function isAdmin(): boolean {
  return hasAnyRole([USER_ROLES.ADMIN]);
}
