"use client";

import AuthModal from "@/components/auth-modal";
import { apiService, type RawAuthUser } from "@/services/api";
import { normalizeAuthUser, useAuthStore, type User } from "@/stores/auth-store";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  showAuthModal: (tab?: "login" | "register") => void;
  hideAuthModal: () => void;
  login: (userData?: RawAuthUser) => void;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  hasPermission: (allowedRoles: string[]) => boolean;
  isOwner: () => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  isClient: () => boolean;
  isRestaurantStaff: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">(
    "login",
  );

  // Usar Zustand store como fonte única da verdade
  const authStore = useAuthStore();
  const storeLogout = useAuthStore((s) => s.logout);

  // Listen for 401 unauthorized events from API layer
  useEffect(() => {
    const handleUnauthorized = () => {
      storeLogout();
      setIsAuthModalOpen(true);
      setAuthModalTab("login");
    };
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, [storeLogout]);

  // O cookie httpOnly (não o localStorage) é a fonte da verdade da sessão.
  // No boot, confirma com o BFF se ainda é válida - evita ficar "logado"
  // no client com um cookie expirado/removido em outro lugar.
  useEffect(() => {
    let cancelled = false;

    apiService.getSession().then(({ authenticated, user }) => {
      if (cancelled) return;

      // `authStore` aqui é o snapshot do render em que este efeito rodou
      // (deps: []) - ler `.isAuthenticated` dele checaria sempre o valor do
      // boot, não o atual. Se o usuário logar pelo modal enquanto esse
      // fetch ainda está em voo, essa leitura desatualizada não veria o
      // login e sobrescreveria o dado rico recém-salvo pelo mais pobre do
      // /user/me. `getState()` lê o estado ao vivo no momento em que a
      // promise resolve.
      const currentlyAuthenticated = useAuthStore.getState().isAuthenticated;

      if (authenticated && user) {
        // Só preenche se ainda não tem usuário local: o /user/me devolve um
        // shape mais pobre que o persistido no login (sem tradeName/logo da
        // empresa) - não queremos substituir dado rico por um mais pobre.
        if (!currentlyAuthenticated) {
          authStore.login(normalizeAuthUser(user));
        }
      } else if (currentlyAuthenticated) {
        storeLogout();
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showAuthModal = (tab: "login" | "register" = "login") => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const hideAuthModal = () => setIsAuthModalOpen(false);

  const login = (userData?: RawAuthUser) => {
    if (userData) {
      // Sessão já foi criada via cookie httpOnly pelo BFF (/api/auth/login
      // ou /api/auth/register) - aqui só sincroniza o Zustand com os dados
      // do usuário.
      authStore.login(normalizeAuthUser(userData));
      hideAuthModal();
    }
  };

  const logout = () => {
    // Limpa o Zustand já pra UI reagir na hora, e derruba o cookie httpOnly
    // no servidor - sem isso a sessão continua válida (proxy e middleware
    // seguem autenticando com o cookie antigo).
    authStore.logout();
    void apiService.logout();
  };

  const updateUser = (userData: Partial<User>) => {
    authStore.updateUser(userData);
  };

  const hasPermission = (allowedRoles: string[]): boolean => {
    if (!authStore.isAuthenticated || !authStore.user) return false;
    return allowedRoles.includes(authStore.user.role);
  };

  const isOwner = (): boolean => {
    return authStore.user?.role === "owner";
  };

  const isAdmin = (): boolean => {
    return authStore.user?.role === "admin";
  };

  const isManager = (): boolean => {
    return authStore.user?.role === "manager";
  };

  const isClient = (): boolean => {
    return authStore.user?.role === "client";
  };

  const isRestaurantStaff = (): boolean => {
    return hasPermission(["owner", "admin", "manager", "cook", "financial"]);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: authStore.isAuthenticated,
        user: authStore.user,
        showAuthModal,
        hideAuthModal,
        login,
        logout,
        updateUser,
        hasPermission,
        isOwner,
        isAdmin,
        isManager,
        isClient,
        isRestaurantStaff,
      }}
    >
      {children}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={hideAuthModal}
        onAuthSuccess={(userData) => login(userData)}
        defaultTab={authModalTab}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
