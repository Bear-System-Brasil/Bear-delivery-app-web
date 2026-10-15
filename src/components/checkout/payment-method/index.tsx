"use client";

import { Dispatch, SetStateAction } from "react";

import { formatCurrency } from "@/utils";

import { AlertCircle, Banknote, Check, CreditCard, Shield, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { cn } from "@/lib/utils";

type Props = {
  setPaymentMethod: Dispatch<SetStateAction<string>>;
  setNeedsChange: Dispatch<SetStateAction<boolean>>;
  setChangeAmount: Dispatch<SetStateAction<string>>;
  total: number;
  paymentMethod: string;
  changeAmount: string;
  needsChange: boolean;
  /** Opções que o restaurante aceita. Ausente, mostra todas (LDMF-251). */
  availableMethods?: string[];
};

type PaymentOption = {
  value: string;
  label: string;
  description: string;
  icon: typeof Smartphone;
};

// Só pagamento na entrega: o pagamento online foi removido do checkout.
const paymentOptions: PaymentOption[] = [
  {
    value: "cash",
    label: "Dinheiro",
    description: "Com troco se precisar",
    icon: Banknote,
  },
  {
    value: "credit_card_machine",
    label: "Crédito na maquininha",
    description: "Cartão de crédito",
    icon: CreditCard,
  },
  {
    value: "debit_card_machine",
    label: "Débito na maquininha",
    description: "Cartão de débito",
    icon: CreditCard,
  },
  {
    value: "pix_on_delivery",
    label: "Pix na entrega",
    description: "Direto ao entregador",
    icon: Smartphone,
  },
];

export function PaymentMethod({
  setPaymentMethod,
  setNeedsChange,
  setChangeAmount,
  total,
  paymentMethod,
  changeAmount,
  needsChange,
  availableMethods,
}: Props) {
  const visibleOptions = availableMethods
    ? paymentOptions.filter((option) => availableMethods.includes(option.value))
    : paymentOptions;
  const normalizedChangeAmount = Number.parseFloat(
    changeAmount.replace(",", "."),
  );
  const hasChangeAmount = changeAmount.trim().length > 0;
  // `< total` e não `<=`: pagar exatamente o valor é válido (troco zero).
  // Com `<=` a mensagem "Valor menor que o total" aparecia no valor exato,
  // e divergia da regra que o hook usa pra liberar o botão de finalizar.
  const isChangeInvalid =
    hasChangeAmount &&
    (Number.isNaN(normalizedChangeAmount) || normalizedChangeAmount < total);

  const handleMethodSelect = (method: string) => {
    setPaymentMethod(method);

    if (method !== "cash") {
      setNeedsChange(false);
      setChangeAmount("");
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400">
          <CreditCard className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-extrabold text-foreground">
          Forma de pagamento
        </h2>
      </div>

      <div className="flex flex-wrap justify-around gap-2">
        {visibleOptions.map((option) => {
          const Icon = option.icon;
          const isActive = paymentMethod === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleMethodSelect(option.value)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-bold transition-colors",
                isActive
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-400"
                  : "border-border bg-card text-foreground hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-700 dark:hover:text-brand-400",
              )}
              title={option.description}
            >
              <Icon className="h-4 w-4" />
              {option.label}
              {isActive && <Check className="h-3.5 w-3.5" />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-xs font-semibold text-muted-foreground">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p>Voce paga direto ao entregador no recebimento do pedido.</p>
      </div>

      {paymentMethod !== "cash" && (
        <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 dark:bg-amber-950/40 p-3">
          <div className="flex items-start gap-2">
            <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-300">
                Pagamento no recebimento
              </p>
              <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                Combine o pagamento com o entregador no momento da entrega.
              </p>
            </div>
          </div>
        </div>
      )}

      {paymentMethod === "cash" && (
        <div className="mt-3 rounded-lg border border-border bg-muted p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-bold text-foreground">
              Precisa de troco?
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={needsChange ? "default" : "outline"}
                onClick={() => setNeedsChange(true)}
                className={cn(
                  "h-8 rounded-full px-4 text-xs font-bold",
                  needsChange
                    ? "bg-selected text-selected-foreground hover:bg-selected-hover"
                    : "border-border bg-card text-foreground",
                )}
              >
                Sim
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!needsChange ? "default" : "outline"}
                onClick={() => {
                  setNeedsChange(false);
                  setChangeAmount("");
                }}
                className={cn(
                  "h-8 rounded-full px-4 text-xs font-bold",
                  !needsChange
                    ? "bg-selected text-selected-foreground hover:bg-selected-hover"
                    : "border-border bg-card text-foreground",
                )}
              >
                Não
              </Button>
            </div>
          </div>

          {needsChange && (
            <div className="mt-3 max-w-[220px] space-y-1.5">
              <Label
                htmlFor="changeAmount"
                className="text-[11px] font-bold text-foreground"
              >
                Troco para quanto?
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                  R$
                </span>
                <Input
                  id="changeAmount"
                  inputMode="decimal"
                  placeholder="100,00"
                  value={changeAmount}
                  onChange={(e) => setChangeAmount(e.target.value)}
                  className="h-9 rounded-lg border-border bg-card pl-9 text-sm shadow-none focus-visible:border-brand-400 focus-visible:ring-brand-200"
                />
              </div>

              {isChangeInvalid && (
                <p className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                  <AlertCircle className="h-3 w-3" />
                  Valor menor que o total ({formatCurrency(total)}).
                </p>
              )}

              {hasChangeAmount && !isChangeInvalid && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Troco:{" "}
                  {formatCurrency(Number(normalizedChangeAmount) - total)}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
