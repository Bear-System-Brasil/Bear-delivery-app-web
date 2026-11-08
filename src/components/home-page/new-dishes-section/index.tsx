"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { CustomizeOrder } from "@/components/customize-order/customize-order";
import { useNewDishes } from "@/hooks";
import { cn } from "@/lib/utils";
import type { NewDish } from "@/services/products/new-dishes";
import type { Restaurant, UserLocation } from "@/types/restaurant";

import { NewDishCard, NewDishCardSkeleton } from "./new-dish-card";

type Props = {
  /** Lojas dentro do raio do cliente (mesma lista da seção Lojas). */
  restaurants: Restaurant[];
  location?: UserLocation | null;
  loading: boolean;
  hasUserLocation: boolean;
};

type DishFilterId = "all" | "free-delivery" | "fast" | "promo";

type DishFilter = {
  id: DishFilterId;
  label: string;
  matches: (dish: NewDish) => boolean;
};

const DISH_FILTERS: DishFilter[] = [
  { id: "all", label: "Tudo", matches: () => true },
  {
    id: "free-delivery",
    label: "Entrega grátis",
    matches: (dish) => dish.restaurant.isFreeDelivery,
  },
  {
    id: "fast",
    label: "Até 30 min",
    matches: (dish) =>
      dish.restaurant.deliveryMaxMinutes !== null &&
      dish.restaurant.deliveryMaxMinutes <= 30,
  },
  {
    id: "promo",
    label: "Promoções",
    matches: (dish) => dish.discountPercent > 0,
  },
];

const SKELETON_COUNT = 4;

/**
 * Classes que "furam" o padding lateral da página pro carrossel rolar de
 * borda a borda no celular, mantendo o alinhamento do primeiro card com o
 * resto do conteúdo.
 */
const BLEED_CLASS = "-mx-3 px-3 sm:-mx-4 sm:px-4";

function EmptyState({ message, title }: { message: string; title: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-5 text-center shadow-sm">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{message}</p>
    </div>
  );
}

export function NewDishesSection({
  restaurants,
  location,
  loading,
  hasUserLocation,
}: Props) {
  const { data: dishes = [], isLoading: loadingDishes } = useNewDishes(
    restaurants,
    location,
  );
  const [filter, setFilter] = useState<DishFilterId>("all");
  const [selectedDish, setSelectedDish] = useState<NewDish | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const railRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  // Um chip só aparece quando algum prato tem o dado que ele filtra - hoje
  // a API não manda frete, tempo nem promoção na listagem, então a linha
  // some inteira e volta sozinha quando o backend passar a enviar.
  const availableFilters = useMemo(
    () =>
      DISH_FILTERS.filter(
        (item) => item.id === "all" || dishes.some(item.matches),
      ),
    [dishes],
  );
  const showFilters = availableFilters.length > 1;

  const activeFilter =
    availableFilters.find((item) => item.id === filter) ?? DISH_FILTERS[0];
  const visibleDishes = useMemo(
    () => dishes.filter(activeFilter.matches),
    [dishes, activeFilter],
  );

  const syncPages = useCallback(() => {
    const rail = railRef.current;
    if (!rail || rail.clientWidth === 0) return;

    const count = Math.max(1, Math.ceil(rail.scrollWidth / rail.clientWidth));
    // As setas olham o scroll, não a página: `page` arredonda e fica em 0
    // até passar de meia tela (escondia a seta de voltar no 2º e 3º card) e
    // não chegava à última página no fim (a de avançar nunca sumia).
    // 1px de folga para scroll fracionário.
    const back = rail.scrollLeft > 1;
    const forward = rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 1;

    setPageCount(count);
    // A última página costuma ser parcial: no fim do scroll o arredondamento
    // não chega a ela, então o último ponto nunca acendia.
    setPage(
      forward
        ? Math.min(count - 1, Math.round(rail.scrollLeft / rail.clientWidth))
        : count - 1,
    );
    setCanScrollBack(back);
    setCanScrollForward(forward);
  }, []);

  useEffect(() => {
    syncPages();

    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(syncPages);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [syncPages, visibleDishes.length]);

  const scrollRail = (direction: "left" | "right") => {
    const rail = railRef.current;
    if (!rail) return;
    const amount = rail.clientWidth * 0.8;
    rail.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  const openDish = (dish: NewDish) => {
    setSelectedDish(dish);
    setIsModalOpen(true);
  };

  const isInitialLoading = loading || (loadingDishes && !dishes.length);

  return (
    <section id="novidades" className="scroll-mt-28">
      <div className="mb-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight text-foreground">
            Novidades
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Pratos que acabaram de entrar perto de você
          </p>
        </div>
      </div>

      {showFilters && (
        <div
          className={cn(
            "flex gap-[7px] overflow-x-auto py-2.5 scrollbar-hide",
            BLEED_CLASS,
          )}
        >
          {availableFilters.map((item) => {
            const isActive = item.id === activeFilter.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors",
                  isActive
                    ? "border-orange-500 bg-orange-500 font-bold text-white"
                    : "border-border bg-card font-semibold text-muted-foreground hover:border-orange-200 hover:bg-orange-50 dark:hover:border-orange-800 dark:hover:bg-orange-950/40",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {isInitialLoading ? (
        <div
          className={cn(
            "flex gap-3 overflow-hidden pt-2",
            BLEED_CLASS,
          )}
          aria-busy="true"
        >
          {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <NewDishCardSkeleton key={index} />
          ))}
        </div>
      ) : visibleDishes.length ? (
        <div className="relative">
          <button
            type="button"
            aria-label="Rolar novidades para a esquerda"
            onClick={() => scrollRail("left")}
            className={cn(
              "absolute left-0 top-[75px] z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/80 shadow-md transition-colors hover:bg-card sm:flex",
              !canScrollBack && "sm:hidden",
            )}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div
            ref={railRef}
            onScroll={syncPages}
            className={cn(
              // scroll-px = padding lateral: sem isso o snap encosta o
              // primeiro card na borda da tela, desalinhado do resto da página.
              "flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1.5 pt-2 scrollbar-hide scroll-px-3 sm:scroll-px-4",
              BLEED_CLASS,
            )}
          >
            {visibleDishes.map((dish, index) => (
              <NewDishCard
                key={dish.id}
                dish={dish}
                index={index}
                onOpen={openDish}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label="Rolar novidades para a direita"
            onClick={() => scrollRail("right")}
            className={cn(
              "absolute right-0 top-[75px] z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/80 shadow-md transition-colors hover:bg-card sm:flex",
              !canScrollForward && "sm:hidden",
            )}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {pageCount > 1 && (
            <div
              className="flex items-center justify-center gap-1.5 pt-2.5"
              aria-hidden="true"
            >
              {Array.from({ length: pageCount }).map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    index === page
                      ? "w-[18px] bg-orange-500"
                      : "w-1.5 bg-muted-foreground/30",
                  )}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="pt-2">
          <EmptyState
            title="Nenhuma novidade encontrada"
            message={
              !hasUserLocation && !restaurants.length
                ? "Escolha um endereço para ver os pratos novos perto de você."
                : filter !== "all"
                  ? "Nenhum prato novo nesse filtro."
                  : "Ainda não há pratos novos perto de você."
            }
          />
        </div>
      )}

      {selectedDish && (
        <CustomizeOrder
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
          productData={selectedDish.product}
        />
      )}
    </section>
  );
}
