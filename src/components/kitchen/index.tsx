"use client";

import { Button } from "@/components/ui/button";
import { OrderDetailSheet } from "@/components/order-detail-sheet";
import { getCustomerName, getItemName, getOrderLabel, toDateInputValue } from "./helpers";
import { useKitchenOrders } from "@/hooks/use-kitchen-orders";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";
import {
  Ban,
  Bell,
  BellOff,
  CheckCircle,
  ChefHat,
  Package,
  RefreshCw,
  Store,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CancelKitchenOrderDialog } from "./cancel-kitchen-order-dialog";
import { KitchenColumn } from "./kitchen-column";
import { getVariationName } from "./helpers";
import {
  KITCHEN_COLUMN_BY_STATUS,
  KITCHEN_PERIOD_LABELS,
  type KitchenColumnConfig,
  type KitchenOrder,
  type KitchenPeriod,
  type KitchenStatus,
} from "./types";

const PERIOD_PRESETS: KitchenPeriod[] = ["today", "7d", "all"];

const COLUMN_ICONS: Record<KitchenStatus, LucideIcon> = {
  ORDERED: Package,
  IN_PRODUCTION: ChefHat,
  READY_FOR_PICKUP: Truck,
  COMPLETED: CheckCircle,
  CANCELED: Ban,
};

// ─────────────────────────────────────────────────────────────────────────────
// Cards de contador coloridos (padrão /order-management) — também funcionam
// como troca de coluna em telas estreitas.
// ─────────────────────────────────────────────────────────────────────────────

function KitchenCounterTile({
  config,
  count,
  active,
  onSelect,
}: {
  config: KitchenColumnConfig;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = COLUMN_ICONS[config.status];

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        "flex min-w-[84px] flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 transition-shadow md:p-3",
        config.tone.header,
        config.tone.text,
        active && "ring-2 ring-brand-400 ring-offset-1",
      )}
    >
      <Icon className="h-4 w-4 md:h-5 md:w-5" />
      <span className="text-center text-xs font-semibold md:text-sm">{config.shortLabel}</span>
      <span className="text-xl font-bold tabular-nums md:text-2xl">{count}</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Área de impressão (oculta — visível apenas em @media print)
// ─────────────────────────────────────────────────────────────────────────────

