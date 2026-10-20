"use client";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { RoleBadge } from "@/components/role-badge";
import Sidebar from "@/components/sidebar-menu-management";
import { cn } from "@/lib/utils";
import { Menu, type LucideIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

interface AdminPageLayoutProps {
  title: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
}

export function AdminPageLayout({
  title,
  icon: Icon,
  actions,
  children,
  mainClassName,
}: AdminPageLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-h-screen flex-col bg-muted text-foreground">
        <header className="sticky top-0 z-10 border-b bg-card print:hidden lg:pl-64">
          <div
            className={cn(
              "flex min-h-[52px] items-center justify-between gap-3 p-3",
              actions &&
                "flex-col items-stretch sm:flex-row sm:items-center",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
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
                <h1 className="truncate bg-linear-to-r from-brand-500 to-brand-500 bg-clip-text text-lg font-bold text-transparent">
                  {title}
                </h1>
              </div>
            </div>

            {/* Com ações, o header empilha no mobile e este grupo vira uma
                linha própria (w-full). Sem ações, ele divide a linha com o
                título: w-full aqui espremia o título até "Co…". */}
            <div
              className={cn(
                "flex flex-wrap items-center justify-end gap-2",
                actions ? "w-full sm:w-auto" : "shrink-0",
              )}
            >
              {actions}
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
    </>
  );
}
