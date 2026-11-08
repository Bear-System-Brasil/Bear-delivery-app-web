"use client";

import { useState } from "react";
import Image from "next/image";
import { Heart, Plus } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { getStoreColor, getStoreInitials } from "@/lib/store-avatar";
import { cn } from "@/lib/utils";
import type { NewDish } from "@/services/products/new-dishes";
import { useFavoritesStore } from "@/stores";
import { formatCurrency } from "@/utils/format-currency";

/** Largura do card no carrossel (mock "Novidades Carrossel"). */
export const NEW_DISH_CARD_CLASS = "w-[212px] shrink-0 snap-start";

type Props = {
  dish: NewDish;
  index: number;
  onOpen: (dish: NewDish) => void;
};

function StoreMiniLogo({ dish }: { dish: NewDish }) {
  const [failed, setFailed] = useState(false);
  const { name, logoUrl } = dish.restaurant;

  if (logoUrl && !failed) {
    return (
      <span className="relative h-[18px] w-[18px] shrink-0 overflow-hidden rounded-md bg-muted">
        <Image
          fill
          src={logoUrl}
          alt=""
          className="object-cover"
          sizes="18px"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md text-[8px] font-extrabold text-white"
      style={{ backgroundColor: getStoreColor(name) }}
    >
      {getStoreInitials(name)}
    </span>
  );
}

export function NewDishCard({ dish, index, onOpen }: Props) {
  const { favorites, toggleFavorite } = useFavoritesStore();
  const isFavoriteStore = favorites.includes(dish.restaurant.id);
  const badge =
    dish.discountPercent > 0 ? `-${dish.discountPercent}%` : "NOVO";
  const { deliveryTimeLabel, isFreeDelivery } = dish.restaurant;

  const handleOpen = () => onOpen(dish);

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Ver ${dish.name}`}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpen();
        }
      }}
      className={cn(
        NEW_DISH_CARD_CLASS,
        "cursor-pointer overflow-hidden rounded-[18px] border border-border bg-card transition-colors hover:border-zinc-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 dark:hover:border-zinc-600",
        "animate-in fade-in duration-300",
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="relative h-[150px] bg-muted">
        <Image
          fill
          src={dish.imageUrl || "/placeholder.svg"}
          alt={dish.name}
          className="object-cover"
          sizes="212px"
          loading={index < 3 ? "eager" : "lazy"}
        />

        <span className="absolute left-[9px] top-[9px] rounded-full bg-orange-500 px-2 py-[3px] text-[10px] font-extrabold leading-none tracking-[0.04em] text-white">
          {badge}
        </span>

        {(deliveryTimeLabel || isFreeDelivery) && (
          <div className="absolute bottom-[9px] left-[9px] flex gap-[5px]">
            {deliveryTimeLabel && (
              <span className="rounded-full bg-zinc-950/75 px-2 py-[3px] text-[10px] font-bold leading-none text-zinc-100">
                {deliveryTimeLabel}
              </span>
            )}
            {isFreeDelivery && (
              <span className="rounded-full bg-emerald-950/90 px-2 py-[3px] text-[10px] font-extrabold leading-none text-emerald-300">
                Grátis
              </span>
            )}
          </div>
        )}
      </div>

      <div className="px-3 pb-3 pt-[11px]">
        <h3 className="truncate text-sm font-bold tracking-tight text-foreground">
          {dish.name}
        </h3>

        <div className="mt-[5px] flex items-center gap-1.5">
          <StoreMiniLogo dish={dish} />
          <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
            {dish.restaurant.name}
          </span>
          <button
            type="button"
            aria-label={
              isFavoriteStore
                ? `Remover ${dish.restaurant.name} dos favoritos`
                : `Salvar ${dish.restaurant.name} nos favoritos`
            }
            aria-pressed={isFavoriteStore}
            onClick={(event) => {
              event.stopPropagation();
              toggleFavorite(dish.restaurant.id);
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
          >
            <Heart
              className={cn(
                "h-[13px] w-[13px]",
                isFavoriteStore
                  ? "fill-orange-500 text-orange-500"
                  : "text-muted-foreground",
              )}
            />
          </button>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="text-[14.5px] font-extrabold text-foreground">
              {formatCurrency(dish.price)}
            </span>
            {dish.originalPrice !== null && (
              <span className="truncate text-[11.5px] font-semibold text-muted-foreground line-through">
                {formatCurrency(dish.originalPrice)}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label={`Adicionar ${dish.name}`}
            onClick={(event) => {
              event.stopPropagation();
              handleOpen();
            }}
            className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 px-[9px] text-white transition-colors hover:bg-orange-400"
          >
            <Plus className="h-4 w-4" strokeWidth={3} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function NewDishCardSkeleton() {
  return (
    <div
      className={cn(
        NEW_DISH_CARD_CLASS,
        "overflow-hidden rounded-[18px] border border-border bg-card",
      )}
    >
      <Skeleton className="h-[150px] w-full rounded-none" />
      <div className="space-y-2 px-3 pb-3 pt-[11px]">
        <Skeleton className="h-3.5 w-4/5" />
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-[18px] w-[18px] rounded-md" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}
