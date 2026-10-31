"use client";

/**
 * Lista de produtos agrupada por categoria, no visual do cardápio do cliente.
 * Compartilhada entre a tela do cliente (restaurant-info) e a prévia no admin
 * (category-management), pra os cards não divergirem (LDMF-454).
 *
 * Sem `onSelectItem` o componente é read-only: os cards não são clicáveis e o
 * botão "+" some (usado na prévia do admin). Itens indisponíveis sempre
 * aparecem esmaecidos com o selo "Indisponível".
 */
import Image from "next/image";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getImageUrl, slugify } from "@/lib/menu-grouping";
import { cn } from "@/lib/utils";
import type { Product } from "@/services/api";
import { formatCurrency } from "@/utils/format-currency";

interface MenuItemsListProps {
  categories: string[];
  groupedItems: Record<string, Product[]>;
  /** Menor delta de variação por produto, pro "A partir de". */
  minVariationByProduct?: Map<string, number>;
  /** Clique no card/no "+". Ausente = read-only (prévia). */
  onSelectItem?: (item: Product) => void;
  className?: string;
  emptyLabel?: string;
}

export function MenuItemsList({
  categories,
  groupedItems,
  minVariationByProduct,
  onSelectItem,
  className,
  emptyLabel = "Nenhum produto disponível no momento.",
}: MenuItemsListProps) {
  return (
    <section
      aria-label="Itens do cardápio"
      className={cn("space-y-6", className)}
    >
      {categories.length === 0 ? (
        <Card className="border-border bg-card p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            {emptyLabel}
          </p>
        </Card>
      ) : (
        categories.map((category) => {
          const items = groupedItems[category] ?? [];
          return (
            <div
              key={category}
              id={`category-${slugify(category)}`}
              className="scroll-mt-[130px]"
            >
              <h2 className="mb-2 text-sm font-bold text-foreground sm:mb-3 sm:text-base">
                {category}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => {
                  const isAvailable = item.isAvailable !== false;

                  // priceModifier é delta sobre o salePrice, então o menor
                  // total do prato é base + menor delta.
                  const basePrice = Number(item.salePrice || 0);
                  const minVariationModifier = minVariationByProduct?.get(
                    item.id,
                  );
                  const hasSellableVariation =
                    minVariationModifier !== undefined;
                  const displayPrice = hasSellableVariation
                    ? basePrice + minVariationModifier
                    : basePrice;

                  const clickable = isAvailable && !!onSelectItem;

                  return (
                    <Card
                      key={item.id}
                      onClick={
                        clickable ? () => onSelectItem?.(item) : undefined
                      }
                      className={cn(
                        "group flex min-h-[116px] min-w-0 gap-3 overflow-visible rounded-[13px] border border-border bg-card p-3 shadow-sm transition hover:border-border hover:shadow-md",
                        clickable ? "cursor-pointer" : "cursor-default",
                      )}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <h3 className="line-clamp-2 wrap-break-word text-sm font-bold tracking-[-0.01em] text-foreground">
                          {item.name}
                        </h3>

                        {item.description && (
                          <p className="mt-1 line-clamp-2 wrap-break-word text-xs font-medium leading-relaxed text-muted-foreground">
                            {item.description}
                          </p>
                        )}

                        <div className="mt-auto flex items-center gap-2 pt-3">
                          {hasSellableVariation && (
                            <span className="text-xs font-medium text-muted-foreground">
                              A partir de
                            </span>
                          )}
                          <span className="text-[15px] font-extrabold tracking-[-0.02em] text-foreground">
                            {formatCurrency(displayPrice)}
                          </span>
                        </div>
                      </div>

                      <div className="relative h-[92px] w-[92px] shrink-0">
                        <Image
                          width={184}
                          height={184}
                          src={getImageUrl(item)}
                          alt={item.name}
                          className={cn(
                            "h-full w-full rounded-[10px] bg-muted object-cover",
                            !isAvailable && "opacity-60",
                          )}
                        />

                        {!isAvailable ? (
                          <Badge className="absolute inset-x-1 bottom-1 justify-center border-0 bg-black/70 px-1 py-1 text-[10px] text-white">
                            Indisponível
                          </Badge>
                        ) : (
                          onSelectItem && (
                            <Button
                              type="button"
                              size="icon"
                              onClick={(event) => {
                                event.stopPropagation();
                                onSelectItem(item);
                              }}
                              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-lg border-2 border-white bg-brand-500 text-white shadow-md hover:bg-brand-600"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
