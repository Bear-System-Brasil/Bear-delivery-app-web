"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";

import { DeliveryBikeIcon } from "@/components/ui/delivery-bike-icon";
import { getListingOpenStatus } from "@/constants/opening-hours";
import { useMinuteTick } from "@/hooks/use-opening-hours";
import { getStoreColor, getStoreInitials } from "@/lib/store-avatar";
import { cn } from "@/lib/utils";
import { useFavoritesStore } from "@/stores";
import { Restaurant as RestaurantType } from "@/types/restaurant";
import { formatDeliveryFee } from "@/utils/format-delivery-fee";

type Props = {
  index: number;
  restaurant: RestaurantType;
};

/**
 * Agrupa as linhas compactas de loja (layout "Lojas Compacto"): cada linha
 * é um card próprio. No mobile ficam empilhados com um respiro pequeno;
 * a partir de `lg` viram uma grade de duas colunas.
 */
export function RestaurantListCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-4",
        "[&>*]:rounded-lg [&>*]:border [&>*]:border-border [&>*]:bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function RestaurantRow({ restaurant, index }: Props) {
  const router = useRouter();
  const { favorites, toggleFavorite } = useFavoritesStore();
  const [logoFailed, setLogoFailed] = useState(false);
  // Aberto/Fechado sai do relógio (LDMF-480): sem re-render por minuto, a
  // linha só mudaria quando a listagem fosse buscada de novo.
  useMinuteTick();
  const openStatus = getListingOpenStatus(restaurant.openingHours);

  const isFavorite = favorites.includes(restaurant.id);
  const specialties = restaurant.specialty ?? [];
  const description =
    restaurant.description ||
    specialties.map((specialty) => specialty.name).join(" · ");
  const categoryLabel =
    specialties[0]?.name || restaurant.categories?.[0]?.name || "";
  const rating = Number(restaurant.rating || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const distance =
    typeof restaurant.distanceKm === "number" && restaurant.distanceKm > 0
      ? `${restaurant.distanceKm.toLocaleString("pt-BR", {
          maximumFractionDigits: 1,
        })} km`
      : null;
  const deliveryFeeLabel = formatDeliveryFee(restaurant.deliveryFee);
  const isFreeDelivery = deliveryFeeLabel === "Grátis";
  // "R$ 6,90 · 35-45 min · 0,6 km" - tempo e distância só quando existem.
  const deliveryDetails = [restaurant.time, distance].filter(
    (detail): detail is string => Boolean(detail),
  );
  const logoSrc = logoFailed ? "" : restaurant.logo_url;

  const handleOpenMenu = () => {
    router.push(`/restaurant/${restaurant.id}`);
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`Abrir cardapio de ${restaurant.tradeName}`}
      onClick={handleOpenMenu}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenMenu();
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-[11px] px-3 py-[9px] transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none",
        "animate-in fade-in duration-300",
      )}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {logoSrc ? (
        <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[13px] bg-muted ring-1 ring-inset ring-black/5 dark:ring-white/10">
          <Image
            fill
            src={logoSrc}
            alt=""
            className="object-cover"
            sizes="52px"
            loading={index < 6 ? "eager" : "lazy"}
            onError={() => setLogoFailed(true)}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center gap-px rounded-[13px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
          style={{ backgroundColor: getStoreColor(restaurant.tradeName) }}
        >
          <span className="text-base font-extrabold leading-none tracking-wide">
            {getStoreInitials(restaurant.tradeName)}
          </span>
          {categoryLabel && (
            <span className="max-w-[46px] truncate text-[6px] font-bold uppercase leading-none tracking-[0.12em] text-white/70">
              {categoryLabel}
            </span>
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-[14.5px] font-bold tracking-tight text-foreground">
            {restaurant.tradeName}
          </h3>
          {openStatus && (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-px text-[10px] font-bold leading-4",
                openStatus.isOpen
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {openStatus.isOpen ? "Aberto" : "Fechado"}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {description}
          </p>
        )}
        {(deliveryFeeLabel || deliveryDetails.length > 0) && (
          <div className="mt-[3px] flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            {deliveryFeeLabel && (
              <span
                title={`Frete ${deliveryFeeLabel}`}
                className={cn(
                  "flex items-center gap-1",
                  isFreeDelivery &&
                    "font-bold text-emerald-700 dark:text-emerald-400",
                )}
              >
                <DeliveryBikeIcon />
                {deliveryFeeLabel}
              </span>
            )}
            {deliveryDetails.map((detail, detailIndex) => (
              <span key={detail} className="flex items-center gap-1">
                {(deliveryFeeLabel || detailIndex > 0) && (
                  <span aria-hidden="true">·</span>
                )}
                {detail}
              </span>
            ))}
          </div>
        )}
        {openStatus?.nextOpeningLabel && (
          <p className="mt-[3px] truncate text-[11px] font-semibold text-muted-foreground">
            {openStatus.nextOpeningLabel}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-[5px]">
        <div className="flex items-center gap-[3px] text-xs font-bold text-foreground">
          <span className="text-[11px] text-amber-400" aria-hidden="true">
            ★
          </span>
          <span aria-label={`Nota ${rating}`}>{rating}</span>
        </div>
        <button
          type="button"
          aria-label={
            isFavorite ? "Remover dos favoritos" : "Salvar nos favoritos"
          }
          aria-pressed={isFavorite}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(restaurant.id);
          }}
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-orange-200 hover:bg-orange-50 dark:hover:border-orange-800 dark:hover:bg-orange-950/40"
        >
          <Heart
            className={cn(
              "h-4 w-4",
              isFavorite
                ? "fill-orange-500 text-orange-500"
                : "text-zinc-300 dark:text-zinc-600",
            )}
          />
        </button>
      </div>
    </article>
  );
}
