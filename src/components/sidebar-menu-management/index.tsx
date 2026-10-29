"use client";

import { cn } from "@/lib/utils";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  Bike,
  ChefHat,
  ClipboardList,
  House,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Settings,
  TrendingUp,
  User,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-provider";
import { RoleBadge } from "@/components/role-badge";
import { BearDeliveryLogo } from "../ui/bear-delivery-logo";


type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

type NavLink = {
  href: string;
  label: string;
  icon: typeof House;
  /**
   * Sem role = visível para qualquer usuário autenticado.
   *
   * Isto é visibilidade de menu, não autorização: quem decide o acesso é o
   * ROUTE_PERMISSIONS + middleware. A lista aqui é subconjunto do que a role
   * pode abrir - nunca deve listar rota que ela não acessa, senão o item
   * leva direto pro "Acesso Negado".
   */
  roles?: string[];
};

const navGroups: { label: string; links: NavLink[] }[] = [
  {
    label: "Gestão",
    links: [
      {
        href: "/menu-management",
        label: "Cardápio",
        icon: UtensilsCrossed,
        roles: ["owner", "admin", "manager"],
      },
      {
        href: "/category-management",
        label: "Categorias",
        icon: LayoutGrid,
        roles: ["owner", "admin", "manager"],
      },
      {
        href: "/kitchen",
        label: "Cozinha",
        icon: ChefHat,
        roles: ["owner", "admin", "manager", "cook"],
      },
      // Operacao do dia a dia, junto de Pedidos e Cozinha - nao categoria
      // propria. Sem este item, quem administra o restaurante estava em
      // /menu-management e nao tinha caminho direto pra area de entregas: no
      // desktop a BottomBar e `md:hidden`, entao era voltar ao Inicio pelo
      // logo e abrir o menu do app.
      {
        href: "/delivery-dashboard",
        label: "Entregas",
        icon: Bike,
        roles: ["owner", "admin", "manager", "delivery"],
      },
      {
        href: "/team-management",
        label: "Equipe",
        icon: UserCog,
        roles: ["owner", "admin", "manager"],
      },
    ],
  },
  {
    label: "Financeiro",
    links: [
      {
        href: "/financial-management/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["owner", "admin", "manager", "financial"],
      },
      {
        href: "/financial-management/finance",
        label: "Finanças",
        icon: TrendingUp,
        roles: ["owner", "admin", "manager", "financial"],
      },
      {
        href: "/financial-management/cash-register",
        label: "Caixa",
        icon: Wallet,
        roles: ["owner", "admin", "manager", "financial"],
      },
      {
        href: "/financial-management/orders",
        label: "Pedidos",
        icon: ClipboardList,
        roles: ["owner", "admin", "manager", "financial"],
      },
      {
        href: "/financial-management/customers",
        label: "Clientes",
        icon: Users,
        roles: ["owner", "admin", "manager", "financial"],
      },
      // Preferencias de quem usa a area, e nao cadastro da empresa: o
      // ROUTE_PERMISSIONS sempre liberou a tela pro financeiro, e so o link
      // ficava escondido dele - acesso sem caminho.
      {
        href: "/financial-management/settings",
        label: "Configurações",
        icon: Settings,
        roles: ["owner", "admin", "financial"],
      },
    ],
  },
  {
    label: "Conta",
    links: [
      {
        href: "/company-profile",
        label: "Perfil da Empresa",
        icon: User,
        roles: ["owner", "admin"],
      },
      {
        href: "/profile",
        label: "Perfil",
        icon: User,
        roles: ["manager", "cook", "delivery", "financial", "client"],
      },
    ],
  },
];

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const handleLogout = () => {
    logout();
    router.push("/");
    onClose?.();
  };

  // Sem role carregada ainda (SSR/primeira hidratação): não mostra nada que
  // dependa de permissão, só o que é livre para qualquer autenticado.
  const canSee = (link: NavLink) => !link.roles || (!!user?.role && link.roles.includes(user.role));

  const visibleGroups = navGroups
    .map((group) => ({ ...group, links: group.links.filter(canSee) }))
    .filter((group) => group.links.length > 0);

  return (
    <div className="flex h-full flex-col bg-card text-foreground">
      <div className="flex shrink-0 items-center justify-between px-[18px] py-4">
        <Link href="/" className="flex min-w-0 items-center shrink-0">
          <BearDeliveryLogo />
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
        {visibleGroups.map((group) => (
          <div key={group.label} className="mt-4 first:mt-3">
            <p className="mb-2 px-3 text-[10.5px] font-extrabold uppercase tracking-normal text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-1.5">
              {group.links.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onClose}
                    className={cn(
                      "flex h-[38px] items-center gap-[11px] rounded-[14px] px-3 text-[13px] font-semibold transition-colors",
                      // Ativo em fundo claro com texto laranja: o laranja
                      // cheio fica pros botões de ação.
                      active
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active
                          ? "text-brand-600 dark:text-brand-300"
                          : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Sair discreto, na mesma linha da versão. Abaixo de sm o header
          cede a linha ao título e não mostra o papel; ele vem pra cá. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <button
          type="button"
          onClick={handleLogout}
          className="flex h-[38px] cursor-pointer items-center gap-2 rounded-[10px] px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sair</span>
        </button>
        <div className="flex min-w-0 items-center gap-2 text-[10.5px] font-semibold text-muted-foreground">
          <RoleBadge className="py-0 text-[10.5px] sm:hidden" />
          <span>v1.0.0</span>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (isDesktop) {
    return (
      <aside className="fixed left-0 top-0 z-40 h-full w-sidebar border-r border-border bg-card">
        <SidebarContent />
      </aside>
    );
  }

  return (
    <SheetPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/50",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <SheetPrimitive.Content
          className={cn(
            "fixed left-0 top-0 z-50 h-full w-sidebar border-r border-border bg-card shadow-lg",
            "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-left-8 data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:slide-out-to-left-8 data-[state=closed]:duration-200",
          )}
        >
          <SheetPrimitive.Title asChild>
            <span className="sr-only">Menu de navegação</span>
          </SheetPrimitive.Title>
          <SidebarContent onClose={onClose} />
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}
