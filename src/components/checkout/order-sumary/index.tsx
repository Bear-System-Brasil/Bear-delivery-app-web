"use client";

import { formatCurrency } from "@/utils";

import { Bike, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { CartItem } from "@/stores/cart-store";

type Props = {
  handleSubmitOrder: () => Promise<void>;
  cartItems: CartItem[];
  subtotal: number;
  deliveryFee: number;
  isDeliveryFeeKnown?: boolean;
  discount?: number;
  total: number;
  isProcessing: boolean;
  step: 1 | 2;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onContinue: () => void;
};

export function OrderSummary({
  handleSubmitOrder,
  cartItems,
  subtotal,
  deliveryFee,
  isDeliveryFeeKnown = true,
  discount = 0,
  total,
  isProcessing,
  step,
  detailsOpen,
  onToggleDetails,
  onContinue,
}: Props) {
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-[0_-4px_18px_rgba(16,18,22,.07)]">
      {detailsOpen && (
        <div className="mx-auto max-h-[44vh] max-w-[640px] overflow-y-auto px-4 pt-3 sm:px-5">
          <div className="space-y-2 border-b border-border pb-3">
            {cartItems.map((item) => {
              const extrasParts = [
                item.variationLabel,
                item.addOnLabels?.length ? item.addOnLabels.join(", ") : null,
              ].filter(Boolean);

              return (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-extrabold text-foreground">
                    {item.quantity}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {item.name}
                    {extrasParts.length > 0 && (
                      <span className="ml-1 truncate text-xs font-bold text-brand-600 dark:text-brand-400">
                        {extrasParts.join(" · ")}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-foreground">
                    {formatCurrency(item.price * item.quantity)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-muted-foreground">
                Subtotal ({totalItems} {totalItems === 1 ? "item" : "itens"})
              </span>
              <span className="font-bold text-foreground">
                {formatCurrency(subtotal)}
              </span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
                <Bike className="h-4 w-4 text-brand-500" />
                Taxa de entrega
              </span>
              <span
                className={cn(
                  "font-extrabold",
                  !isDeliveryFeeKnown
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {!isDeliveryFeeKnown
                  ? "Calculado na finalização"
                  : deliveryFee === 0
                    ? "Grátis"
                    : formatCurrency(deliveryFee)}
              </span>
            </div>

            {discount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-muted-foreground">Desconto</span>
                <span className="font-extrabold text-emerald-700 dark:text-emerald-400">
                  -{formatCurrency(discount)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-[640px] flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-extrabold tracking-tight text-foreground">
              {formatCurrency(total)}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              {totalItems} {totalItems === 1 ? "item" : "itens"}
              {!isDeliveryFeeKnown ? " · + frete na finalização" : ""}
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleDetails}
            className="inline-flex items-center gap-0.5 text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-400"
          >
            {detailsOpen ? "Ocultar detalhes" : "Ver detalhes"}
            {detailsOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={step === 1 ? onContinue : handleSubmitOrder}
          disabled={step === 2 && isProcessing}
          className={cn(
            "flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-500 px-5 text-sm font-extrabold text-white shadow-[0_4px_12px_var(--tw-shadow-color)] shadow-brand-500/28 transition-colors sm:flex-none",
            step === 2 && isProcessing
              ? "cursor-not-allowed opacity-60"
              : "hover:bg-brand-600",
          )}
        >
          {step === 2 && isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando...
            </>
          ) : step === 1 ? (
            "Continuar para pagamento"
          ) : (
            `Pagar ${formatCurrency(total)}`
          )}
        </button>
      </div>
    </div>
  );
}
