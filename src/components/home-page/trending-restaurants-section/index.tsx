"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { RESTAURANT_CATEGORIES } from "@/constants";
import { getCategoryIconImage } from "@/constants/category-icons";
import { RestaurantListSkeleton } from "@/components/restaurant-card-skeleton";
import { NewDishesSection } from "@/components/home-page/new-dishes-section";
import { LocationPrompt } from "@/components/home-page/location-prompt";
import {
  RestaurantListCard,
  RestaurantRow,
} from "@/components/ui/restaurant-row";
import type {
  Restaurant as RestaurantType,
  UserLocation,
} from "@/types/restaurant";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  loading: boolean;
  restaurants: RestaurantType[];
  visibleCount: number;
  location?: UserLocation | null;
  hasUserLocation?: boolean;
};

type StoreCategory = {
  id: string;
  icon?: string;
  /** PNG 3D da categoria; sem ele o chip usa o emoji. */
  iconImage?: string | null;
  name: string;
};

const HOME_CATEGORY_IDS = [
  "pizza",
  "lanches",
  "italiana",
  "japonesa",
  "saudavel",
  "doces",
  "bebidas",
  "cafe",
  "caldos",
  "arabe",
];

const HOME_CATEGORY_LABELS: Record<string, string> = {
  italiana: "Massas",
  saudavel: "Saudavel",
  cafe: "Cafe",
  arabe: "Arabe",
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  italiana: ["massas", "macarrao", "italiana"],
  lanches: ["lanche", "lanches", "hamburguer", "hamburger", "burger"],
  saudavel: ["saudavel", "fitness"],
};

const normalizeText = (value?: string | null) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

function CompactEmptyState({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-5 text-center shadow-sm">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{message}</p>
    </div>
  );
}

