"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFinancialPreferencesStore } from "@/stores";
import type {
  CashMovementOperation,
  OperationMethodOverride,
} from "@/stores/financial-preferences-store";
import { PaymentMethod } from "@/services/api";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Monitor,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

/**
 * Só os métodos que o backend aceita num movimento de caixa. BANK_TRANSFER
 * continua no enum (aparece em pagamento de pedido), mas o caixa rejeita -
 * deixar como padrão aqui só pré-selecionava um valor que falha ao salvar.
 */
const DEFAULT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: PaymentMethod.CASH, label: "Dinheiro" },
  { value: PaymentMethod.PIX, label: "PIX" },
  { value: PaymentMethod.DEBIT_CARD, label: "Cartão de Débito" },
  { value: PaymentMethod.CREDIT_CARD, label: "Cartão de Crédito" },
];

/**
 * Operações do caixa que pré-selecionam método, na ordem da tela (LDMF-463).
 * `isWithdrawal` = sangria: por padrão abre sem método (não segue o global).
 */
const CUSTOM_OPERATIONS: {
  op: CashMovementOperation;
  label: string;
  isWithdrawal?: boolean;
}[] = [
  { op: "deposit", label: "Suprimento" },
  { op: "sale", label: "Venda manual" },
  { op: "refund", label: "Reembolso" },
  { op: "withdrawal", label: "Sangria", isWithdrawal: true },
];

/**
 * Cada mudança já vai pro store na hora (não existe "Salvar"), então o
 * feedback é só confirmar que salvou. O id fixo faz cliques seguidos
 * substituírem o mesmo toast em vez de empilhar um por clique.
 */
function notifySaved(message = "Salvo") {
  toast.success(message, { id: "financial-preferences-saved", duration: 1500 });
}

/** Linha "rótulo + controle": empilha no mobile, duas colunas a partir de sm. */
function PreferenceRow({
  id,
  title,
  description,
  control,
  inline = false,
}: {
  id: string;
  title: string;
  description: string;
  control: ReactNode;
  /** Controle compacto (toggle): fica à direita até no mobile. */
  inline?: boolean;
}) {
  return (
    <div
      className={
        inline
          ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
          : "grid grid-cols-1 gap-2.5 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center sm:gap-6 sm:px-5"
      }
    >
      <div className="min-w-0">
        <div id={`${id}-label`} className="text-[13px] font-semibold text-foreground">
          {title}
        </div>
        <p
          id={`${id}-description`}
          className="mt-0.5 text-xs text-muted-foreground text-pretty"
        >
          {description}
        </p>
      </div>
      {control}
    </div>
  );
}

