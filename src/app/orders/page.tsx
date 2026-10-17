"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  LoaderCircle,
  Package,
  RefreshCw,
  RotateCcw,
} from "lucide-react";

import { MainHeader } from "@/components/main-header";
import ProtectedRoute from "@/components/protected-route";
import { CLIENT_ROLES } from "@/utils/role-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatedBackground } from "@/components/ui/animated-background";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";
import { useCartActions, useOrderHistory, useRestaurants } from "@/hooks";
import { useAuthStore } from "@/stores/auth-store";
import { apiService } from "@/services/api";
import type { CustomerOrder } from "@/constants/order-management";
import { getErrorMessage } from "@/utils";
import {
  ORDER_STEPS,
  getOrderStatusBadgeClass,
  getOrderStatusLabel,
  getOrderStep,
  isActiveOrder,
  isCanceledOrder,
  isInertOrder,
} from "@/lib/order-status";
import { formatCurrency } from "@/utils/format-currency";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type RestaurantBrand = { name: string; logo?: string };

function getCompanyId(order: CustomerOrder) {
  return order.companyId || order.company?.id || null;
}

/**
 * O pedido nem sempre traz a empresa aninhada; o catalogo de lojas ja esta em
 * cache e completa nome e logo pelo companyId.
 */
function getRestaurantBrand(
  order: CustomerOrder,
  brandsByCompanyId: Map<string, RestaurantBrand>,
): RestaurantBrand {
  const companyId = getCompanyId(order);
  const fromCatalog = companyId ? brandsByCompanyId.get(companyId) : undefined;

  return {
    name: order.company?.tradeName || fromCatalog?.name || "Restaurante",
    logo: order.company?.logo_url || fromCatalog?.logo,
  };
}

/**
 * Tag de status. Fica sempre na mesma linha do nome da loja, encostada a
 * direita - `shrink-0` impede que ela estique quando o card empilha.
 */
function OrderStatusBadge({
  order,
  pulse,
}: {
  order: CustomerOrder;
  pulse?: boolean;
}) {
  return (
    <span
      className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-bold sm:text-xs ${getOrderStatusBadgeClass(order)}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`}
      />
      {getOrderStatusLabel(order)}
    </span>
  );
}

/** Logo da loja com fallback para o icone generico. */
function RestaurantLogo({
  brand,
  fallbackTone = "bg-brand-50 dark:bg-brand-950/40 text-brand-500",
}: {
  brand: RestaurantBrand;
  fallbackTone?: string;
}) {
  if (!brand.logo) {
    return (
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${fallbackTone}`}
      >
        <Package className="h-5 w-5" />
      </div>
    );
  }

  return (
    <Image
      src={brand.logo}
      alt={brand.name}
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-[10px] border border-border bg-card object-cover"
    />
  );
}

function getOrderId(order: CustomerOrder) {
  return order.id;
}

function getOrderTotal(order: CustomerOrder) {
  return Number(order.totalValue ?? 0);
}

function getItemCount(order: CustomerOrder) {
  const items = order.orderedItems || [];
  const quantity = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0,
  );

  return quantity > 0 ? quantity : null;
}

function getOrderDate(order: CustomerOrder) {
  const value = order.created_at;
  if (!value) return "Data não disponível";

  try {
    return format(new Date(value), "dd 'de' MMM · HH:mm", { locale: ptBR });
  } catch {
    return "Data não disponível";
  }
}

export default function OrderHistoryPage() {
  return (
    <ProtectedRoute allowedRoles={[...CLIENT_ROLES]}>
      <OrderHistoryContent />
    </ProtectedRoute>
  );
}

function OrderHistoryContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { orders, loading, error, refreshHistory } = useOrderHistory();
  const { totalItems, handleAddToCart } = useCartActions();
  const [repeatingOrderId, setRepeatingOrderId] = useState<string | null>(null);

  // O pedido nem sempre traz a empresa aninhada; o catálogo de lojas já está
  // em cache e resolve o nome pelo companyId.
  const { data: restaurants = [] } = useRestaurants();

  const restaurantBrandsById = useMemo(
    () =>
      new Map<string, RestaurantBrand>(
        restaurants.map((restaurant) => [
          restaurant.id,
          { name: restaurant.tradeName, logo: restaurant.logo_url },
        ]),
      ),
    [restaurants],
  );

  const handleRepeatOrder = async (order: CustomerOrder) => {
    const orderId = getOrderId(order);
    if (!orderId || !user?.id) {
      toast.error("Não foi possível carregar esse pedido");
      return;
    }

    setRepeatingOrderId(orderId);

    try {
      // Itens pelo próprio pedido. GET /order-item/order/:id devolve os itens
      // do carrinho aberto, e não os do pedido, quando há carrinho (medido em
      // 16/10; correção no back: LDMF-356) - o "Repetir" repetia o carrinho
      // de outra loja em vez do pedido (LDMF-317).
      const orderResponse = await apiService.orders.getCustomerOrder(orderId);
      const orderItems = orderResponse.data?.orderedItems || [];
      const companyId = getCompanyId(order);
      const restaurantName = getRestaurantBrand(
        order,
        restaurantBrandsById,
      ).name;

      if (!companyId || orderItems.length === 0) {
        throw new Error("Itens indisponíveis para repetir");
      }

      let addedItems = 0;

      for (const item of orderItems) {
        const embeddedProduct = item.product;
        const productResponse = embeddedProduct
          ? { success: true, data: embeddedProduct }
          : await apiService.getProduct(item.productId);
        const product = productResponse.success ? productResponse.data : null;

        if (!product) continue;

        const added = await handleAddToCart({
          id: item.productId,
          name: product.name,
          price: Number(item.unitPrice || product.salePrice || 0),
          quantity: Number(item.quantity || 1),
          restaurantId: companyId,
          restaurantName,
          image: product.imageURL?.[0]?.url,
        });

        if (added) addedItems += 1;
      }

      if (addedItems === 0) {
        throw new Error("Nenhum item disponível para repetir");
      }

      toast.success("Itens adicionados ao carrinho");
      router.push("/cart");
    } catch (repeatError) {
      toast.error(
        getErrorMessage(repeatError, "Não foi possível repetir o pedido"),
      );
    } finally {
      setRepeatingOrderId(null);
    }
  };

  if (loading) return <OrdersPageSkeleton />;

  if (error) {
    return (
      <OrdersShell cartItems={totalItems}>
        <div className="mx-auto flex min-h-[65vh] max-w-md items-center justify-center px-4">
          <Card className="w-full border-border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400">
              <Package className="h-7 w-7" />
            </div>
            <h1 className="mt-4 text-lg font-extrabold text-foreground">
              Não foi possível carregar seus pedidos
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button
              type="button"
              onClick={refreshHistory}
              className="mt-5 h-10 rounded-lg bg-brand-500 px-5 font-bold hover:bg-brand-600"
            >
              Tentar novamente
            </Button>
          </Card>
        </div>
      </OrdersShell>
    );
  }

  return (
    <OrdersShell cartItems={totalItems}>
      <main className="px-3 pb-20 pt-24 sm:px-5 sm:pt-28 md:pb-10">
        <div className="mx-auto max-w-[1160px]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:border-border"
                aria-label="Voltar"
                title="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-[20px] font-extrabold tracking-[-0.02em] text-foreground sm:text-[22px]">
                  Meus pedidos
                </h1>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground sm:text-sm">
                  Acompanhe suas compras e repita seus favoritos.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={refreshHistory}
              className="h-8 w-8 shrink-0 rounded-lg border-border bg-card"
              aria-label="Atualizar pedidos"
              title="Atualizar pedidos"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {orders.length === 0 ? (
            <EmptyOrdersState onExplore={() => router.push("/")} />
          ) : (
            <div className="space-y-3">
              {orders.map((order) =>
                isActiveOrder(order) ? (
                  <ActiveOrderCard
                    key={getOrderId(order)}
                    order={order}
                    brand={getRestaurantBrand(order, restaurantBrandsById)}
                    onTrack={() =>
                      router.push(`/order-status?orderId=${getOrderId(order)}`)
                    }
                  />
                ) : (
                  <CompletedOrderCard
                    key={getOrderId(order)}
                    order={order}
                    brand={getRestaurantBrand(order, restaurantBrandsById)}
                    isRepeating={repeatingOrderId === getOrderId(order)}
                    onView={() =>
                      router.push(`/order-status?orderId=${getOrderId(order)}`)
                    }
                    onRepeat={() => handleRepeatOrder(order)}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </main>
    </OrdersShell>
  );
}

function OrdersShell({
  children,
  cartItems,
}: {
  children: React.ReactNode;
  cartItems: number;
}) {
  const router = useRouter();

  return (
    <AnimatedBackground
      showBlobs={false}
      className="min-h-screen bg-muted py-0"
    >
      <MainHeader
        cartItems={cartItems}
        onCartClick={() => router.push("/cart")}
        showSearch={false}
        showLocation
        showCart
        showOrders
        showNotifications
      />
      {children}
    </AnimatedBackground>
  );
}

function ActiveOrderCard({
  order,
  brand,
  onTrack,
}: {
  order: CustomerOrder;
  brand: RestaurantBrand;
  onTrack: () => void;
}) {
  const step = getOrderStep(order);
  const itemCount = getItemCount(order);
  const eta = order.delivery?.estimatedTime;

  return (
    <Card className="border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <RestaurantLogo brand={brand} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-extrabold text-foreground sm:text-[15px]">
              {brand.name}
            </h2>
            <OrderStatusBadge order={order} pulse />
          </div>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            Pedido #{String(getOrderId(order)).slice(0, 8)}
            {itemCount
              ? ` · ${itemCount} ${itemCount === 1 ? "item" : "itens"}`
              : ""}
          </p>
        </div>
      </div>

      <Stepper
        value={step + 1}
        indicators={{
          completed: <Check className="size-3" />,
          active: <Check className="size-3" />,
        }}
        className="mt-5"
      >
        <StepperNav>
          {ORDER_STEPS.map((label, index) => (
            <StepperItem
              key={label}
              step={index + 1}
              className="relative flex-1 flex-col items-center"
            >
              {index < ORDER_STEPS.length - 1 && (
                <StepperSeparator className="absolute left-1/2 top-2.5 z-0 m-0 h-px w-full bg-muted data-[state=completed]:bg-success" />
              )}

              <StepperTrigger className="flex flex-col items-center gap-2">
                <StepperIndicator className="relative z-10 size-5 border-2 border-border bg-card text-transparent data-[state=active]:border-success data-[state=active]:bg-success data-[state=active]:text-white data-[state=active]:ring-4 data-[state=active]:ring-success/10 data-[state=completed]:border-success data-[state=completed]:bg-success data-[state=completed]:text-white" />

                <StepperTitle className="whitespace-nowrap text-[9px] font-semibold text-muted-foreground sm:text-[10px] data-[state=active]:text-foreground data-[state=completed]:text-foreground">
                  {label}
                </StepperTitle>
              </StepperTrigger>
            </StepperItem>
          ))}
        </StepperNav>
      </Stepper>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        {/* So mostra o prazo quando existe de verdade - o texto generico
            repetia o botao ao lado. */}
        {eta ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            {eta}
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-sm font-extrabold text-foreground">
            {formatCurrency(getOrderTotal(order))}
          </span>
          <Button
            type="button"
            onClick={onTrack}
            className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-bold hover:bg-brand-600"
          >
            Acompanhar pedido
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CompletedOrderCard({
  order,
  brand,
  isRepeating,
  onView,
  onRepeat,
}: {
  order: CustomerOrder;
  brand: RestaurantBrand;
  isRepeating: boolean;
  onView: () => void;
  onRepeat: () => void;
}) {
  const isCancelled = isCanceledOrder(order);
  // Carrinho e abandonado não foram concluidos - o visual verde de "pedido
  // entregue" daria a entender que a compra aconteceu.
  const isInert = isInertOrder(order);
  const itemCount = getItemCount(order);
  const fallbackTone = isCancelled
    ? "bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400"
    : isInert
      ? "bg-muted text-muted-foreground"
      : "bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400";

  return (
    // O card inteiro abre o pedido - o botao "Ver pedido" saiu para compactar.
    <Card
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onView();
        }
      }}
      className="cursor-pointer border-border bg-card p-3 shadow-sm transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <RestaurantLogo brand={brand} fallbackTone={fallbackTone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-extrabold text-foreground sm:text-[15px]">
              {brand.name}
            </h2>
            <OrderStatusBadge order={order} />
          </div>
          <p className="mt-0.5 text-xs font-medium text-muted-foreground">
            Pedido #{String(getOrderId(order)).slice(0, 8)} ·{" "}
            {getOrderDate(order)}
            {itemCount
              ? ` · ${itemCount} ${itemCount === 1 ? "item" : "itens"}`
              : ""}
          </p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-base font-extrabold text-foreground">
              {formatCurrency(getOrderTotal(order))}
            </span>
            {!isCancelled && (
              <Button
                type="button"
                onClick={(event) => {
                  // Sem isso o clique subiria para o card e abriria o pedido.
                  event.stopPropagation();
                  onRepeat();
                }}
                disabled={isRepeating}
                className="h-8 shrink-0 rounded-lg bg-brand-500 px-3 text-xs font-bold hover:bg-brand-600"
              >
                {isRepeating ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Pedir novamente
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyOrdersState({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <Card className="w-full max-w-md border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-500">
          <Package className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-xl font-extrabold text-foreground">
          Você ainda não fez pedidos
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Explore os restaurantes e encontre algo gostoso para pedir.
        </p>
        <Button
          type="button"
          onClick={onExplore}
          className="mt-5 h-10 rounded-lg bg-brand-500 px-5 font-bold hover:bg-brand-600"
        >
          Explorar restaurantes
        </Button>
      </Card>
    </div>
  );
}

function OrdersPageSkeleton() {
  return (
    <div className="min-h-screen bg-muted pt-24">
      <div className="mx-auto max-w-[1160px] space-y-4 px-3 sm:px-5">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-10 w-full animate-pulse rounded bg-muted" />
        {["a", "b"].map((item) => (
          <div key={item} className="h-52 animate-pulse rounded-lg bg-card" />
        ))}
      </div>
    </div>
  );
}