export function KitchenPrintArea({ order }: { order: KitchenOrder | null }) {
  if (!order) return null;

  const items = order.orderedItems ?? [];
  const observations = order.observations?.trim();
  const deliveryObservations = order.delivery?.observations?.trim();

  return (
    <div className="print-area hidden print:mx-auto print:block print:w-[80mm] print:bg-card print:font-mono print:text-xs print:text-black">
      <div className="mb-2 text-center">
        <h2 className="text-base font-bold">COZINHA</h2>
        <p>───────────────────────</p>
      </div>

      <div className="mb-2">
        <p className="text-sm font-bold">PEDIDO #{getOrderLabel(order)}</p>
        <p>Cliente: {getCustomerName(order)}</p>
        <p>{order.fulfillmentType === "PICKUP" ? "Retirada no local" : "Entrega"}</p>
        <p>Data: {new Date(order.created_at).toLocaleString("pt-BR")}</p>
      </div>

      <p>───────────────────────</p>

      <div className="mb-2">
        {items.map((item) => (
          <div key={item.id} className="mb-1">
            <p className="font-bold">
              {item.quantity}x {getItemName(item)}
            </p>
            {item.observations && <p className="pl-2">Obs: {item.observations}</p>}
            {item.variations?.map((variation) => {
              const name = getVariationName(variation);
              if (!name) return null;
              return (
                <p key={variation.id} className="pl-2">
                  Tamanho: {name}
                  {variation.observations ? ` (${variation.observations})` : ""}
                </p>
              );
            })}
            {item.addOns?.map((addon) => (
              <p key={addon.id} className="pl-2">
                + {addon.productAddOns?.description ?? "Adicional"}
                {addon.observations ? ` (${addon.observations})` : ""}
              </p>
            ))}
          </div>
        ))}
      </div>

      {(observations || deliveryObservations) && (
        <>
          <p>───────────────────────</p>
          {observations && <p className="font-bold">OBS: {observations}</p>}
          {deliveryObservations && (
            <p className="font-bold">ENTREGA: {deliveryObservations}</p>
          )}
        </>
      )}

      <p className="mt-2 text-center">───────────────────────</p>
      <p className="text-center text-[10px]">
        Impresso em {new Date().toLocaleString("pt-BR")}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function Kitchen() {
  const {
    columns,
    columnOrder,
    activeStatus,
    setActiveStatus,
    highlightedIds,
    activeOrderTotal,
    isRefreshing,
    soundEnabled,
    toggleSound,
    showCanceled,
    toggleCanceled,
    period,
    setPeriod,
    customDate,
    setCustomDate,
    isLive,
    advanceOrder,
    cancelOrder,
    advancingOrderId,
    isCanceling,
    refetchAll,
  } = useKitchenOrders();

  const restaurantUser = useAuthStore((state) => state.user);
  const restaurantName = restaurantUser?.tradeName || restaurantUser?.legalName || "Cozinha";
  // `owner` não tem permissão pra cancelar pedido (order.md) - o backend
  // rejeita com 403. Sem esconder o botão, a pessoa só descobre isso depois
  // de tentar e ver o erro.
  const canCancelOrder = restaurantUser?.role !== "owner";

  const [cancelTarget, setCancelTarget] = useState<KitchenOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<KitchenOrder | null>(null);
  const [printOrder, setPrintOrder] = useState<KitchenOrder | null>(null);
  const printRef = useRef(false);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const clockLabel = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    if (printOrder && !printRef.current) {
      printRef.current = true;
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          setPrintOrder(null);
          printRef.current = false;
        }, 500);
      }, 100);
    }
  }, [printOrder]);

  const handlePrint = (order: KitchenOrder) => setPrintOrder(order);
  const handleViewDetails = (order: KitchenOrder) => setSelectedOrder(order);

  const columnProps = (status: KitchenStatus) => ({
    column: columns[status],
    highlightedIds,
    advancingOrderId,
    onAdvance: advanceOrder,
    onCancel: canCancelOrder ? setCancelTarget : undefined,
    onPrint: handlePrint,
    onViewDetails: handleViewDetails,
  });

  const handleCustomDateChange = (value: string) => {
    if (!value) return;
    const [year, month, day] = value.split("-").map(Number);
    setCustomDate(new Date(year, month - 1, day));
    setPeriod("custom");
  };

  return (
    // Altura travada na viewport: a página não rola, só o interior das colunas.
    <div className="flex h-[calc(100dvh-52px)] min-h-0 flex-col overflow-hidden">
      {/* Cabeçalho compacto: identidade da estação, relógio, total ativo e controles */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-card px-3 py-2 print:hidden">
        <div className="flex min-w-0 items-center gap-2 font-bold text-foreground">
          <Store className="h-4 w-4 shrink-0 text-brand-500" />
          <span className="truncate">{restaurantName}</span>
        </div>

        <span className="tabular-nums text-sm font-semibold text-muted-foreground">{clockLabel}</span>

        <span className="text-sm font-semibold text-muted-foreground">
          {activeOrderTotal} {activeOrderTotal === 1 ? "pedido ativo" : "pedidos ativos"}
        </span>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold",
            isLive ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-400",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isLive ? "bg-emerald-500" : "animate-pulse bg-amber-500",
            )}
          />
          {isLive ? "Ao vivo" : "Reconectando..."}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {/* Só afeta Feitos e Cancelados — Novos/Em Preparo/Prontos são sempre "tudo em aberto". */}
          <span className="hidden text-xs text-muted-foreground md:inline">
            Período (Feitos/Cancelados):
          </span>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value as KitchenPeriod)}
            aria-label="Período de Concluídos e Cancelados"
            className="h-9 cursor-pointer rounded-lg border border-input bg-background px-2 text-sm text-muted-foreground"
          >
            {PERIOD_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {KITCHEN_PERIOD_LABELS[preset]}
              </option>
            ))}
            <option value="custom">{KITCHEN_PERIOD_LABELS.custom}</option>
          </select>

          {period === "custom" && (
            <input
              type="date"
              value={toDateInputValue(customDate)}
              max={toDateInputValue(new Date())}
              onChange={(event) => handleCustomDateChange(event.target.value)}
              aria-label="Selecionar data específica"
              className="h-9 cursor-pointer rounded-lg border border-input bg-background px-2 text-sm text-muted-foreground"
            />
          )}

          <Button
            variant={showCanceled ? "secondary" : "ghost"}
            className="h-9 cursor-pointer gap-1.5 px-2 text-xs"
            onClick={toggleCanceled}
          >
            <Ban className="h-4 w-4" />
            <span className="hidden sm:inline">
              {showCanceled ? "Ocultar cancelados" : "Ver cancelados"}
            </span>
          </Button>

          <Button
            variant="ghost"
            className="h-9 cursor-pointer gap-1.5 px-2 text-xs"
            onClick={toggleSound}
            aria-pressed={soundEnabled}
          >
            {soundEnabled ? (
              <Bell className="h-4 w-4 text-brand-500" />
            ) : (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="hidden sm:inline">{soundEnabled ? "Som ligado" : "Som desligado"}</span>
          </Button>

          <Button
            variant="ghost"
            className="h-9 cursor-pointer gap-1.5 px-2 text-xs"
            onClick={refetchAll}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Cards de contador — em telas estreitas também trocam a coluna visível */}
      <div
        className="flex shrink-0 gap-2 overflow-x-auto border-b bg-card p-2 print:hidden"
        role="tablist"
        aria-label="Colunas da cozinha"
      >
        {columnOrder.map((config) => (
          <KitchenCounterTile
            key={config.status}
            config={config}
            count={columns[config.status].total}
            active={activeStatus === config.status}
            onSelect={() => setActiveStatus(config.status)}
          />
        ))}
      </div>

      {/* Telas estreitas: só a coluna ativa, com rolagem interna própria */}
      <div className="min-h-0 flex-1 p-3 lg:hidden print:hidden">
        <KitchenColumn {...columnProps(activeStatus)} showHeader={false} />
      </div>

      {/* Telas largas: colunas lado a lado, cada uma com altura fixa e rolagem própria */}
      <div className="hidden min-h-0 flex-1 p-4 lg:block print:hidden">
        <div
          className={cn(
            "grid h-full min-h-0 gap-4",
            columnOrder.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
          )}
        >
          {columnOrder.map((config) => (
            <KitchenColumn key={config.status} {...columnProps(config.status)} />
          ))}
        </div>
      </div>

      <CancelKitchenOrderDialog
        order={cancelTarget}
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelOrder}
        isLoading={isCanceling}
      />

      {/* Mesmas funções do hook que o card usa — otimista e rollback ficam consistentes. */}
      <OrderDetailSheet
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        actionLabel={selectedOrder ? KITCHEN_COLUMN_BY_STATUS[selectedOrder.status]?.actionLabel : null}
        onAction={advanceOrder}
        onCancel={canCancelOrder ? setCancelTarget : undefined}
        onPrint={handlePrint}
        isUpdating={!!selectedOrder && advancingOrderId === selectedOrder.id}
      />

      <KitchenPrintArea order={printOrder} />
    </div>
  );
}
