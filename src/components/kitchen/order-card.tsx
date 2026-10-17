"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bike,
  Clock,
  Eye,
  MessageSquareWarning,
  Package,
  PackagePlus,
  Printer,
  Store,
  X,
} from "lucide-react";
import {
  getCustomerName,
  getElapsed,
  getFulfillmentLabel,
  getFulfillmentToneClass,
  getItemName,
  getOrderLabel,
  getPaymentLabel,
  hasAddOns,
  hasSizes,
} from "./helpers";
import type { KitchenOrder } from "./types";

interface KitchenOrderCardProps {
  order: KitchenOrder;
  /** Rótulo do botão principal; `null` em Concluídos e Cancelados, que não têm ação. */
  actionLabel: string | null;
  onAdvance: (order: KitchenOrder) => void;
  /** `undefined` esconde o botão — usado quando o papel logado não pode cancelar (ex.: owner). */
  onCancel?: (order: KitchenOrder) => void;
  onPrint: (order: KitchenOrder) => void;
  onViewDetails: (order: KitchenOrder) => void;
  isAdvancing?: boolean;
  /** Destaque momentâneo de pedido recém-chegado. */
  isNew?: boolean;
}

export function KitchenOrderCard({
  order,
  actionLabel,
  onAdvance,
  onCancel,
  onPrint,
  onViewDetails,
  isAdvancing,
  isNew,
}: KitchenOrderCardProps) {
  const elapsed = getElapsed(order.statusChangedAt);
  const items = order.orderedItems ?? [];
  const payment = getPaymentLabel(order);
  const fulfillmentLabel = getFulfillmentLabel(order);
  const observations = order.observations?.trim();
  const hasActions = actionLabel !== null;
  const isCanceled = order.status === "CANCELED";
  // Indicador geral do pedido, uma vez só por card: o nome do tamanho e a
  // lista de adicionais ficam no detalhe e na comanda.
  const extrasLabel = [
    hasSizes(order) && "Com tamanho",
    hasAddOns(order) && "Com adicional",
  ]
    .filter(Boolean)
    .join(" · ");
  const hasExtras = extrasLabel !== "";

  return (
    <article
      className={cn(
        "rounded-2xl border bg-card shadow-sm transition-shadow",
        isNew
          ? "border-brand-400 ring-2 ring-brand-300 animate-pulse"
          : "border-border",
        !hasActions && "opacity-80",
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="text-2xl font-black leading-none tracking-tight">
          #{getOrderLabel(order)}
        </span>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold tabular-nums",
            elapsed.className,
          )}
          title="Tempo nesta coluna"
        >
          <Clock className="h-4 w-4" />
          {elapsed.label}
        </span>
      </header>

      <div className="space-y-3 px-4 py-3">
        <p className="truncate text-lg font-semibold text-foreground">
          {getCustomerName(order)}
        </p>

        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="text-lg leading-snug text-foreground">
              <span className="font-black">{item.quantity}×</span>{" "}
              <span className="font-semibold">{getItemName(item)}</span>
            </li>
          ))}

          {items.length === 0 && (
            <li className="text-base text-muted-foreground">Sem itens registrados</li>
          )}
        </ul>

        <button
          type="button"
          onClick={() => onViewDetails(order)}
          aria-label={`Ver detalhes do pedido ${getOrderLabel(order)}`}
          className={cn(
            "flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-left text-base font-medium",
            hasExtras
              ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
              : "border-border bg-muted text-muted-foreground hover:bg-muted",
          )}
        >
          <span className="flex items-center gap-1.5">
            {hasExtras ? (
              <PackagePlus className="h-4 w-4" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            {hasExtras ? extrasLabel : "Sem adicional"}
          </span>
          <Eye className="h-4 w-4 shrink-0" />
        </button>

        {observations && (
          <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <p className="text-base font-medium leading-snug text-amber-900 text-pretty">
              {observations}
            </p>
          </div>
        )}

        {isCanceled && order.cancelReason && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-700">Motivo do cancelamento</p>
            <p className="mt-1 text-sm text-red-600">{order.cancelReason}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {payment && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-medium text-muted-foreground">
              {payment}
            </span>
          )}

          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium",
              getFulfillmentToneClass(order),
            )}
          >
            {order.fulfillmentType === "PICKUP" ? (
              <Store className="h-4 w-4" />
            ) : (
              <Bike className="h-4 w-4" />
            )}
            {fulfillmentLabel}
          </span>
        </div>
      </div>

      {hasActions && (
        <footer className="flex gap-2 border-t p-3">
          <Button
            className="h-14 flex-1 cursor-pointer rounded-xl bg-brand-500 text-lg font-bold text-white hover:bg-brand-600"
            onClick={() => onAdvance(order)}
            disabled={isAdvancing}
          >
            {isAdvancing ? "Enviando..." : actionLabel}
          </Button>

          <Button
            variant="outline"
            className="h-14 w-14 shrink-0 cursor-pointer rounded-xl"
            onClick={() => onPrint(order)}
            aria-label={`Imprimir pedido ${getOrderLabel(order)}`}
          >
            <Printer className="h-6 w-6" />
          </Button>

          {onCancel && (
            <Button
              variant="outline"
              className="h-14 w-14 shrink-0 cursor-pointer rounded-xl text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => onCancel(order)}
              aria-label={`Cancelar pedido ${getOrderLabel(order)}`}
            >
              <X className="h-6 w-6" />
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
