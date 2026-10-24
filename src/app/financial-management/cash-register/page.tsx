"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCashDeposit,
  useCashMovementSummary,
  useCashMovements,
  useCashRefund,
  useCashRegister,
  useCashSale,
  useCashWithdrawal,
  useCloseCashRegister,
  useOpenCashRegister,
} from "@/hooks";
import { cn } from "@/lib/utils";
import {
  type CashMovement,
  CashMovementSource,
  CashMovementType,
  PaymentMethod,
} from "@/services/api";
import { useAuthStore, useFinancialPreferencesStore } from "@/stores";
import { formatCurrency } from "@/utils";
import {
  Banknote,
  CreditCard,
  Info,
  List,
  Lock,
  LockOpen,
  type LucideIcon,
  Minus,
  Plus,
  RefreshCw,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import { type ReactNode, useState } from "react";

type MovementType = "withdrawal" | "deposit" | "sale" | "refund";
type DialogKind = "movement" | "close-register" | null;

/** O método preferido vem do localStorage; um valor obsoleto ali não pode
 *  virar corpo de requisição, então cai pra "sem seleção". */
function toPaymentMethod(value?: string): PaymentMethod | "" {
  return Object.values(PaymentMethod).includes(value as PaymentMethod)
    ? (value as PaymentMethod)
    : "";
}

/** Tipo com que o diálogo de movimento abre. */
const INITIAL_MOVEMENT_TYPE: MovementType = "withdrawal";

/**
 * Sangria abre SEM método pré-selecionado. É a única operação que retira
 * dinheiro, e um padrão aceito por inércia pode significar retirar de um
 * método sem saldo - exatamente o que o backend passou a barrar agora que
 * valida saldo por método.
 *
 * Os outros três mantêm a preferência: venda e suprimento se repetem muito
 * dentro do turno, e reembolso costuma estar amarrado a um pagamento.
 */
function initialPaymentMethod(
  type: MovementType,
  preferred?: string,
): PaymentMethod | "" {
  return type === "withdrawal" ? "" : toPaymentMethod(preferred);
}

const MOVEMENT_LABELS: Record<MovementType, string> = {
  withdrawal: "Sangria",
  deposit: "Suprimento",
  sale: "Venda",
  refund: "Reembolso",
};

// Entrada poe dinheiro no caixa (venda, suprimento); saida tira (sangria,
// reembolso). Cada botao abre o dialogo so com os tipos do seu grupo, pre-
// selecionando o mais comum: venda na entrada, reembolso na saida. Antes os
// dois abriam o dialogo com os quatro tipos, deixando trocar de grupo por
// engano no fechamento.
const ENTRADA_TYPES: MovementType[] = ["sale", "deposit"];
const SAIDA_TYPES: MovementType[] = ["withdrawal", "refund"];
const movementGroupFor = (type: MovementType): MovementType[] =>
  type === "sale" || type === "deposit" ? ENTRADA_TYPES : SAIDA_TYPES;

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Dinheiro",
  [PaymentMethod.CREDIT_CARD]: "Cartão de Crédito",
  [PaymentMethod.DEBIT_CARD]: "Cartão de Débito",
  [PaymentMethod.PIX]: "PIX",
  [PaymentMethod.BANK_TRANSFER]: "Transferência Bancária",
};

const fieldClass =
  "h-9 w-full rounded-[9px] border border-border bg-muted px-2.5 text-[12.5px] font-semibold text-foreground outline-none";

const MOVEMENTS_PAGE_SIZE = 20;

const MOVEMENT_TYPE_LABELS: Record<CashMovementType, string> = {
  [CashMovementType.SALE]: "Venda",
  [CashMovementType.DEPOSIT]: "Suprimento",
  [CashMovementType.WITHDRAWAL]: "Sangria",
  [CashMovementType.REFUND]: "Reembolso",
};

const MOVEMENT_TYPE_BADGE: Record<CashMovementType, string> = {
  [CashMovementType.SALE]: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
  [CashMovementType.DEPOSIT]: "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400",
  [CashMovementType.WITHDRAWAL]: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
  [CashMovementType.REFUND]: "bg-brand-50 dark:bg-brand-950/40 text-amber-700 dark:text-amber-400",
};

/** Sangria e reembolso tiram dinheiro do caixa; venda e suprimento põem. */
const MOVEMENT_OUTFLOW: Record<CashMovementType, boolean> = {
  [CashMovementType.SALE]: false,
  [CashMovementType.DEPOSIT]: false,
  [CashMovementType.WITHDRAWAL]: true,
  [CashMovementType.REFUND]: true,
};

const MOVEMENT_SOURCE_LABELS: Record<CashMovementSource, string> = {
  [CashMovementSource.AUTOMATIC]: "Automático",
  [CashMovementSource.MANUAL]: "Manual",
};

