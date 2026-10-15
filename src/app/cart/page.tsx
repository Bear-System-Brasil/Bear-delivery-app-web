"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { MainHeader } from "@/components/main-header";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DEFAULT_DELIVERY_FEE } from "@/constants/delivery-defaults";
import {
  useCartActions,
  useCompanyProducts,
  usePublicCompanyProductVariations,
  useRestaurant,
  useRestaurantOpeningHours,
} from "@/hooks";
import { resolveRestaurantOpenStatus } from "@/constants/opening-hours";
import { getCartStockIssues } from "@/lib/cart-stock";
import { cn } from "@/lib/utils";
import {
  getDeliveryDiscount,
  getPromoDiscount,
  isValidPromoCode,
  useCartStore,
  type CartItem,
} from "@/stores/cart-store";
import { formatCurrency } from "@/utils/format-currency";

function getItemImage(item?: CartItem) {
  return item?.imageUrl || "/placeholder.svg";
}

// Tamanho + complementos escolhidos - o que distingue essa linha de outra
// do mesmo prato com uma combinação diferente (ver buildCartItemKey).
function getItemExtrasLabel(item: CartItem) {
  const parts: string[] = [];
  if (item.variationLabel) parts.push(item.variationLabel);
  if (item.addOnLabels?.length) parts.push(item.addOnLabels.join(", "));
  return parts.join(" · ");
}