export default function SettingsPage() {
  const {
    defaultPaymentMethod,
    paymentMethodByOperation,
    confirmBeforeCloseRegister,
    setDefaultPaymentMethod,
    setOperationMethod,
    setConfirmBeforeCloseRegister,
    resetFinancialPreferences,
  } = useFinancialPreferencesStore();

  // A customização por operação começa recolhida. Recolher é só visual: não
  // mexe no estado. Pra não esconder override ativo, o cabeçalho mostra quantas
  // operações estão customizadas quando está fechada (LDMF-463).
  const [customOpen, setCustomOpen] = useState(false);
  const customCount = Object.keys(paymentMethodByOperation).length;

  // Valor salvo fora da lista (ex.: BANK_TRANSFER de antes desta tela, ainda
  // no localStorage) aparece como "sem seleção" em vez de um select em branco
  // que parece quebrado. O store não é reescrito sozinho: a pessoa escolhe.
  const selectedMethod = DEFAULT_METHOD_OPTIONS.some(
    (option) => option.value === defaultPaymentMethod,
  )
    ? defaultPaymentMethod
    : "";

  return (
    <AdminPageLayout
      title="Configurações"
      icon={Settings}
      mainClassName="p-4 pb-20 sm:p-6 md:pb-10 lg:pl-64 lg:pr-8"
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Preferências de operação do caixa.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetFinancialPreferences();
              notifySaved("Preferências restauradas");
            }}
            className="shrink-0 gap-2 rounded-lg"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar padrão
          </Button>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
          <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Preferências locais: valem apenas{" "}
            <strong className="font-semibold text-foreground">
              neste computador
            </strong>
            . Cada caixa define as suas.
          </span>
        </div>

        <section
          aria-labelledby="caixa-heading"
          className="overflow-hidden rounded-lg border border-border bg-card"
        >
          {/* Mobile: subtítulo inteiro na 1ª linha e a nota de salvamento na
              2ª, em vez de truncar o subtítulo. A partir de sm, lado a lado. */}
          <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:gap-2 sm:px-5">
            <div className="flex min-w-0 items-center gap-2">
              <Wallet className="h-4 w-4 shrink-0 text-brand-500" />
              <h2
                id="caixa-heading"
                className="shrink-0 text-[13.5px] font-semibold text-foreground"
              >
                Caixa
              </h2>
              <span className="min-w-0 text-xs text-muted-foreground">
                · Controle de Caixa e Dashboard
              </span>
            </div>
            <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground sm:ml-auto">
              <Check className="h-3.5 w-3.5 text-brand-500" />
              <span className="hidden sm:inline">
                As alterações são salvas automaticamente
              </span>
              <span className="sm:hidden">Salvo automaticamente</span>
            </span>
          </div>

          <PreferenceRow
            id="default-payment-method"
            title="Método de pagamento padrão"
            description="Vale pras operações sem customização. A sangria sempre abre sem método por padrão."
            control={
              <Select
                value={selectedMethod}
                onValueChange={(v) => {
                  setDefaultPaymentMethod(v as PaymentMethod);
                  notifySaved();
                }}
              >
                <SelectTrigger
                  aria-labelledby="default-payment-method-label"
                  aria-describedby="default-payment-method-description"
                  className="w-full rounded-lg"
                >
                  <SelectValue placeholder="Selecione um método" />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          {/* Customização por operação (LDMF-463): recolhível, começa fechada.
              Recolher é só visual. "Seguir o padrão" remove o override (volta
              pro global), então nunca fica método preso escondido. */}
          <div className="border-b border-border">
            <button
              type="button"
              onClick={() => setCustomOpen((open) => !open)}
              aria-expanded={customOpen}
              className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted sm:px-5"
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-[13px] font-semibold text-foreground">
                Customização por operação
              </span>
              {!customOpen && customCount > 0 && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                  {customCount} customizada{customCount === 1 ? "" : "s"}
                </span>
              )}
              {customOpen ? (
                <ChevronUp className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {customOpen && (
              <div className="border-t border-border">
                <p className="px-4 pt-3 text-xs text-muted-foreground sm:px-5">
                  Cada operação segue o método padrão (a sangria abre sem
                  método). Aqui você fixa um método ou deixa sem método por
                  operação.
                </p>
                {CUSTOM_OPERATIONS.map(({ op, label, isWithdrawal }) => {
                  const override = paymentMethodByOperation[op];
                  const value = override ?? "default";
                  return (
                    <div
                      key={op}
                      className="grid grid-cols-1 gap-2.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center sm:gap-6 sm:px-5"
                    >
                      <div
                        id={`op-${op}-label`}
                        className="text-[13px] font-semibold text-foreground"
                      >
                        {label}
                      </div>
                      <Select
                        value={value}
                        onValueChange={(v) => {
                          setOperationMethod(
                            op,
                            v as OperationMethodOverride | "default",
                          );
                          notifySaved();
                        }}
                      >
                        <SelectTrigger
                          aria-labelledby={`op-${op}-label`}
                          className="w-full rounded-lg"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default">
                            {isWithdrawal
                              ? "Sem método (padrão)"
                              : "Seguir o padrão"}
                          </SelectItem>
                          {!isWithdrawal && (
                            <SelectItem value="none">Sem método</SelectItem>
                          )}
                          {DEFAULT_METHOD_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <PreferenceRow
            id="confirm-before-close"
            title="Confirmar antes de fechar o caixa"
            description="Exige uma confirmação extra no fechamento. O fechamento não pode ser desfeito."
            inline
            control={
              <Switch
                checked={confirmBeforeCloseRegister}
                onCheckedChange={(checked) => {
                  setConfirmBeforeCloseRegister(checked);
                  notifySaved();
                }}
                aria-labelledby="confirm-before-close-label"
                aria-describedby="confirm-before-close-description"
              />
            }
          />
        </section>
      </div>
    </AdminPageLayout>
  );
}
