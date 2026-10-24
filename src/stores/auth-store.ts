import type { RawAuthUser } from "@/services/api";
import { isCompanyStaffRole } from "@/utils/role-helpers";
import { STORAGE_KEYS } from "@/utils/storage-manager";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface User {
  id: string;
  name: string;
  email: string;
  cpf: string;
  phone: string;
  birthDate: string;
  role: string;
  companyId?: string;
  photoUrl?: string;
  tradeName?: string;
  legalName?: string;
  cnpj?: string;
  logo_url?: string;
  cover_url?: string;
  /**
   * Indicador de CPF vindo do back (LDMF-362). O back não devolve mais o
   * número; sem o indicador, a conta é tratada como sem CPF.
   */
  hasCpf?: boolean;
}

/**
 * Dado pessoal que NÃO vai pro localStorage (LDMF-424). Fica só em memória
 * durante a sessão; no boot, o auth-provider repõe da /session. Sem isto,
 * qualquer script na página lia e-mail, telefone e data de nascimento direto
 * do disco, que não expira.
 */
const SENSITIVE_PERSIST_KEYS = ["email", "phone", "birthDate"] as const;

/**
 * Copia o usuário sem os campos pessoais que não devem ser gravados no
 * localStorage. O usuário em memória continua completo; isto só muda o que o
 * persist escreve no disco.
 */
export function toPersistedUser(user: User | null): Partial<User> | null {
  if (!user) return null;
  const persisted: Partial<User> = { ...user };
  for (const key of SENSITIVE_PERSIST_KEYS) delete persisted[key];
  return persisted;
}

/**
 * Se a conta já tem CPF. Vale o indicador do back; sem ele, só aceita o
 * número de 11 dígitos que sessões antigas ainda guardam no store.
 */
export function userHasCpf(
  user: Pick<User, "cpf" | "hasCpf"> | null | undefined,
) {
  if (!user) return false;
  if (typeof user.hasCpf === "boolean") return user.hasCpf;
  return Boolean(user.cpf && user.cpf.replace(/\D/g, "").length === 11);
}

/**
 * O backend de auth devolve um objeto cru ambíguo (campos de cliente ou de
 * empresa, dependendo da conta) - esta função normaliza pro shape único que
 * o store persiste, escolhendo os campos certos conforme a `role`.
 */
export function normalizeAuthUser(raw: RawAuthUser): User {
  const role = raw.role || "client";
  // Mesma lista de staff do resto do app: a cópia local que existia aqui
  // ficou sem `financial`, que era normalizado com campos de cliente.
  const isCompanyUser = isCompanyStaffRole(role);

  if (isCompanyUser) {
    return {
      id: raw.id,
      name: raw.tradeName || raw.legalName || raw.name || "Empresa",
      email: raw.email,
      cpf: raw.cnpj || raw.cpf || "",
      phone: raw.phone || "",
      birthDate: raw.birthDate || "",
      role,
      companyId: raw.companyId || undefined,
      photoUrl: raw.photoUrl || raw.logo_url,
      tradeName: raw.tradeName,
      legalName: raw.legalName,
      cnpj: raw.cnpj,
      logo_url: raw.logo_url,
    };
  }

  return {
    id: raw.id,
    name: raw.name || "",
    email: raw.email,
    cpf: raw.cpf || "",
    phone: raw.phone || "",
    birthDate: raw.birthDate || "",
    role,
    companyId: raw.companyId || undefined,
    photoUrl: raw.photoUrl,
    hasCpf: typeof raw.hasCpf === "boolean" ? raw.hasCpf : undefined,
  };
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  _hasHydrated: boolean;
  // Actions
  login: (user: User) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        _hasHydrated: false,

        login: (user) =>
          set(
            {
              user,
              isAuthenticated: true,
              isLoading: false,
            },
            false,
            "auth/login",
          ),

        logout: () =>
          set(
            {
              user: null,
              isAuthenticated: false,
              isLoading: false,
            },
            false,
            "auth/logout",
          ),

        updateUser: (updatedUser) =>
          set(
            (state) => ({
              user: state.user ? { ...state.user, ...updatedUser } : null,
            }),
            false,
            "auth/updateUser",
          ),

        setLoading: (loading) =>
          set({ isLoading: loading }, false, "auth/setLoading"),

        setHasHydrated: (state) =>
          set({ _hasHydrated: state }, false, "auth/setHasHydrated"),
      }),
      {
        name: STORAGE_KEYS.AUTH,
        version: 2,
        partialize: (state) => ({
          // Nunca grava e-mail/telefone/nascimento no disco (LDMF-424).
          user: toPersistedUser(state.user) as User | null,
          isAuthenticated: state.isAuthenticated,
        }),
        // v1 guardava e-mail/telefone/nascimento no localStorage. Remove ao
        // migrar pra não deixar o dado pessoal antigo parado no navegador.
        migrate: (persisted) => {
          const state = persisted as {
            user?: User | null;
            isAuthenticated?: boolean;
          };
          return {
            ...state,
            user: toPersistedUser(state.user ?? null) as User | null,
          };
        },
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
    { name: "auth-store", enabled: process.env.NODE_ENV !== "production" },
  ),
);