export default function CartPage() {
  const router = useRouter();
  const {
    items,
    totalItems,
    totalPrice,
    handleUpdateQuantity,
    handleRemoveFromCart,
    handleGoToCheckout,
  } = useCartActions();

  const { appliedPromo, setAppliedPromo, getTotalItems } = useCartStore();
  const handleCartClick = () => router.push("/cart");
  const [promoCode, setPromoCode] = useState("");
  const [isMounted, setIsMounted] = useState(false);

  const restaurantId = items[0]?.restaurantId || null;
  const { data: restaurant } = useRestaurant(restaurantId);
  const { data: openingHoursData } = useRestaurantOpeningHours(restaurantId);
  const openStatus = resolveRestaurantOpenStatus(openingHoursData, restaurant);

  const { data: companyVariations = [], refetch: refetchVariations } =
    usePublicCompanyProductVariations(restaurantId);
  const { data: companyProducts = [], refetch: refetchProducts } =
    useCompanyProducts(restaurantId);

  const stockResult = useMemo(
    () => getCartStockIssues(items, companyProducts, companyVariations),
    [items, companyProducts, companyVariations],
  );

  const [isCheckingStock, setIsCheckingStock] = useState(false);

  const handleProceedToCheckout = async () => {
    if (!openStatus.isOpen) return;

    setIsCheckingStock(true);
    try {
      // Rechecar o estoque com dados atualizados do backend antes de ir para o checkout
      const [freshVariationsRes, freshProductsRes] = await Promise.all([
        refetchVariations(),
        refetchProducts(),
      ]);

      const freshVariations = freshVariationsRes.data ?? companyVariations;
      const freshProducts = freshProductsRes.data ?? companyProducts;

      const freshIssues = getCartStockIssues(
        items,
        freshProducts,
        freshVariations,
      );

      if (freshIssues.hasIssues) {
        toast.error(
          "Remova ou ajuste os itens esgotados antes de finalizar o pedido.",
        );
        return;
      }

      handleGoToCheckout();
    } catch (error) {
      console.error("Erro ao verificar estoque atualizado:", error);
      handleGoToCheckout();
    } finally {
      setIsCheckingStock(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // O próprio useCartActions já resincroniza com o backend ao montar
  // (throttled, e esperando qualquer "add" em voo terminar - ver
  // use-cart-actions.ts). Um segundo useEffect aqui só duplicava a chamada
  // e, por não respeitar esse throttle/espera, corria na frente do POST de
  // "adicionar" e sobrescrevia o item otimista com uma leitura desatualizada.

  const restaurantName =
    restaurant?.tradeName || items[0]?.restaurantName || "Restaurante";
  const restaurantImage = restaurant?.logo_url || getItemImage(items[0]);
  const restaurantTime = restaurant?.time || "30-40 min";
  const rawDeliveryFeeString = String(restaurant?.deliveryFee ?? "").trim();
  const rawDeliveryFee = Number.parseFloat(
    rawDeliveryFeeString.replace(",", "."),
  );
  const hasExplicitDeliveryFee =
    rawDeliveryFeeString.length > 0 &&
    rawDeliveryFeeString !== DEFAULT_DELIVERY_FEE &&
    Number.isFinite(rawDeliveryFee) &&
    rawDeliveryFee > 0;
  const deliveryFee = hasExplicitDeliveryFee ? rawDeliveryFee : 0;
  const deliveryDiscount = getDeliveryDiscount(appliedPromo, deliveryFee);

  const subtotal = totalPrice || 0;
  const promoDiscount = getPromoDiscount(appliedPromo, subtotal);
  const total = subtotal + deliveryFee - deliveryDiscount - promoDiscount;

  const deliveryLabel = !hasExplicitDeliveryFee
    ? "Calculado no checkout"
    : deliveryFee - deliveryDiscount > 0
      ? formatCurrency(deliveryFee - deliveryDiscount)
      : "Grátis";

  const restaurantMeta = useMemo(
    () => [
      { label: restaurantTime, icon: Clock3 },
      { label: deliveryLabel, icon: Truck },
    ],
    [deliveryLabel, restaurantTime],
  );

  const applyPromoCode = () => {
    const code = promoCode.trim().toUpperCase();

    if (isValidPromoCode(code)) {
      setAppliedPromo(code);
      setPromoCode("");
      toast.success(
        code === "PRIMEIRA20"
          ? "Cupom aplicado: 20% de desconto"
          : "Cupom aplicado: desconto no frete",
      );
      return;
    }

    toast.error("Código promocional inválido");
  };

  const removePromoCode = () => {
    setAppliedPromo(null);
    toast.info("Cupom removido");
  };

  if (!isMounted) {
    return <CartPageSkeleton />;
  }

  if (items.length === 0) {
    return (
      <AnimatedBackground showBlobs={false} className="bg-muted py-0">
        <MainHeader
          cartItems={totalItems}
          onCartClick={handleCartClick}
          showSearch={false}
          showLocation
          showCart
          showOrders
          showNotifications
        />
        <main className="px-3 pb-16 pt-24 sm:px-5">
          <div className="mx-auto flex min-h-[70vh] max-w-[1160px] items-center justify-center">
            <Card className="w-full max-w-md border-border bg-card p-8 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 dark:bg-brand-950/40 text-brand-500">
                <ShoppingBag className="h-8 w-8" />
              </div>
              <h1 className="mt-5 text-xl font-extrabold text-foreground">
                Seu carrinho está vazio
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Adicione itens do cardápio para continuar.
              </p>
              <Button
                type="button"
                onClick={() => router.push("/")}
                className="mt-5 h-10 rounded-lg bg-brand-500 px-5 font-bold hover:bg-brand-600"
              >
                Explorar restaurantes
              </Button>
            </Card>
          </div>
        </main>
      </AnimatedBackground>
    );
  }

  return (
    <AnimatedBackground showBlobs={false} className="bg-muted py-0">
      <MainHeader
        cartItems={totalItems}
        onCartClick={handleCartClick}
        showSearch={false}
        showLocation
        showCart
        showOrders
        showNotifications
      />

      <main className="px-3 pb-16 pt-20 sm:px-5 sm:pt-24">
        <div className="mx-auto max-w-[1160px]">
          <div className="mb-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:border-border"
              aria-label="Voltar"
              title="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-[19px] font-extrabold tracking-[-0.02em] text-foreground">
              Seu carrinho
            </h1>
            <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-bold text-foreground">
              {totalItems} {totalItems === 1 ? "item" : "itens"}
            </span>
          </div>

          {/* `grid-cols-1` não é redundante: sem ele, a única coluna do
              mobile é uma faixa `auto`, cujo mínimo é o min-content do
              conteúdo. Nome do prato, rótulo de complementos e observação
              usam `truncate` (white-space: nowrap), então o min-content
              deles é o texto inteiro sem quebra - a faixa esticava pra
              530px dentro de um container de 336px e vazava a viewport.
              `grid-cols-1` do Tailwind é `repeat(1, minmax(0,1fr))`, o
              mesmo minmax(0,…) que a variante `lg` já usava. */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-3">
              <Card className="flex items-center gap-3 border-border bg-card p-3 shadow-sm">
                <Image
                  width={44}
                  height={44}
                  src={restaurantImage}
                  alt={restaurantName}
                  className="h-11 w-11 shrink-0 rounded-[10px] bg-muted object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-bold text-foreground">
                    {restaurantName}
                  </h2>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-semibold text-muted-foreground">
                    {restaurantMeta.map(({ label, icon: Icon }) => (
                      <span key={label} className="flex items-center gap-1">
                        <Icon className="h-3 w-3" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
                {restaurantId && (
                  <button
                    type="button"
                    onClick={() => router.push("/#lojas")}
                    className="shrink-0 text-xs font-bold text-brand-500 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    Ver lojas
                  </button>
                )}
              </Card>

              {items.map((item) => {
                const extrasLabel = getItemExtrasLabel(item);
                const itemTotal = item.price * item.quantity;
                const stockStatus = stockResult.itemIssues.get(item.id);
                const isOutOfStock = stockStatus?.isOutOfStock ?? false;
                const exceedsStock = stockStatus?.exceedsStock ?? false;
                const availableStock = stockStatus?.availableStock;

                return (
                  <Card
                    key={item.id}
                    className={cn(
                      "flex gap-3 border-border bg-card p-3 shadow-sm transition",
                      (isOutOfStock || exceedsStock) &&
                        "border-red-500/50 bg-red-50/20 dark:bg-red-950/10",
                    )}
                  >
                    <Image
                      width={72}
                      height={72}
                      src={getItemImage(item)}
                      alt={item.name}
                      className={cn(
                        "h-[72px] w-[72px] shrink-0 rounded-[10px] bg-muted object-cover",
                        isOutOfStock && "opacity-50 grayscale",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="truncate text-sm font-bold text-foreground">
                          {item.name}
                        </h3>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // impede que o clique suba para o card/linha pai
                            e.preventDefault();
                            handleRemoveFromCart(item.id);
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400"
                          aria-label={`Remover ${item.name}`}
                          title={`Remover ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {extrasLabel && (
                        <p className="mt-1 truncate text-xs font-bold text-brand-600 dark:text-brand-400">
                          {extrasLabel}
                        </p>
                      )}

                      {/* Sinalização de estoque para LDMF-273 */}
                      {isOutOfStock && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
                          <span className="rounded bg-red-100 dark:bg-red-950/80 px-1.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide">
                            Esgotado
                          </span>
                          <span>Item sem estoque</span>
                        </div>
                      )}

                      {!isOutOfStock && exceedsStock && availableStock !== undefined && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                          <span className="rounded bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide">
                            Estoque insuficiente
                          </span>
                          <span>Apenas {availableStock} disponíveis</span>
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-[15px] font-extrabold text-foreground">
                          {formatCurrency(itemTotal)}
                        </span>
                        <div className="flex items-center gap-2 rounded-lg bg-muted p-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleUpdateQuantity(item.id, item.quantity - 1)
                            }
                            className="h-7 w-7 rounded-md text-foreground hover:bg-card"
                            aria-label={`Diminuir quantidade de ${item.name}`}
                            title="Diminuir quantidade"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="min-w-5 text-center text-xs font-extrabold text-foreground">
                            {item.quantity}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              handleUpdateQuantity(item.id, item.quantity + 1)
                            }
                            disabled={
                              isOutOfStock ||
                              (availableStock !== undefined &&
                                item.quantity >= availableStock)
                            }
                            className="h-7 w-7 rounded-md text-foreground hover:bg-card disabled:opacity-40"
                            aria-label={`Aumentar quantidade de ${item.name}`}
                            title="Aumentar quantidade"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </section>

            <aside className="lg:sticky lg:top-24">
              <Card className="border-border bg-card p-4 shadow-sm">
                <h2 className="text-sm font-extrabold text-foreground">
                  Resumo do pedido
                </h2>

                <div className="mt-4 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={promoCode}
                      onChange={(event) =>
                        setPromoCode(event.target.value.toUpperCase())
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") applyPromoCode();
                      }}
                      placeholder="Código promocional"
                      className="h-10 rounded-lg border-border pl-9 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={applyPromoCode}
                    className="h-10 rounded-lg bg-zinc-900 px-3 text-xs font-bold hover:bg-zinc-800"
                  >
                    Ativar
                  </Button>
                </div>

                {appliedPromo && (
                  <div className="mt-2 flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <span>{appliedPromo} aplicado</span>
                    <button
                      type="button"
                      onClick={removePromoCode}
                      className="text-muted-foreground underline hover:text-red-500 dark:hover:text-red-400"
                    >
                      remover
                    </button>
                  </div>
                )}

                <div className="my-4 space-y-3 border-y border-border py-4 text-xs font-semibold">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="text-foreground">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Taxa de entrega</span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {deliveryLabel}
                    </span>
                  </div>
                  {promoDiscount > 0 && (
                    <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                      <span>Desconto ({appliedPromo})</span>
                      <span>-{formatCurrency(promoDiscount)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-end justify-between gap-3">
                  <span className="text-sm font-bold text-foreground">
                    Total
                  </span>
                  <span className="text-2xl font-extrabold tracking-[-0.02em] text-foreground">
                    {formatCurrency(Math.max(0, total))}
                  </span>
                </div>

                {!openStatus.isOpen && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300"
                  >
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Restaurante fechado</p>
                      <p className="mt-0.5">
                        {openStatus.reason ||
                          "Este restaurante não está aceitando pedidos no momento."}
                      </p>
                    </div>
                  </div>
                )}

                {openStatus.isOpen && stockResult.hasIssues && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Itens esgotados no carrinho</p>
                      <p className="mt-0.5">
                        Remova ou ajuste a quantidade dos itens sinalizados para prosseguir.
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleProceedToCheckout}
                  disabled={
                    !openStatus.isOpen ||
                    stockResult.hasIssues ||
                    isCheckingStock
                  }
                  className="mt-4 h-11 w-full rounded-lg bg-brand-500 text-sm font-extrabold hover:bg-brand-600 disabled:opacity-60"
                >
                  {isCheckingStock
                    ? "Verificando estoque..."
                    : !openStatus.isOpen
                      ? "Restaurante fechado"
                      : stockResult.hasIssues
                        ? "Itens esgotados no carrinho"
                        : "Finalizar pedido"}
                </Button>

                <p className="mt-3 text-center text-[11px] font-semibold text-muted-foreground">
                  Pix · Cartão · Dinheiro · Vale-refeição
                </p>
              </Card>
            </aside>
          </div>
        </div>
      </main>
    </AnimatedBackground>
  );
}

function CartPageSkeleton() {
  return (
    <div className="min-h-screen bg-muted pt-24">
      <div className="mx-auto max-w-[1160px] space-y-3 px-3 sm:px-5">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {["a", "b", "c"].map((item) => (
              <div
                key={item}
                className="h-28 animate-pulse rounded-xl bg-card"
              />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-xl bg-card" />
        </div>
      </div>
    </div>
  );
}
