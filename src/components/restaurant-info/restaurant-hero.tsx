"use client";

import Image from "next/image";
import { ChevronLeft, Clock3, Heart, Share2, Star } from "lucide-react";
import { toast } from "sonner";

import { DeliveryBikeIcon } from "@/components/ui/delivery-bike-icon";
import type { CompanyReviewsSummary } from "@/services/api";
import type { Restaurant } from "@/types/restaurant";

const finiteOrZero = (value: unknown) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Nota e total do topo da página. Vêm do `GET /reviews` quando ele já
 * respondeu: o back não atualiza `rating`/`totalReviews` da loja quando
 * entra avaliação (LDMF-498). Antes disso, ou se falhar, ficam os campos
 * da loja.
 */
export function resolveRestaurantRating(
  summary: CompanyReviewsSummary | undefined,
  restaurant?: Pick<Restaurant, "rating" | "totalReviews"> | null,
): { rating: number; total: number } {
  if (summary) {
    return {
      rating: finiteOrZero(summary.average),
      total: finiteOrZero(summary.total),
    };
  }
  return {
    rating: finiteOrZero(restaurant?.rating),
    total: finiteOrZero(restaurant?.totalReviews),
  };
}

type RestaurantHeroProps = {
  restaurant: Restaurant;
  isOpen: boolean | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onBack: () => void;
  /** Média e total já resolvidos (avaliações do back ou campos da loja). */
  rating: number;
  totalReviews: number;
  deliveryTime?: string;
  deliveryLabel: string;
  isFreeDelivery: boolean;
};

/**
 * Compartilhar a loja: no celular abre o compartilhamento do aparelho; onde
 * não existe (a maioria dos PCs), copia o link.
 */
async function shareRestaurant(title: string) {
  const url = window.location.href;

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
    } catch {
      // Pessoa fechou o compartilhamento: nada a fazer.
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link da loja copiado");
  } catch {
    toast.error("Não foi possível copiar o link");
  }
}

/**
 * Cabeçalho da página da loja (LDMF-498): capa com degradê escuro e, por
 * cima, logo, nome, descrição e a linha de números. No PC os números vão
 * para a direita, na mesma linha do nome. Sem desfoque (CLAUDE.md,
 * Desempenho): o contraste vem só do degradê.
 */
export function RestaurantHero({
  restaurant,
  isOpen,
  isFavorite,
  onToggleFavorite,
  onBack,
  rating,
  totalReviews,
  deliveryTime,
  deliveryLabel,
  isFreeDelivery,
}: RestaurantHeroProps) {
  const name = restaurant.tradeName || "Restaurante";
  const description = restaurant.description?.trim();
  const hasRating = totalReviews > 0 && rating > 0;

  return (
    <section className="relative isolate overflow-hidden rounded-[14px] bg-zinc-900 text-white shadow-sm">
      <Image
        fill
        priority
        sizes="(max-width: 640px) 100vw, 1160px"
        src={restaurant.cover_url || restaurant.logo_url || "/placeholder.svg"}
        alt=""
        className="-z-20 object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/65 to-black/10"
      />

      <button
        type="button"
        aria-label="Voltar para as lojas"
        onClick={onBack}
        className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-orange-500 shadow-sm transition hover:bg-orange-50"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Compartilhar loja"
        onClick={() => shareRestaurant(name)}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-800 shadow-sm transition hover:bg-zinc-100"
      >
        <Share2 className="h-4 w-4" />
      </button>

      <div className="px-4 pb-4 pt-28 sm:px-6 sm:pb-5 sm:pt-36 lg:flex lg:items-end lg:gap-6">
        <div className="flex min-w-0 items-end gap-3 sm:gap-4 lg:flex-1">
          <div className="relative shrink-0">
            <Image
              width={192}
              height={192}
              src={restaurant.logo_url || "/placeholder.svg"}
              alt={`Logo de ${name}`}
              className="h-[72px] w-[72px] rounded-2xl border-[3px] border-white bg-zinc-800 object-cover shadow-md sm:h-24 sm:w-24"
            />
            <button
              type="button"
              aria-label={
                isFavorite ? "Remover dos favoritos" : "Salvar nos favoritos"
              }
              aria-pressed={isFavorite}
              onClick={onToggleFavorite}
              className={`absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white shadow-sm transition-colors ${
                isFavorite
                  ? "bg-orange-500 text-white"
                  : "bg-white text-zinc-400 hover:text-orange-500"
              }`}
            >
              <Heart
                className={`h-3.5 w-3.5 ${isFavorite ? "fill-current" : ""}`}
              />
            </button>
          </div>

          <div className="min-w-0 pb-0.5">
            {isOpen !== null && (
              <span
                className={`mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold leading-none ${
                  isOpen
                    ? "bg-emerald-500 text-white"
                    : "bg-orange-500 text-white"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full bg-white"
                />
                {isOpen ? "Aberto" : "Fechado"}
              </span>
            )}
            <h1 className="line-clamp-2 text-xl font-extrabold leading-tight tracking-[-0.02em] sm:text-2xl">
              {name}
            </h1>
            {description && (
              <p className="mt-0.5 line-clamp-2 text-[13px] text-white/80 sm:text-sm">
                {description}
              </p>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 divide-x divide-white/25 lg:mt-0 lg:w-[440px] lg:shrink-0">
          <div className="px-2 text-center">
            <dt className="sr-only">Avaliação</dt>
            <dd className="flex items-center justify-center gap-1 text-[15px] font-extrabold">
              <Star className="h-4 w-4 fill-[#ffb020] text-[#ffb020]" />
              {hasRating
                ? rating.toLocaleString("pt-BR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })
                : "Novo"}
            </dd>
            <dd className="mt-0.5 text-[11px] text-white/75">
              {totalReviews > 0
                ? `${totalReviews.toLocaleString("pt-BR")} ${
                    totalReviews === 1 ? "avaliação" : "avaliações"
                  }`
                : "sem avaliações"}
            </dd>
          </div>
          <div className="px-2 text-center">
            <dt className="sr-only">Tempo de entrega</dt>
            <dd className="flex items-center justify-center gap-1 text-[15px] font-extrabold">
              <Clock3 className="h-4 w-4" />
              {deliveryTime || "—"}
            </dd>
            <dd className="mt-0.5 text-[11px] text-white/75">Tempo</dd>
          </div>
          <div className="px-2 text-center">
            <dt className="sr-only">Taxa de entrega</dt>
            <dd
              className={`flex items-center justify-center gap-1.5 text-[15px] font-extrabold ${
                isFreeDelivery ? "text-emerald-300" : ""
              }`}
            >
              <DeliveryBikeIcon />
              {deliveryLabel}
            </dd>
            <dd className="mt-0.5 text-[11px] text-white/75">Entrega</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
