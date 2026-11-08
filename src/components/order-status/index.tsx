import { LoadingPage } from "@/components/order-status/loading";
import { OrderInfo, OrderStatus as OrderStatusType } from "@/hooks";
import { formatCurrency, formatPhoneDisplay } from "@/utils";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { OrderStatusTracker } from "../order-status-tracker";

type Props = {
  data: {
    order: OrderInfo | null;
    isRefreshing: boolean;
    secondsUntilRefresh: number;
    refresh: () => void;
    getStatusMessage: (status: OrderStatusType) => string;
  };
};

const CARD = "rounded-[13px] border border-border bg-card";
const CARD_TITLE =
  "flex items-center gap-[7px] text-[13px] font-extrabold text-foreground";

function summarizeItems(items: OrderInfo["items"]) {
  const totalQuantity = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0,
  );

  if (!items.length) return "Itens do pedido";

  const names = items.map((item) => item.name).join(", ");

  return `${totalQuantity} ${totalQuantity === 1 ? "item" : "itens"} · ${names}`;
}

export function OrderStatus({ data }: Props) {
  const router = useRouter();

  if (!data.order) {
    return <LoadingPage />;
  }

  const { order } = data;

  return (
    <div>
      <div className="mb-4 text-center">
        <h1 className="text-[19px] font-extrabold tracking-[-0.02em] text-foreground">
          Acompanhe seu Pedido
        </h1>
        <p className="mt-[3px] text-xs font-semibold text-muted-foreground">
          Pedido #{order.orderNumber}
        </p>
        {data.isRefreshing && (
          <div className="mt-2 flex items-center justify-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin text-brand-500" />
            <span className="text-xs font-medium text-brand-500">
              Atualizando...
            </span>
          </div>
        )}
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-3">
          <section
            className={`${CARD} border-t-[3px] p-4 ${
              order.isCanceled ? "border-t-red-500" : "border-t-brand-500"
            }`}
          >
            <h2 className={CARD_TITLE}>
              <span aria-hidden className="text-brand-500">
                {order.isCanceled ? "✕" : "⏱"}
              </span>
              Status do Pedido
            </h2>

            {/* Pedido cancelado não tem progresso: a linha do tempo daria a
                entender que ele ainda esta em andamento. */}
            {order.isCanceled ? (
              <div className="mt-4 rounded-[10px] bg-red-50 dark:bg-red-950/40 px-[13px] py-[11px]">
                <p className="text-[12.5px] font-bold text-red-700 dark:text-red-400">
                  Pedido cancelado
                </p>
                <p className="mt-[5px] text-[11.5px] font-semibold text-red-600 dark:text-red-400">
                  Este pedido foi cancelado e não será preparado.
                </p>
              </div>
            ) : (
              <div className="mt-4">
                <OrderStatusTracker data={data} />
              </div>
            )}
          </section>

          <section className={`${CARD} p-4`}>
            <h2 className={`${CARD_TITLE} mb-[11px]`}>
              <span aria-hidden>🛵</span>
              Informações de Entrega
            </h2>

            <div className="flex items-start gap-[9px]">
              <span aria-hidden className="mt-px shrink-0">
                📍
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold text-foreground">
                  {order.customerInfo.name}
                </p>
                <p className="mt-px text-xs font-medium text-muted-foreground">
                  {order.customerInfo.address}
                </p>
              </div>
            </div>

            <div className="mt-[9px] flex items-center gap-[9px]">
              <span aria-hidden className="shrink-0">
                📞
              </span>
              <span className="text-[12.5px] font-semibold text-foreground">
                {formatPhoneDisplay(order.customerInfo.phone)}
              </span>
            </div>

            {order.delivery?.observations && (
              <div className="mt-[11px] border-t border-border pt-[9px]">
                <p className="text-[11.5px] font-bold text-foreground">
                  Observações
                </p>
                <p className="mt-px text-xs font-medium text-muted-foreground">
                  {order.delivery.observations}
                </p>
              </div>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <section className={`${CARD} p-[14px]`}>
            <h2 className={`${CARD_TITLE} mb-2.5`}>
              <span aria-hidden>📦</span>
              Resumo do Pedido
            </h2>

            <p className="truncate text-[12.5px] font-semibold text-foreground">
              {summarizeItems(order.items)}
            </p>

            <div className="my-2.5 h-px bg-muted" />

            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-extrabold text-foreground">
                Total
              </span>
              <span className="text-base font-extrabold tracking-[-0.02em] text-foreground">
                {formatCurrency(order.total)}
              </span>
            </div>
          </section>

          <div className="flex flex-col gap-2 rounded-[13px] bg-brand-50 dark:bg-brand-950/40 p-3">
            <button
              type="button"
              onClick={() => router.push("/#lojas")}
              className="h-[38px] rounded-[10px] bg-brand-500 text-[12.5px] font-extrabold text-white transition-colors hover:bg-brand-600"
            >
              Fazer Novo Pedido
            </button>

            <button
              type="button"
              onClick={() => router.push("/orders")}
              className="h-[38px] rounded-[10px] border border-brand-200 dark:border-brand-800 bg-card text-[12.5px] font-extrabold text-brand-600 transition-colors hover:bg-brand-50 dark:hover:bg-brand-950/40"
            >
              Ver Meus Pedidos
            </button>
          </div>

          {order.status === "delivered" || order.isCanceled ? (
            <p className="text-center text-[11px] font-semibold text-muted-foreground">
              Pedido finalizado - atualização automática desativada
            </p>
          ) : (
            <button
              type="button"
              onClick={data.refresh}
              disabled={data.isRefreshing}
              className="flex items-center justify-center gap-1.5 text-center text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3 w-3 ${data.isRefreshing ? "animate-spin" : ""}`}
              />
              {data.isRefreshing
                ? "Atualizando..."
                : `Próxima atualização em ${data.secondsUntilRefresh}s`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
