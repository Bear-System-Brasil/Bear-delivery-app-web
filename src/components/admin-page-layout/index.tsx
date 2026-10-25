"use client";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { RoleBadge } from "@/components/role-badge";
import Sidebar from "@/components/sidebar-menu-management";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CircleHelp, Menu, RefreshCw, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

/**
 * O botão único do header. Na maioria das telas é o "Atualizar"; o que muda
 * por tela é o rótulo, o ícone e a ação (em Configurações vira "Restaurar
 * padrão"). Ações que não cabem aqui (criar, buscar, filtrar) ficam no corpo.
 */
export interface AdminHeaderAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Em andamento: gira o ícone e troca o rótulo por busyLabel. */
  busy?: boolean;
  busyLabel?: string;
}

interface AdminPageLayoutProps {
  title: string;
  icon: LucideIcon;
  subtitle?: string;
  action?: AdminHeaderAction;
  /**
   * @deprecated Transição do LDMF-392: as telas migram para `action` (botão
   * único) e o resto desce pro corpo (LDMF-393). Sai ao fim da migração.
   */
  actions?: ReactNode;
  /** Conteúdo do modal de Ajuda. Sem ele, o modal mostra o aviso padrão. */
  help?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
}

const headerButtonClass =
  "flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] border border-border bg-card text-xs font-bold text-brand-500 transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-brand-950/40";

export function AdminPageLayout({
  title,
  icon: Icon,
  subtitle,
  action,
  actions,
  help,
  children,
  mainClassName,
}: AdminPageLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const ActionIcon = action?.icon ?? RefreshCw;
  const actionLabel =
    action?.busy && action.busyLabel ? action.busyLabel : action?.label;

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-screen flex-col bg-muted text-foreground">
        <header className="sticky top-0 z-10 border-b bg-card print:hidden lg:pl-64">
          {/* Uma linha só em todas as larguras: o botão da tela vira só
              ícone no mobile, pra não empurrar o sino pra baixo. */}
          <div
            className={cn(
              "flex min-h-[52px] items-center justify-between gap-2 p-3 sm:gap-3",
              // Transição: telas que ainda passam `actions` mantêm o layout
              // antigo (empilha no mobile) até migrarem.
              actions && "flex-col items-stretch sm:flex-row sm:items-center",
            )}
          >
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen((open) => !open)}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card shadow-sm transition-colors hover:bg-muted lg:hidden"
                aria-label="Abrir menu lateral"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="flex min-w-0 items-center gap-2">
                <Icon className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  {/* Quebra em até 2 linhas em vez de truncar: no mobile
                      truncar virava "Co…". */}
                  <h1 className="line-clamp-2 bg-linear-to-r from-brand-500 to-brand-500 bg-clip-text text-base leading-tight font-bold break-words text-transparent sm:text-lg">
                    {title}
                  </h1>
                  {subtitle && (
                    <p className="truncate text-[11.5px] leading-snug font-medium text-muted-foreground sm:text-xs">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div
              className={cn(
                "flex items-center gap-2",
                actions ? "w-full flex-wrap justify-end sm:w-auto" : "shrink-0",
              )}
            >
              {actions}
              {action && (
                <button
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled || action.busy}
                  aria-label={actionLabel}
                  title={actionLabel}
                  className={cn(headerButtonClass, "w-9 sm:w-auto sm:px-3.5")}
                >
                  <ActionIcon
                    className={cn("h-3.5 w-3.5", action.busy && "animate-spin")}
                  />
                  <span className="hidden sm:inline">{actionLabel}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                aria-label="Ajuda sobre esta página"
                title="Ajuda"
                className={cn(headerButtonClass, "w-9")}
              >
                <CircleHelp className="h-4 w-4" />
              </button>
              {/* No mobile o papel aparece no menu lateral, pra não disputar
                  a linha com o título. */}
              <RoleBadge className="hidden sm:inline-flex" />
              <NotificationBell audience="management" />
            </div>
          </div>
        </header>

        <main className={cn("flex-1 pb-20 md:pb-10 lg:pl-64", mainClassName)}>
          {children}
        </main>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuda: {title}</DialogTitle>
            <DialogDescription>Como esta página funciona.</DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {help ?? "O guia desta página ainda está sendo preparado."}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
