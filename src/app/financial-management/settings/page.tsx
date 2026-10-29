"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFinancialPreferencesStore } from "@/stores";
import { PaymentMethod } from "@/services/api";
import { Check, Monitor, RotateCcw, Settings, Wallet } from "lucide-react";
import type { ReactNode } from "react";
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
    confirmBeforeCloseRegister,
    setDefaultPaymentMethod,
    setConfirmBeforeCloseRegister,
    resetFinancialPreferences,
  } = useFinancialPreferencesStore();

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
      mainClassName="p-4 pb-20 sm:p-6 md:pb-10 lg:px-8"
      subtitle="Preferências de operação do caixa."
      action={{
        label: "Restaurar padrão",
        icon: RotateCcw,
        onClick: () => {
          resetFinancialPreferences();
          notifySaved("Preferências restauradas");
        },
      }}
    >
      <div className="mx-auto max-w-2xl space-y-4">

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
            description="Pré-selecionado em suprimento, venda manual e reembolso. A sangria sempre abre sem método."
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
