"use client";

import { useEffect, useState } from "react";
import { MapPin, Store } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatVisibleAddressLines,
  getCourierEarnings,
  getOrderTotal,
  getPaymentSummary,
  getRestaurantName,
} from "@/lib/delivery";
import type { Delivery } from "@/services/api";
import { formatCurrency } from "@/utils";

type Props = {
  /** A entrega sendo aceita, ou null com o diálogo fechado. */
  delivery: Delivery | null;
  /** O request do aceite está no backend: não dá mais pra desistir. */
  isAccepting: boolean;
  /**
   * Procurando a posição, antes de o request sair. Voltar continua livre e
   * cancela o aceite - o aviso de permissão do navegador pode ficar sem
   * resposta, e travar aqui prendia o entregador na tela (LDMF-314).
   */
  isLocating?: boolean;
  onClose: () => void;
  /** `skipNext` = marcou "não pedir confirmação nas próximas". */
  onConfirm: (skipNext: boolean) => void;
};

export function AcceptConfirmDialog({
  delivery,
  isAccepting,
  isLocating = false,
  onClose,
  onConfirm,
}: Props) {
  const [skipNext, setSkipNext] = useState(false);

  // A caixa não fica marcada de uma entrega pra outra: desmarcar sem querer é
  // fácil de não notar, e o efeito dura pra sempre.
  useEffect(() => {
    setSkipNext(false);
  }, [delivery?.id]);

  // A entrega ainda é PENDING aqui: só a região, como no card.
  const addressLines = delivery ? formatVisibleAddressLines(delivery) : [];
  const orderTotal = delivery ? getOrderTotal(delivery) : null;
  const earnings = delivery ? getCourierEarnings(delivery) : null;
  const payment = delivery ? getPaymentSummary(delivery) : null;
  const observations = delivery?.observations?.trim();

  return (
    <Dialog
      open={Boolean(delivery)}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aceitar esta entrega?</DialogTitle>
        </DialogHeader>

        {delivery && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-[14px] font-bold text-foreground">
                {getRestaurantName(delivery)}
              </p>
            </div>

            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div className="min-w-0">
                {addressLines.length > 0 ? (
                  addressLines.map((line, index) => (
                    <p
                      key={line}
                      className={
                        index === 0
                          ? "text-[15px] font-bold leading-snug text-foreground"
                          : "text-[13px] font-medium leading-snug text-muted-foreground"
                      }
                    >
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="text-[15px] font-bold text-foreground">
                    Endereço não informado
                  </p>
                )}
              </div>
            </div>

            {observations && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                {observations}
              </p>
            )}

            {/* Antes de aceitar, saber se vai lidar com dinheiro na porta. */}
            {payment && !payment.isPaid && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[13.5px] font-bold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                Receber na entrega:{" "}
                {payment.amountDue > 0
                  ? `${formatCurrency(payment.amountDue)}${
                      payment.methods.length > 0
                        ? ` · ${payment.methods.join(" + ")}`
                        : ""
                    }`
                  : payment.methods.join(" + ")}
              </p>
            )}

            {(orderTotal !== null || earnings !== null) && (
              <dl className="space-y-1 rounded-xl bg-muted px-3 py-2.5">
                {orderTotal !== null && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[13px] font-semibold text-muted-foreground">
                      Total do pedido
                    </dt>
                    <dd className="text-[14px] font-bold text-foreground">
                      {formatCurrency(orderTotal)}
                    </dd>
                  </div>
                )}
                {earnings !== null && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[13px] font-bold text-foreground">
                      Seu ganho
                    </dt>
                    <dd className="text-[16px] font-extrabold text-[#1b7f4c] dark:text-emerald-400">
                      {formatCurrency(earnings)}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <button
              type="button"
              role="checkbox"
              aria-checked={skipNext}
              onClick={() => setSkipNext((value) => !value)}
              className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-3 text-left transition hover:bg-muted"
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-white transition ${
                  skipNext
                    ? "border-brand-500 bg-brand-500"
                    : "border-border bg-transparent"
                }`}
                aria-hidden="true"
              >
                {skipNext && (
                  <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none">
                    <path
                      d="M3.5 8.5l3 3 6-6"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="text-[13.5px] font-semibold text-foreground">
                Não pedir confirmação nas próximas
              </span>
            </button>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isAccepting}
            className="h-12 rounded-xl"
          >
            Voltar
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(skipNext)}
            disabled={isAccepting || isLocating}
            className="h-12 rounded-xl bg-brand-500 text-[15px] font-bold text-white hover:bg-brand-600"
          >
            {isLocating
              ? "Buscando localização..."
              : isAccepting
                ? "Aceitando..."
                : "Aceitar entrega"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
