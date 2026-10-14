"use client";

import {
  ClipboardList,
  Home,
  LogIn,
  ShoppingCart,
  Store,
  User,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";

import { useAuth } from "@/contexts/auth-provider";
import { useCartActions } from "@/hooks";
import { useAuthStore } from "@/stores";
import { isBottomBarHidden } from "@/constants/bottom-bar-routes";
import { getPrimaryWorkspaceLink } from "@/constants/workspace-links";
import { getProfileRoute, isCompanyStaffRole } from "@/utils/role-helpers";

type BottomTabId =
  | "home"
  | "cart"
  | "orders"
  | "profile"
  | "management"
  | "login";

interface BottomBarProps {
  activeTab?: BottomTabId;
}

type Tab = {
  id: BottomTabId;
  label: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  badge?: boolean;
  protected?: boolean;
  // Ex: "Entrar" pro visitante anônimo - abre o modal de login no lugar,
  // sem navegar pra rota nenhuma.
  onSelect?: () => void;
};

const managementRoutes = [
  "/menu-management",
  "/category-management",
  "/financial-management",
];

function getActiveTab(pathname: string): BottomTabId {
  if (pathname === "/cart" || pathname.startsWith("/checkout")) return "cart";

  if (pathname.startsWith("/orders") || pathname.startsWith("/order-status")) {
    return "orders";
  }

  if (
    pathname.startsWith("/profile") ||
    pathname.startsWith("/company-profile")
  ) {
    return "profile";
  }

  if (managementRoutes.some((route) => pathname.startsWith(route))) {
    return "management";
  }

  return "home";
}

export function BottomBar({ activeTab }: BottomBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user: authUser, showAuthModal } = useAuth();
  const { user: storeUser, isAuthenticated } = useAuthStore();
  const { totalItems } = useCartActions();
  const [isMounted, setIsMounted] = useState(false);

  const user = storeUser || authUser;
  const isStaff = isCompanyStaffRole(user?.role);
  const currentTab = activeTab || getActiveTab(pathname);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  // Mesma fonte de verdade do padding reservado pelo AppFrame.
  if (isBottomBarHidden(pathname)) {
    return null;
  }

  const clientTabs: Tab[] = [
    { id: "home", label: "Início", icon: Home, href: "/" },
    {
      id: "cart",
      label: "Carrinho",
      icon: ShoppingCart,
      href: "/cart",
      badge: true,
    },
    {
      id: "orders",
      label: "Pedidos",
      icon: ClipboardList,
      href: "/orders",
      protected: true,
    },
    {
      id: "profile",
      label: "Perfil",
      icon: User,
      href: "/profile",
      protected: true,
    },
  ];

  // Os dois destinos saem da role, não de constantes de owner/admin: um
  // financial mandado pra /menu-management ou /company-profile bate em
  // "Acesso Negado", já que o middleware nega as duas.
  //
  // Só a área principal entra aqui. Quem administra o restaurante enxerga
  // cinco áreas, e a barra tem três colunas - as outras ficam no menu do
  // cabeçalho, que é lista vertical e comporta.
  const workspace = getPrimaryWorkspaceLink(user?.role);
  const staffTabs: Tab[] = [
    { id: "home", label: "Início", icon: Home, href: "/" },
    {
      id: "management",
      label: workspace?.label ?? "Gestão",
      icon: workspace?.icon ?? Store,
      href: workspace?.href ?? "/menu-management",
      protected: true,
    },
    {
      id: "profile",
      label: "Perfil",
      icon: User,
      href: getProfileRoute(user?.role),
      protected: true,
    },
  ];

  // Visitante anônimo: mesmas abas de navegação do cliente, menos as que só
  // fazem sentido com conta. "Pedidos" some (não existe pedido sem login) e
  // "Perfil" vira "Entrar", abrindo o login direto (sem navegar/redirecionar)
  // em vez de simular uma aba que só existe pra mandar de volta pro login.
  const guestTabs: Tab[] = clientTabs
    .filter((tab) => tab.id !== "orders")
    .map((tab) =>
      tab.id === "profile"
        ? {
          id: "login" as const,
          label: "Entrar",
          icon: LogIn,
          onSelect: () => showAuthModal("login"),
        }
        : tab,
    );

  const tabs = isStaff ? staffTabs : isAuthenticated ? clientTabs : guestTabs;
  const gridCols = tabs.length === 4 ? "grid-cols-4" : "grid-cols-3";

  const handleNavigate = (tab: Tab) => {
    if (tab.onSelect) {
      tab.onSelect();
      return;
    }

    if (tab.protected && !user) {
      router.push("/?openAuth=true");
      return;
    }

    if (tab.href) router.push(tab.href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className={`grid h-16 ${gridCols}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNavigate(tab)}
              className={`relative flex flex-col items-center justify-center gap-1 transition-all ${isActive ? "text-brand-500" : "text-muted-foreground"
                }`}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.badge && (
                <span className="absolute right-1/4 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
                  {totalItems}
                </span>
              )}

              <Icon
                className={`h-5 w-5 transition-transform ${isActive ? "scale-110" : ""
                  }`}
              />

              <span
                className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"
                  }`}
              >
                {tab.label}
              </span>

              {isActive && (
                <div className="absolute left-1/2 top-0 h-1 w-12 -translate-x-1/2 rounded-b-full bg-brand-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