const MOVEMENT_TYPE_FILTERS: { value: CashMovementType | "ALL"; label: string }[] =
  [
    { value: "ALL", label: "Todos os tipos" },
    ...Object.values(CashMovementType).map((type) => ({
      value: type,
      label: MOVEMENT_TYPE_LABELS[type],
    })),
  ];

const MOVEMENT_METHOD_FILTERS: { value: PaymentMethod | "ALL"; label: string }[] =
  [
    { value: "ALL", label: "Todos os métodos" },
    ...Object.values(PaymentMethod).map((method) => ({
      value: method,
      label: PAYMENT_METHOD_LABELS[method],
    })),
  ];

const MOVEMENTS_GRID = "76px 96px minmax(0,1fr) 116px 84px 112px";

const movementHeaderClass =
  "text-[11px] font-semibold tracking-[0.05em] text-muted-foreground";

function movementDate(movement: CashMovement) {
  return movement.createdAt ?? movement.created_at;
}

function formatDateTimeShort(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  })} ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** Valor com o sinal do efeito no caixa - o backend manda o módulo. */
function movementSignedAmount(movement: CashMovement) {
  const magnitude = Math.abs(movement.amount ?? 0);
  return MOVEMENT_OUTFLOW[movement.type] ? -magnitude : magnitude;
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Valor com sinal explícito. `formatCurrency` de um negativo devolve
 * "-R$ 100,00"; concatenar isso num "+ " fixo produzia o "+ −R$ 100,00" que
 * aparecia na conferência. Aqui o sinal vem do próprio número.
 */
function formatSigned(value: number) {
  const sign = value < 0 ? "−" : "+";
  return `${sign} ${formatCurrency(Math.abs(value))}`;
}

/** Uma célula da faixa de indicadores do turno (cartão único, divisórias). */
function KpiCell({
  label,
  value,
  sub,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 whitespace-nowrap text-lg font-bold tabular-nums text-foreground",
          valueClassName,
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  );
}

/** Cartão de seção do design novo: cabeçalho com ícone + título + subtítulo. */
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  aside,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-3">
        <Icon className="h-4 w-4 shrink-0 text-brand-500" />
        <h2 className="text-[13.5px] font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <span className="text-xs text-muted-foreground">· {subtitle}</span>
        )}
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** Par rótulo/valor das linhas de conferência. */
function SummaryRow({
  label,
  hint,
  value,
  valueClassName,
}: {
  label: string;
  hint?: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="text-muted-foreground">
        {label}
        {hint && (
          <span className="mt-px block text-[11px] text-muted-foreground/80">
            {hint}
          </span>
        )}
      </span>
      <span
        className={cn(
          "shrink-0 font-semibold tabular-nums text-foreground",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

function CompactButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Button
      {...props}
      className={cn(
        "h-9 shrink-0 rounded-[9px] bg-muted px-4 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

function ModalTitle({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex items-center justify-between">
      <DialogTitle className="text-[16px] font-extrabold tracking-tight text-foreground">
        {children}
      </DialogTitle>
      <Button
        onClick={onClose}
        className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-muted text-xs text-foreground"
      >
        ✕
      </Button>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-[6px] text-[11.5px] font-bold text-foreground">
      {children}
    </div>
  );
}

export default function CashRegisterPage() {
  const { user } = useAuthStore();
  const { defaultPaymentMethod, confirmBeforeCloseRegister } =
    useFinancialPreferencesStore();
  const {
    data: register,
    isLoading: registerLoading,
    refetch: refetchRegister,
  } = useCashRegister();
  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useCashMovementSummary();

  const openMutation = useOpenCashRegister();
  const closeMutation = useCloseCashRegister();
  const withdrawalMutation = useCashWithdrawal();
  const depositMutation = useCashDeposit();
  const saleMutation = useCashSale();
  const refundMutation = useCashRefund();

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [movementType, setMovementType] =
    useState<MovementType>(INITIAL_MOVEMENT_TYPE);
  // Tipos que o dialogo de movimento mostra - so os do grupo (entrada/saida)
  // do botao que o abriu.
  const [movementTypes, setMovementTypes] = useState<MovementType[]>(
    movementGroupFor(INITIAL_MOVEMENT_TYPE),
  );

  const [openingBalance, setOpeningBalance] = useState("");
  const [countedTotal, setCountedTotal] = useState("");
  const [closeObs, setCloseObs] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">(() =>
    initialPaymentMethod(INITIAL_MOVEMENT_TYPE, defaultPaymentMethod),
  );
  const [description, setDescription] = useState("");
  const [closeConfirmed, setCloseConfirmed] = useState(false);

  const [movementsPage, setMovementsPage] = useState(1);
  const [movementTypeFilter, setMovementTypeFilter] = useState<
    CashMovementType | "ALL"
  >("ALL");
  const [movementMethodFilter, setMovementMethodFilter] = useState<
    PaymentMethod | "ALL"
  >("ALL");

  const isRegisterOpen = !!register;

  // Extrato do caixa aberto: sem o id do caixa a rota devolveria movimento de
  // turno anterior, então a busca só sai depois que o caixa carrega.
  const {
    data: movementsData,
    isLoading: movementsLoading,
    isFetching: movementsFetching,
    isError: movementsError,
    refetch: refetchMovements,
  } = useCashMovements(
    // Os filtros de tipo/método NÃO vão pro backend: a rota aceita os params
    // no Swagger mas não os aplica (LDMF-408), então a filtragem é feita aqui
    // na tela, sobre a lista completa do caixa. O backend devolve o turno
    // inteiro numa página só (não pagina de verdade), então filtrar aqui é
    // completo, não só a página atual.
    {
      page: movementsPage,
      limit: MOVEMENTS_PAGE_SIZE,
      cashRegisterId: register?.id,
    },
    { enabled: !!register?.id },
  );

  const movements = movementsData?.items ?? [];
  const movementsMeta = movementsData?.meta;
  const movementsTotalPages = movementsMeta?.totalPages ?? 1;

  // Filtragem na tela (ver comentário acima).
  const filteredMovements = movements.filter((movement) => {
    if (
      movementTypeFilter !== "ALL" &&
      movement.type !== movementTypeFilter
    ) {
      return false;
    }
    if (
      movementMethodFilter !== "ALL" &&
      movement.paymentMethod !== movementMethodFilter
    ) {
      return false;
    }
    return true;
  });

  const changeMovementType = (value: CashMovementType | "ALL") => {
    setMovementTypeFilter(value);
    setMovementsPage(1);
  };

  const changeMovementMethod = (value: PaymentMethod | "ALL") => {
    setMovementMethodFilter(value);
    setMovementsPage(1);
  };

  const clearMovementFilters = () => {
    setMovementTypeFilter("ALL");
    setMovementMethodFilter("ALL");
    setMovementsPage(1);
  };

  const hasMovementFilters =
    movementTypeFilter !== "ALL" || movementMethodFilter !== "ALL";

  const resetMovementForm = (type: MovementType) => {
    setAmount("");
    setDescription("");
    setPaymentMethod(initialPaymentMethod(type, defaultPaymentMethod));
  };

  const closeDialog = () => {
    setDialog(null);
    setOpeningBalance("");
    setCountedTotal("");
    setCloseObs("");
    setCloseConfirmed(false);
    resetMovementForm(movementType);
  };

  const handleRefresh = () => {
    refetchRegister();
    refetchSummary();
    refetchMovements();
  };

  const handleOpenRegister = async () => {
    const balance = parseFloat(openingBalance.replace(",", "."));
    if (isNaN(balance) || balance < 0) return;
    await openMutation.mutateAsync({ openingBalance: balance });
    setOpeningBalance("");
  };

  const handleCloseRegister = async () => {
    const counted = parseFloat(countedTotal.replace(",", "."));
    if (isNaN(counted) || counted < 0) return;
    if (confirmBeforeCloseRegister && !closeConfirmed) return;
    await closeMutation.mutateAsync({
      countedTotal: counted,
      observations: closeObs || undefined,
    });
    setCountedTotal("");
    setCloseObs("");
    setCloseConfirmed(false);
    setDialog(null);
  };

  const openMovementDialog = (type: MovementType) => {
    setMovementTypes(movementGroupFor(type));
    setMovementType(type);
    resetMovementForm(type);
    setDialog("movement");
  };

  // Trocar o tipo dentro do diálogo é trocar de operação, então o método é
  // reaplicado pela regra do tipo novo. Sem isso o padrão da venda vazaria
  // para a sangria por um clique no seletor.
  const switchMovementType = (type: MovementType) => {
    setMovementType(type);
    setPaymentMethod(initialPaymentMethod(type, defaultPaymentMethod));
  };

  const missingPaymentMethod = !paymentMethod;

  // Grupo do dialogo aberto, para titulo e rotulo dos tipos.
  const isEntradaDialog = movementTypes.every(
    (t) => t === "sale" || t === "deposit",
  );

  const handleConfirmMovement = async () => {
    const value = parseFloat(amount.replace(",", "."));
    if (isNaN(value) || value <= 0 || !description.trim()) return;

    // O cash-movement.md documenta o mesmo corpo nos quatro POST -
    // { amount, paymentMethod, description }. A guarda também estreita o
    // tipo de `paymentMethod`, então o payload sai sem cast.
    if (!paymentMethod) {
      toast.error("Selecione o método de pagamento");
      return;
    }

    const payload = { amount: value, paymentMethod, description };

    if (movementType === "withdrawal") {
      await withdrawalMutation.mutateAsync(payload);
    } else if (movementType === "deposit") {
      await depositMutation.mutateAsync(payload);
    } else if (movementType === "sale") {
      await saleMutation.mutateAsync(payload);
    } else {
      await refundMutation.mutateAsync(payload);
    }

    closeDialog();
  };

  const isMovementPending =
    withdrawalMutation.isPending ||
    depositMutation.isPending ||
    saleMutation.isPending ||
    refundMutation.isPending;

  // Gaveta é dinheiro físico: fundo de troco + líquido EM DINHEIRO do turno.
  // `totalCash` já vem do backend como SALE + DEPOSIT − WITHDRAWAL − REFUND só
  // do método dinheiro, então sangria e reembolso NÃO se subtraem de novo aqui
  // - era isso que fazia a sangria contar duas vezes.
  //
  // Não usar `availableBalance`: ele soma todos os métodos (cartão e pix
  // entram nele), então inflava a gaveta com dinheiro que não está nela.
  const registerOpeningBalance = register?.openingBalance ?? 0;
  const netCash = summary?.totalCash ?? 0;
  const expectedInDrawer = registerOpeningBalance + netCash;

  const hasContado = countedTotal.trim() !== "";
  const contadoVal = parseFloat(countedTotal.replace(",", "."));
  const difVal =
    hasContado && !isNaN(contadoVal) ? contadoVal - expectedInDrawer : 0;
  const difOk = hasContado && !isNaN(contadoVal) && Math.abs(difVal) < 0.005;
  const difSobra = hasContado && !isNaN(contadoVal) && difVal >= 0.005;
  const difFalta = hasContado && !isNaN(contadoVal) && difVal <= -0.005;

  const paymentBreakdown = summary
    ? [
        {
          label: "Dinheiro",
          value: summary.totalCash,
          gaveta: true,
        },
        { label: "PIX", value: summary.totalPix, gaveta: false },
        {
          label: "Cartão de Crédito",
          value: summary.totalCredit,
          gaveta: false,
        },
        {
          label: "Cartão de Débito",
          value: summary.totalDebit,
          gaveta: false,
        },
      ]
    : [];
  // Os totais são líquidos, então um método pode fechar negativo (mais
  // sangria/reembolso do que venda). Somar tudo pra usar de base deixava a
  // participação sem sentido (PIX aparecia com 112%): a base é só o que
  // entrou de fato, e método negativo não tem participação a exibir.
  const paymentPositiveTotal = paymentBreakdown.reduce(
    (sum, m) => sum + Math.max(m.value, 0),
    0,
  );

  return (
    <AdminPageLayout
      title="Controle de Caixa"
      icon={Banknote}
      mainClassName="p-4 pb-20 sm:p-6 md:pb-10 lg:pl-64 lg:pr-8"
      actions={
        <Button
          onClick={handleRefresh}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-border bg-card px-3.5 text-xs font-bold text-brand-500 transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      }
    >
      <div className="mx-auto max-w-7xl">
        <p className="mb-3.5 text-[12.5px] font-medium text-muted-foreground">
          Abertura, fechamento e movimentos financeiros
        </p>

        {registerLoading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : isRegisterOpen && register ? (
          <div className="flex flex-col gap-4">
            {/* Faixa de caixa aberto */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-success ring-[3px] ring-success/20" />
                <span className="whitespace-nowrap text-[13.5px] font-bold text-foreground">
                  Caixa aberto
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
                <span className="whitespace-nowrap">
                  <span className="text-muted-foreground">Operador </span>
                  <span className="font-semibold text-foreground">
                    {user?.name || "—"}
                  </span>
                </span>
                <span className="whitespace-nowrap">
                  <span className="text-muted-foreground">Aberto às </span>
                  <span className="font-semibold text-foreground">
                    {formatTime(register.openedAt)}
                  </span>
                </span>
                <span className="whitespace-nowrap">
                  <span className="text-muted-foreground">Fundo de troco </span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {formatCurrency(register.openingBalance)}
                  </span>
                </span>
              </div>
              <div className="flex gap-2 sm:ml-auto">
                <Button
                  onClick={() => openMovementDialog("sale")}
                  className="h-[34px] gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Entrada
                </Button>
                <Button
                  onClick={() => openMovementDialog("refund")}
                  className="h-[34px] gap-1.5 rounded-md border border-border bg-card px-3 text-[13px] font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Minus className="h-3.5 w-3.5" />
                  Saída
                </Button>
              </div>
            </div>

            {/* auto-fit sem trava de breakpoint: vira 2 colunas assim que cabe
                (~800px+ de conteúdo, inclui o desktop mode do mobile em ~980px)
                e empilha sozinho em telas estreitas de verdade. O mínimo é
                min(360px, 100%): em celular com menos de 360px de conteúdo
                (ex.: 360px de tela - 32px de respiro), um mínimo fixo de 360px
                empurrava Entradas/Saídas, Por forma de pagamento e Conferência
                pra fora da tela (LDMF-427). No PC, 100% é sempre maior. */}
            <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(360px,100%),1fr))]">
              {/* Coluna principal */}
              <div className="flex min-w-0 flex-col gap-4">
                {summaryLoading ? (
                  <Skeleton className="h-[86px] w-full rounded-lg" />
                ) : (
                  <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                    <KpiCell
                      label="Entradas"
                      value={formatCurrency(
                        (summary?.totalSales ?? 0) +
                          (summary?.totalDeposits ?? 0),
                      )}
                      sub="Vendas e suprimentos"
                      valueClassName="text-emerald-700 dark:text-emerald-400"
                    />
                    <KpiCell
                      label="Saídas"
                      value={formatCurrency(
                        (summary?.totalWithdrawals ?? 0) +
                          (summary?.totalRefunds ?? 0),
                      )}
                      sub="Sangrias e reembolsos"
                      valueClassName="text-red-600 dark:text-red-400"
                    />
                  </div>
                )}

                {/* Formas de pagamento */}
                <SectionCard
                  icon={CreditCard}
                  title="Por forma de pagamento"
                  subtitle="valores líquidos"
                >
                  {summaryLoading ? (
                    <div className="space-y-2 p-4">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-7 w-full rounded-md" />
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {paymentBreakdown.map((m) => {
                        const isNegative = m.value < 0;
                        const share =
                          !isNegative && paymentPositiveTotal > 0
                            ? Math.min(
                                (m.value / paymentPositiveTotal) * 100,
                                100,
                              )
                            : 0;
                        return (
                          <div
                            key={m.label}
                            className="flex min-h-10 items-center gap-3 px-4 py-2 text-[13px]"
                          >
                            <span className="flex min-w-0 flex-1 items-center gap-2 font-medium text-foreground">
                              <span className="truncate">{m.label}</span>
                              {m.gaveta && (
                                <span className="shrink-0 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
                                  GAVETA
                                </span>
                              )}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-right font-semibold tabular-nums",
                                isNegative
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-foreground",
                              )}
                            >
                              {formatSigned(m.value)}
                            </span>
                            <span
                              className="w-10 shrink-0 text-right text-xs text-muted-foreground"
                              title={
                                isNegative
                                  ? "Método fechou negativo no turno - sem participação nas entradas"
                                  : undefined
                              }
                            >
                              {isNegative ? "—" : `${Math.round(share)}%`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-start gap-1.5 border-t border-border px-4 py-2.5 text-[11.5px] text-muted-foreground">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      Só dinheiro entra na gaveta. Líquido = vendas +
                      suprimentos − sangrias − reembolsos.
                    </span>
                  </div>
                </SectionCard>
              </div>

              {/* Conferência de fechamento. flex-col + h-full pra, quando as
                  duas colunas aparecem lado a lado, o card preencher a altura da
                  coluna da esquerda e o botão ancorar no rodapé - assim os blocos
                  ficam do mesmo tamanho. Em coluna única não tem efeito. */}
              <SectionCard
                icon={Scale}
                title="Conferência de fechamento"
                className="flex h-full flex-col"
              >
                {/* O valor aparece direto; o ⓘ abre a composição (fundo de troco
                    + dinheiro do turno) sob demanda, sem ocupar altura - era a
                    dúvida de onde saía o R$ do fundo de troco. */}
                <div className="px-4 pt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1 text-[13px] font-semibold text-foreground">
                      Esperado na gaveta
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label="Como o esperado na gaveta é calculado"
                            className="text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-64 text-[12px] leading-relaxed"
                        >
                          <p className="font-semibold text-foreground">
                            Como é calculado
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            Fundo de troco da abertura{" "}
                            <strong className="font-semibold text-foreground">
                              {formatCurrency(registerOpeningBalance)}
                            </strong>{" "}
                            + dinheiro líquido do turno{" "}
                            <strong className="font-semibold text-foreground">
                              {formatCurrency(netCash)}
                            </strong>
                            .
                          </p>
                          <p className="mt-1.5 text-muted-foreground">
                            O fundo de troco não é um movimento do turno, por isso
                            não aparece em “Por forma de pagamento”.
                          </p>
                        </PopoverContent>
                      </Popover>
                    </span>
                    <span className="whitespace-nowrap text-xl font-bold tabular-nums text-foreground">
                      {formatCurrency(expectedInDrawer)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] text-muted-foreground">
                    O que deve ter em dinheiro na gaveta agora.
                  </p>
                </div>

                {/* Detalhamento por tipo, só informativo - não entra na conta
                    (somá-lo de novo contaria a sangria duas vezes). */}
                <div className="mx-4 mt-3 flex flex-col gap-1 border-t border-border pt-3">
                  <p className="text-[11px] text-muted-foreground">
                    Resumo do turno, por tipo — não entra no cálculo acima.
                  </p>
                  <SummaryRow
                    label="Vendas (todos os métodos)"
                    value={formatCurrency(summary?.totalSales ?? 0)}
                    valueClassName="text-muted-foreground"
                  />
                  <SummaryRow
                    label="Suprimentos"
                    value={formatCurrency(summary?.totalDeposits ?? 0)}
                    valueClassName="text-muted-foreground"
                  />
                  <SummaryRow
                    label="Sangrias"
                    value={formatCurrency(summary?.totalWithdrawals ?? 0)}
                    valueClassName="text-muted-foreground"
                  />
                  <SummaryRow
                    label="Reembolsos"
                    value={formatCurrency(summary?.totalRefunds ?? 0)}
                    valueClassName="text-muted-foreground"
                  />
                </div>

                <div className="mt-3 border-t border-border p-4 [@media(min-width:800px)]:mt-auto">
                  <Button
                    onClick={() => setDialog("close-register")}
                    disabled={closeMutation.isPending}
                    className="h-9 w-full gap-1.5 rounded-md bg-selected text-[13px] font-semibold text-selected-foreground transition-colors hover:bg-selected-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Fechar caixa
                  </Button>
                </div>
              </SectionCard>
            </div>

            {/* Extrato de movimentos: os totais do resumo são líquidos e não
                dizem QUAL lançamento gerou a diferença - aqui o operador
                confere linha a linha. */}
            <SectionCard
              icon={List}
              title="Extrato de movimentos"
              subtitle="lançamentos deste caixa"
              aside={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="rounded bg-muted px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
                    {filteredMovements.length} movimento
                    {filteredMovements.length !== 1 ? "s" : ""}
                  </span>
                  <select
                    aria-label="Filtrar por tipo"
                    value={movementTypeFilter}
                    onChange={(e) =>
                      changeMovementType(
                        e.target.value as CashMovementType | "ALL",
                      )
                    }
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground outline-none"
                  >
                    {MOVEMENT_TYPE_FILTERS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filtrar por método"
                    value={movementMethodFilter}
                    onChange={(e) =>
                      changeMovementMethod(
                        e.target.value as PaymentMethod | "ALL",
                      )
                    }
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground outline-none"
                  >
                    {MOVEMENT_METHOD_FILTERS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {hasMovementFilters && (
                    <button
                      type="button"
                      onClick={clearMovementFilters}
                      className="h-8 rounded-md border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              }
            >
              {movementsLoading ? (
                <div className="space-y-2 p-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                  ))}
                </div>
              ) : movementsError ? (
                <div className="px-4 py-8 text-center">
                  <div className="text-[13px] font-semibold text-foreground">
                    Não foi possível carregar os movimentos
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Use Atualizar para tentar de novo
                  </div>
                </div>
              ) : filteredMovements.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="text-[13px] font-semibold text-foreground">
                    Nenhum movimento encontrado
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {hasMovementFilters
                      ? "Tente ajustar os filtros"
                      : "Os lançamentos do turno aparecem aqui"}
                  </div>
                </div>
              ) : (
                <>
                  {/* Mobile: lista em cards */}
                  <div
                    className={cn(
                      "divide-y divide-border md:hidden",
                      movementsFetching && "opacity-60",
                    )}
                  >
                    {filteredMovements.map((movement) => {
                      const signed = movementSignedAmount(movement);
                      return (
                        <div key={movement.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                "shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold",
                                MOVEMENT_TYPE_BADGE[movement.type] ??
                                  "bg-muted text-muted-foreground",
                              )}
                            >
                              {MOVEMENT_TYPE_LABELS[movement.type] ??
                                movement.type}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-[13px] font-semibold tabular-nums",
                                signed < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-emerald-700 dark:text-emerald-400",
                              )}
                            >
                              {formatSigned(signed)}
                            </span>
                          </div>
                          <div className="mt-1.5 break-words text-[13px] text-foreground">
                            {movement.description || "—"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                            <span>
                              {movement.paymentMethod
                                ? PAYMENT_METHOD_LABELS[movement.paymentMethod]
                                : "—"}
                              {movement.source
                                ? ` · ${MOVEMENT_SOURCE_LABELS[movement.source]}`
                                : ""}
                            </span>
                            <span>
                              {formatDateTimeShort(movementDate(movement))}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop/tablet: tabela */}
                  <div className="hidden overflow-x-auto md:block">
                    <div className="min-w-[640px]">
                      <div
                        className="grid items-center gap-2.5 border-b border-border px-4 py-2"
                        style={{ gridTemplateColumns: MOVEMENTS_GRID }}
                      >
                        <span className={movementHeaderClass}>HORA</span>
                        <span className={movementHeaderClass}>TIPO</span>
                        <span className={movementHeaderClass}>DESCRIÇÃO</span>
                        <span className={movementHeaderClass}>MÉTODO</span>
                        <span className={movementHeaderClass}>ORIGEM</span>
                        <span
                          className={cn(movementHeaderClass, "text-right")}
                        >
                          VALOR
                        </span>
                      </div>

                      <div className={cn(movementsFetching && "opacity-60")}>
                        {filteredMovements.map((movement) => {
                          const signed = movementSignedAmount(movement);
                          return (
                            <div
                              key={movement.id}
                              className="grid min-h-10 items-center gap-2.5 border-b border-border px-4 py-2 last:border-b-0 hover:bg-muted/60"
                              style={{ gridTemplateColumns: MOVEMENTS_GRID }}
                            >
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {formatDateTimeShort(movementDate(movement))}
                              </span>
                              <span
                                className={cn(
                                  "w-fit rounded px-2 py-0.5 text-[11px] font-semibold",
                                  MOVEMENT_TYPE_BADGE[movement.type] ??
                                    "bg-muted text-muted-foreground",
                                )}
                              >
                                {MOVEMENT_TYPE_LABELS[movement.type] ??
                                  movement.type}
                              </span>
                              <span
                                className="truncate text-[13px] text-foreground"
                                title={movement.description || undefined}
                              >
                                {movement.description || "—"}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {movement.paymentMethod
                                  ? PAYMENT_METHOD_LABELS[
                                      movement.paymentMethod
                                    ]
                                  : "—"}
                              </span>
                              <span className="truncate text-xs text-muted-foreground">
                                {movement.source
                                  ? MOVEMENT_SOURCE_LABELS[movement.source]
                                  : "—"}
                              </span>
                              <span
                                className={cn(
                                  "text-right text-[13px] font-semibold tabular-nums",
                                  signed < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-emerald-700 dark:text-emerald-400",
                                )}
                              >
                                {formatSigned(signed)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {movementsTotalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
                  <span className="text-xs text-muted-foreground">
                    Página {movementsMeta?.page ?? movementsPage} de{" "}
                    {movementsTotalPages} ({movementsMeta?.total ?? 0}{" "}
                    movimentos)
                  </span>
                  <div className="flex gap-1.5">
                    <CompactButton
                      onClick={() =>
                        setMovementsPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={movementsPage <= 1 || movementsFetching}
                    >
                      Anterior
                    </CompactButton>
                    <CompactButton
                      onClick={() =>
                        setMovementsPage((prev) =>
                          Math.min(prev + 1, movementsTotalPages),
                        )
                      }
                      disabled={
                        movementsPage >= movementsTotalPages ||
                        movementsFetching
                      }
                    >
                      Próxima
                    </CompactButton>
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        ) : (
          // Coluna única de seções: uma seção de caixas anteriores, se vier,
          // entra abaixo do aviso sem reorganizar o resto.
          <div className="flex flex-col gap-4">
            {/* Faixa de caixa fechado */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/60 ring-[3px] ring-muted" />
                <span className="whitespace-nowrap text-[13.5px] font-bold text-foreground">
                  Caixa fechado
                </span>
              </div>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-3 w-3 shrink-0" />
                Vendas e movimentos ficam bloqueados até abrir o caixa.
              </span>
            </div>

            {/* Abrir caixa inline: só o fundo de troco, sem modal e sem
                observações - abertura raramente precisa de nota. */}
            <SectionCard
              icon={LockOpen}
              title="Abrir caixa"
              className="w-full max-w-md"
            >
              <div className="flex flex-col gap-3 p-4">
                <div>
                  <FieldLabel>Fundo de troco</FieldLabel>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-[11.5px] font-bold text-muted-foreground">
                      R$
                    </span>
                    <input
                      placeholder="0,00"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      className="h-[38px] w-full rounded-[9px] border border-border bg-muted pl-[34px] pr-3 text-[13px] text-foreground outline-none"
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Dinheiro deixado na gaveta para troco no início do turno.
                  </p>
                </div>
                <Button
                  onClick={handleOpenRegister}
                  disabled={openMutation.isPending || !openingBalance}
                  className="h-9 w-full gap-1.5 rounded-md bg-brand-500 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LockOpen className="h-3.5 w-3.5" />
                  {openMutation.isPending ? "Abrindo..." : "Abrir caixa"}
                </Button>
              </div>
            </SectionCard>
          </div>
        )}
      </div>

      {/* Modal: Fechar caixa */}
      <Dialog
        open={dialog === "close-register"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent
          hideClose
          className="max-w-[360px] gap-0 rounded-[15px] border-none p-[18px] shadow-2xl"
        >
          <ModalTitle onClose={closeDialog}>Fechar caixa</ModalTitle>

          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-foreground">
              Esperado na gaveta
            </span>
            <span className="whitespace-nowrap text-[15px] font-bold tabular-nums text-foreground">
              {formatCurrency(expectedInDrawer)}
            </span>
          </div>

          <FieldLabel>Valor contado</FieldLabel>
          <div className="relative mb-2">
            <span className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-[11.5px] font-bold text-muted-foreground">
              R$
            </span>
            <input
              placeholder="0,00"
              value={countedTotal}
              onChange={(e) => setCountedTotal(e.target.value)}
              className="h-[38px] w-full rounded-[9px] border border-border bg-muted pl-[34px] pr-3 text-[13px] font-semibold tabular-nums text-foreground outline-none"
            />
          </div>

          {!hasContado && (
            <div className="mb-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Informe o valor contado para calcular a diferença.
            </div>
          )}
          {difOk && (
            <div className="mb-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
              ✓ Caixa conferido, sem diferença
            </div>
          )}
          {difSobra && (
            <div className="mb-2 rounded-md bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
              Sobra de {formatCurrency(Math.abs(difVal))}
            </div>
          )}
          {difFalta && (
            <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">
              Falta de {formatCurrency(Math.abs(difVal))}
            </div>
          )}

          <input
            placeholder="Observações (opcional)"
            value={closeObs}
            onChange={(e) => setCloseObs(e.target.value)}
            className={cn(fieldClass, "mb-3 h-[38px] bg-muted font-medium")}
          />

          {confirmBeforeCloseRegister && (
            <label className="mb-3 flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={closeConfirmed}
                onCheckedChange={(checked) =>
                  setCloseConfirmed(checked === true)
                }
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-xs text-foreground">
                Confirmo que conferi o dinheiro físico da gaveta
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <CompactButton onClick={closeDialog} className="flex-1">
              Cancelar
            </CompactButton>
            <Button
              onClick={handleCloseRegister}
              disabled={
                closeMutation.isPending ||
                !hasContado ||
                (confirmBeforeCloseRegister && !closeConfirmed)
              }
              className="h-9 flex-1 gap-1.5 rounded-[9px] bg-selected text-xs font-extrabold text-selected-foreground transition-colors hover:bg-selected-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {closeMutation.isPending ? "Fechando..." : "Confirmar fechamento"}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Não pode ser desfeito.
          </p>
        </DialogContent>
      </Dialog>

      {/* Modal: Registrar movimento */}
      <Dialog
        open={dialog === "movement"}
        onOpenChange={(open) => !open && closeDialog()}
      >
        <DialogContent
          hideClose
          className="max-w-[380px] gap-0 rounded-[15px] border-none p-[18px] shadow-2xl"
        >
          <ModalTitle onClose={closeDialog}>
            {isEntradaDialog ? "Registrar entrada" : "Registrar saída"}
          </ModalTitle>

          <FieldLabel>Tipo</FieldLabel>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {movementTypes.map((type) => (
              <Button
                key={type}
                onClick={() => switchMovementType(type)}
                className={cn(
                  "h-[30px] rounded-[8px] text-[11px] font-bold transition-colors",
                  movementType === type
                    ? "bg-selected text-selected-foreground"
                    : "bg-muted text-foreground hover:bg-muted",
                )}
              >
                {MOVEMENT_LABELS[type]}
              </Button>
            ))}
          </div>

          <FieldLabel>Método de pagamento *</FieldLabel>
          <select
            required
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(toPaymentMethod(e.target.value))}
            className={cn(
              fieldClass,
              "h-[38px] bg-muted",
              movementType === "withdrawal" ? "mb-1.5" : "mb-3",
            )}
          >
            <option value="" disabled>
              Selecione o método
            </option>
            {Object.values(PaymentMethod).map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
          {movementType === "withdrawal" && (
            <p className="mb-3 text-[10.5px] leading-snug text-muted-foreground">
              A sangria não usa o método padrão: escolha de onde o dinheiro
              sai.
            </p>
          )}

          <FieldLabel>Descrição</FieldLabel>
          <input
            placeholder="Ex: Sangria, reforço…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mb-3 h-[38px] w-full rounded-[9px] border border-border bg-muted px-3 text-[13px] text-foreground outline-none"
          />

          <FieldLabel>Valor</FieldLabel>
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-[11px] top-1/2 -translate-y-1/2 text-[11.5px] font-bold text-muted-foreground">
              R$
            </span>
            <input
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-[38px] w-full rounded-[9px] border border-border bg-muted pl-[34px] pr-3 text-[13px] text-foreground outline-none"
            />
          </div>

          <div className="flex gap-2">
            <CompactButton onClick={closeDialog} className="flex-1">
              Cancelar
            </CompactButton>
            <Button
              onClick={handleConfirmMovement}
              disabled={
                isMovementPending ||
                !amount ||
                !description ||
                missingPaymentMethod
              }
              className="h-9 flex-1 rounded-[9px] bg-brand-500 text-xs font-extrabold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isMovementPending ? "Registrando..." : "Registrar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminPageLayout>
  );
}