function StoreCategoriesFilter({
  categories,
  selectedValue,
  onSelect,
}: {
  categories: StoreCategory[];
  selectedValue: string | null;
  onSelect: (value: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Cada seta só aparece quando há para onde rolar: no começo da lista a da
  // esquerda cobria a primeira categoria ("Pizza").
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollState, categories.length]);

  const scrollCategories = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 200;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <div className="mb-3 sm:mb-4">
      <div className="mb-1.5 sm:mb-2 flex items-center justify-between gap-3 sm:gap-4">
        <h3 className="text-sm sm:text-base font-bold text-foreground">
          Categorias
        </h3>
      </div>

      {/* No PC/tablet, quando a lista não cabe, as setas ficam numa calha
          própria (sm:px-10), fora da lista: assim nunca cobrem uma categoria.
          Se tudo cabe, não há seta nem calha e a lista alinha com o título. */}
      <div
        className={cn(
          "relative",
          (canScrollLeft || canScrollRight) && "sm:px-10",
        )}
      >
        {canScrollLeft && (
          <button
            type="button"
            aria-label="Rolar categorias para a esquerda"
            onClick={() => scrollCategories("left")}
            className="hidden sm:flex absolute left-0 top-[42px] -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-card/80 shadow-md border border-border items-center justify-center hover:bg-card transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          className="flex gap-2 sm:gap-3 overflow-x-auto scroll-smooth scrollbar-hide py-1"
        >
          {categories.map((category) => {
            const isActive = selectedValue === category.id;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelect(isActive ? null : category.id)}
                className="flex w-[68px] shrink-0 flex-col items-center gap-1.5 sm:w-[76px]"
              >
                <span
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl border shadow-sm transition-all sm:h-16 sm:w-16",
                    isActive
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                      : "border-border bg-card hover:border-brand-200 hover:bg-brand-50 dark:hover:border-brand-800 dark:hover:bg-brand-950/40",
                  )}
                >
                  {category.iconImage ? (
                    <Image
                      src={category.iconImage}
                      alt=""
                      width={96}
                      height={96}
                      className="h-9 w-9 object-contain sm:h-11 sm:w-11"
                    />
                  ) : (
                    category.icon && (
                      <span className="text-2xl leading-none sm:text-[26px]">
                        {category.icon}
                      </span>
                    )
                  )}
                </span>
                <span
                  className={cn(
                    "w-full truncate text-center text-[11px] font-semibold sm:text-xs",
                    isActive
                      ? "text-brand-600 dark:text-brand-400"
                      : "text-foreground",
                  )}
                  title={category.name}
                >
                  {category.name}
                </span>
              </button>
            );
          })}
        </div>

        {canScrollRight && (
          <button
            type="button"
            aria-label="Rolar categorias para a direita"
            onClick={() => scrollCategories("right")}
            className="hidden sm:flex absolute right-0 top-[42px] -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-card/80 shadow-md border border-border items-center justify-center hover:bg-card transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function TrendingRestaurantsSection({
  visibleCount,
  restaurants,
  location = null,
  loading,
  hasUserLocation = false,
}: Props) {
  const [selectedStoreCategory, setSelectedStoreCategory] = useState<
    string | null
  >(null);

  const storeCategories = useMemo<StoreCategory[]>(
    () =>
      HOME_CATEGORY_IDS.map((categoryId) => {
        const category = RESTAURANT_CATEGORIES.find(
          (item) => item.id === categoryId,
        );
        return {
          id: categoryId,
          icon: category?.icon,
          iconImage: getCategoryIconImage(categoryId),
          name:
            HOME_CATEGORY_LABELS[categoryId] ?? category?.name ?? categoryId,
        };
      }),
    [],
  );

  // A API já filtra por raio quando recebe lat/lng.
  // Aqui só descartamos o que vier marcado explicitamente como fora do raio.
  const restaurantsNearUser = useMemo(
    () =>
      restaurants.filter((restaurant) => restaurant.isWithinRadius !== false),
    [restaurants],
  );

  const selectedCategory = storeCategories.find(
    (category) => category.id === selectedStoreCategory,
  );

  const filteredStores = useMemo(() => {
    if (!selectedStoreCategory) return restaurantsNearUser;

    const selectedTerms = [
      selectedStoreCategory,
      selectedCategory?.name,
      ...(CATEGORY_ALIASES[selectedStoreCategory] ?? []),
    ]
      .map(normalizeText)
      .filter(Boolean);

    return restaurantsNearUser.filter((restaurant) => {
      const restaurantTerms = [
        restaurant.description,
        ...(restaurant.specialty ?? []).flatMap((specialty) => [
          specialty.id,
          specialty.name,
        ]),
        ...(restaurant.categories ?? []).flatMap((category) => [
          category.id,
          category.name,
          category.description,
        ]),
      ]
        .map(normalizeText)
        .filter(Boolean);

      return restaurantTerms.some((term) =>
        selectedTerms.some(
          (selectedTerm) =>
            term === selectedTerm ||
            term.includes(selectedTerm) ||
            selectedTerm.includes(term),
        ),
      );
    });
  }, [restaurantsNearUser, selectedCategory?.name, selectedStoreCategory]);

  const visibleStores = filteredStores.slice(0, visibleCount);
  const isInitialLoading = loading && !restaurants.length;

  // Sem endereço não dá pra dizer quem entrega pro cliente: em vez do
  // catálogo inteiro (quase todo de outras cidades), pede o endereço.
  if (!hasUserLocation) {
    return (
      <div className="px-3 sm:px-4 mb-6 sm:mb-10">
        <div className="mx-auto max-w-7xl">
          <LocationPrompt />
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 sm:px-4 mb-6 sm:mb-10">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* 1. Novidades - pratos recém-cadastrados nas lojas perto */}
        <NewDishesSection
          restaurants={restaurantsNearUser}
          location={location}
          loading={isInitialLoading}
          hasUserLocation={hasUserLocation}
        />

        {/* 2. Categorias */}
        <StoreCategoriesFilter
          categories={storeCategories}
          selectedValue={selectedStoreCategory}
          onSelect={setSelectedStoreCategory}
        />

        {/* 3. Título Lojas (agora no lugar certo, acima da lista) */}
        <div id="lojas" className="scroll-mt-28">
          <div className="mb-2 sm:mb-3">
            <h2 className="text-sm sm:text-base font-bold text-foreground">
              Lojas
            </h2>
            <p className="mt-0.5 text-[11px] sm:text-sm text-muted-foreground">
              Tudo perto de você
            </p>
          </div>

          {isInitialLoading ? (
            <RestaurantListSkeleton count={8} />
          ) : visibleStores.length ? (
            <RestaurantListCard>
              {visibleStores.map((restaurant, index) => (
                <RestaurantRow
                  key={restaurant.id}
                  restaurant={restaurant}
                  index={index}
                />
              ))}
            </RestaurantListCard>
          ) : (
            <CompactEmptyState
              title="Nenhuma loja encontrada"
              message={
                selectedStoreCategory
                  ? "Nenhuma loja encontrada nessa categoria."
                  : "Ainda não ha lojas perto de você."
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
