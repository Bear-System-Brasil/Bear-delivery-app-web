"use client";

/**
 * Previa do app do cliente no admin (LDMF-454).
 *
 * No celular ocupa a tela toda; no PC abre centralizada numa moldura de
 * celular, na largura real do app, em vez de uma gaveta larga colada na
 * direita. Os cards sao os mesmos do cliente (MenuItemsList), read-only.
 *
 * O fechar fica no proprio cabecalho: o X padrao dos dialogos ficava por
 * baixo do cabecalho fixo e, no celular, nao havia como sair.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Eye, X } from "lucide-react";
import { useState } from "react";
import { MenuItemsList } from "@/components/menu-items-list";
import { cn } from "@/lib/utils";
import type { Product } from "@/services/api";

interface MenuAppPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  groupedItems: Record<string, Product[]>;
  onSelectItem?: (item: Product) => void;
}

export function MenuAppPreview({
  open,
  onOpenChange,
  categories,
  groupedItems,
  onSelectItem,
}: MenuAppPreviewProps) {
  const [selectedCategory, setSelectedCategory] = useState("");

  const listCategories =
    selectedCategory && categories.includes(selectedCategory)
      ? [selectedCategory]
      : categories;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background shadow-2xl focus:outline-none",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            // PC: moldura de celular centralizada, na largura do app.
            "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(780px,calc(100dvh-3rem))] sm:w-[390px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[40px] sm:border-[10px] sm:border-zinc-900 dark:sm:border-zinc-700",
          )}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border bg-background px-4 py-3.5 sm:px-5 sm:pt-5">
            <div className="min-w-0 flex-1 space-y-0.5">
              <DialogPrimitive.Title className="flex items-center gap-2 text-[15px] font-extrabold text-foreground">
                <Eye className="h-4 w-4 text-muted-foreground" />
                Prévia no app
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-[12px] font-semibold text-muted-foreground">
                Como o cliente vê o seu cardápio. Toque num prato pra abrir a
                visão do cliente.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Fechar prévia"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-border bg-card text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {categories.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted px-3 py-6 text-center text-[12px] font-semibold text-muted-foreground">
                Cadastre pratos disponíveis pra ver a prévia do app.
              </div>
            ) : (
              <>
                {/* Abas navegaveis: filtram a previa por categoria. */}
                <div className="flex flex-wrap gap-1.5">
                  {["", ...categories].map((category) => (
                    <button
                      key={category || "todos"}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                        selectedCategory === category
                          ? "bg-zinc-900 text-white"
                          : "border border-border bg-card text-foreground hover:bg-muted",
                      )}
                    >
                      {category || "Todos"}
                    </button>
                  ))}
                </div>

                <MenuItemsList
                  className="mt-4"
                  categories={listCategories}
                  groupedItems={groupedItems}
                  onSelectItem={onSelectItem}
                  mobileLayout
                />
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
