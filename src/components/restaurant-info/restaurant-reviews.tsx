"use client";

import { Star } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { CompanyReview, CompanyReviewsSummary } from "@/services/api";

type RestaurantReviewsProps = {
  summary?: CompanyReviewsSummary;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

function Stars({
  value,
  size = "h-3.5 w-3.5",
}: {
  value: number;
  size?: string;
}) {
  const rounded = Math.round(value);
  return (
    <span
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={`${size} ${
            n <= rounded
              ? "fill-[#ffb020] text-[#ffb020]"
              : "text-zinc-300 dark:text-zinc-600"
          }`}
        />
      ))}
    </span>
  );
}

function initialsOf(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}

function ReviewItem({ review }: { review: CompanyReview }) {
  const name = review.author?.name?.trim() || "Cliente";
  const comment = review.comment?.trim();
  return (
    <li className="flex gap-3 px-4 py-3">
      {/* Só as iniciais: foto do cliente continua fora do next/image
          (CLAUDE.md, Imagens) e aqui não precisa dela. */}
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700 dark:bg-orange-950 dark:text-orange-300"
      >
        {initialsOf(name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-bold text-foreground">{name}</p>
          <time
            dateTime={review.created_at}
            className="shrink-0 text-[11px] text-muted-foreground"
          >
            {formatReviewDate(review.created_at)}
          </time>
        </div>
        <div className="mt-0.5">
          <Stars value={review.rating} />
        </div>
        {comment && (
          <p className="mt-1.5 whitespace-pre-line break-words text-sm text-foreground/90">
            {comment}
          </p>
        )}
      </div>
    </li>
  );
}

/** Aba "Avaliações" da página da loja (LDMF-498), de `GET /reviews`. */
export function RestaurantReviews({
  summary,
  isLoading,
  isError,
  onRetry,
}: RestaurantReviewsProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar as avaliações.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm font-bold text-orange-600 hover:underline dark:text-orange-400"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (summary.total === 0 || summary.data.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <Star className="mx-auto h-6 w-6 text-zinc-300 dark:text-zinc-600" />
        <p className="mt-2 text-sm font-bold text-foreground">
          Esta loja ainda não tem avaliações
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          As avaliações aparecem aqui depois de pedidos entregues.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-4 border-b border-border px-4 py-4">
        <p className="text-3xl font-extrabold text-foreground">
          {summary.average.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
        </p>
        <div>
          <Stars value={summary.average} size="h-4 w-4" />
          <p className="mt-0.5 text-xs text-muted-foreground">
            {summary.total.toLocaleString("pt-BR")}{" "}
            {summary.total === 1 ? "avaliação" : "avaliações"}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {summary.data.map((review) => (
          <ReviewItem key={review.id} review={review} />
        ))}
      </ul>
    </div>
  );
}
