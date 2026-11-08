"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { useCartActions, useCheckoutProcess } from "@/hooks";

import { useAuth } from "@/contexts/auth-provider";

import { ArrowLeft, ShieldCheck, Store, ThumbsUp } from "lucide-react";

import {
  CHECKOUT_ADDRESS_FIELDS,
  CHECKOUT_FIELD_LABELS,
  describeMissingFields,
  type CheckoutField,
  type CheckoutFieldErrors,
} from "@/lib/checkout-validation";
import { cn } from "@/lib/utils";

import { AnimatedBackground } from "@/components/ui/animated-background";
import { GradientButton } from "@/components/ui/gradient-button";

import { DeliveryForm } from "@/components/checkout/delivery-form";
import { OrderSummary } from "@/components/checkout/order-sumary";
import { PaymentMethod } from "@/components/checkout/payment-method";
import { MainHeader } from "@/components/main-header";

export function DeliveryWrapper() {
  const router = useRouter();
  const { isAuthenticated, showAuthModal } = useAuth();
  const { syncCartFromBackend } = useCartActions();
  const [isSyncing, setIsSyncing] = useState(false);
  const syncAttemptedRef = useRef(false);
  const submitLockRef = useRef(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Depois da primeira tentativa de avançar, os campos que faltam ficam
  // destacados - e o destaque some sozinho conforme o cliente preenche.
  const [showFieldErrors, setShowFieldErrors] = useState(false);

  const {
    userAddresses,
    selectedAddressId,
    addressMode,
    saveAddress,
    loadingAddresses,
    setAddressMode,
    setSaveAddress,
    handleAddressSelect,
    orderType,
    setOrderType,
    getDeliveryErrors,
    hasCpf,
    deliveryInfo,
    addressCoords,
    applyCoords,
    paymentMethod,
    availablePaymentMethods,
    changeAmount,
    needsChange,
    handleInputChange,
    setPaymentMethod,
    setChangeAmount,
    setNeedsChange,
    subtotal,
    deliveryFee,
    isDeliveryFeeKnown,
    discount,
    total,
    cartItems,
    restaurant,
    resolveDeliveryCoords,
    handleSubmitOrder,
    setSelectedAddressId,
    isFormValid,
    isProcessing,
    isNavigating,
    isRestaurantOpen,
    closedReason,
  } = useCheckoutProcess();

  const isSubmittingOrder = isProcessing || isNavigating;
  const fieldErrors: CheckoutFieldErrors = showFieldErrors
    ? getDeliveryErrors()
    : {};
  const isStoreOpen = isRestaurantOpen !== false;

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setDetailsOpen(false);
      return;
    }

    router.push("/cart");
  };

  const handleContinue = () => {
    if (!isStoreOpen) {
      toast.dismiss?.();
      toast.error(
        closedReason || "Este restaurante está fechado no momento.",
      );
      return;
    }

    const errors = getDeliveryErrors();
    const missing = Object.keys(errors) as CheckoutField[];

    if (missing.length > 0) {
      setShowFieldErrors(true);
      toast.dismiss?.();

      // Endereço salvo selecionado e incompleto: os campos dele não estão na
      // tela, então não adianta mandar "preencher" - diz o que falta e o que
      // fazer (o aviso no formulário repete isso).
      const missingAddress = missing.filter((field) =>
        CHECKOUT_ADDRESS_FIELDS.includes(field),
      );
      const isSavedAddress =
        orderType === "delivery" &&
        addressMode === "select" &&
        userAddresses.length > 0;

      if (isSavedAddress && missingAddress.length === missing.length) {
        toast.error(
          `O endereço selecionado está incompleto (falta ${missingAddress
            .map((field) => CHECKOUT_FIELD_LABELS[field])
            .join(", ")}). Escolha outro ou cadastre um novo.`,
        );
        return;
      }

      toast.error(describeMissingFields(errors));
      document.getElementById(missing[0])?.focus();
      return;
    }

    if (orderType === "delivery") {
      void resolveDeliveryCoords?.();
    }

    setStep(2);
    setDetailsOpen(false);
  };

  const handleSubmit = async () => {
    if (isSubmittingOrder || submitLockRef.current) {
      return;
    }

    if (!isStoreOpen) {
      toast.dismiss?.();
      toast.error(
        closedReason || "Este restaurante está fechado no momento.",
      );
      return;
    }

    if (!isFormValid()) {
      toast.dismiss?.();
      toast.error("Verifique os dados de pagamento antes de confirmar.");
      return;
    }

    submitLockRef.current = true;
    try {
      await handleSubmitOrder();
    } finally {
      submitLockRef.current = false;
    }
  };

  // Tenta sincronizar o carrinho apenas UMA vez por montagem.
  // Sem a trava, um 404 (carrinho inexistente no Redis) nunca preenche
  // restaurant.id e o efeito se redispara em loop infinito.
  useEffect(() => {
    if (!isAuthenticated || cartItems.length === 0 || restaurant?.id) return;
    if (syncAttemptedRef.current) return;

    syncAttemptedRef.current = true;
    setIsSyncing(true);
    syncCartFromBackend().finally(() => setIsSyncing(false));
  }, [isAuthenticated, cartItems.length, restaurant?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      showAuthModal();
    }

    if (isProcessing || isSyncing || isNavigating) {
      return;
    }

    if (cartItems.length === 0) {
      toast.error("Seu carrinho esta vazio!");
      router.push("/#lojas");
      return;
    }

    if (!restaurant?.id) {
      toast.error(
        "Erro ao carregar dados do restaurante. Adicione os itens novamente ao carrinho.",
      );
      router.push("/#lojas");
      return;
    }
  }, [
    isAuthenticated,
    showAuthModal,
    cartItems.length,
    restaurant,
    router,
    isProcessing,
    isSyncing,
    isNavigating,
  ]);

  if (!isAuthenticated) {
    return (
      <AnimatedBackground showBlobs={false}>
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900">
              <ThumbsUp className="h-8 w-8 text-brand-600 dark:text-brand-400" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">
              Login necessario
            </h2>
            <p className="mb-6 text-muted-foreground">
              Você precisa estar logado para finalizar seu pedido
            </p>
            <GradientButton onClick={() => showAuthModal()}>
              Fazer login
            </GradientButton>
          </div>
        </div>
      </AnimatedBackground>
    );
  }

  if (isSyncing) {
    return (
      <AnimatedBackground showBlobs={false}>
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900">
              <Store className="h-8 w-8 animate-pulse text-brand-600 dark:text-brand-400" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">
              Carregando carrinho...
            </h2>
            <p className="text-muted-foreground">
              Sincronizando dados do restaurante
            </p>
          </div>
        </div>
      </AnimatedBackground>
    );
  }

  return (
    <AnimatedBackground showBlobs={false}>
      <MainHeader
        cartItems={cartItems.length}
        onCartClick={() => router.push("/cart")}
        showSearch={false}
        showCart={false}
        showOrders={false}
        showNotifications={false}
        showMenu={false}
        showStoreCta={false}
      />

      <main className="min-h-screen bg-muted px-3 pb-40 pt-20 sm:px-5">
        <div className="mx-auto max-w-[640px]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label="Voltar"
              onClick={handleBack}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition-colors hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-600 dark:hover:text-brand-400"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold text-foreground">
                Checkout
              </h1>
              {restaurant?.name && (
                <p className="truncate text-xs font-semibold text-muted-foreground">
                  {restaurant.name}
                </p>
              )}
            </div>

            <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Pagamento seguro
            </span>
          </div>

          <div className="mb-4 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className={cn(
                "flex h-7 items-center rounded-full px-3 text-[11px] font-extrabold transition-colors",
                step === 1
                  ? "bg-selected text-selected-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted",
              )}
            >
              1 Entrega
            </button>
            <span className="h-px w-3 shrink-0 bg-muted" />
            <div
              className={cn(
                "flex h-7 items-center rounded-full px-3 text-[11px] font-extrabold",
                step === 2
                  ? "bg-selected text-selected-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              2 Pagamento
            </div>
          </div>

          {step === 1 ? (
            <DeliveryForm
              setSelectedAddressId={setSelectedAddressId}
              handleAddressSelect={handleAddressSelect}
              handleInputChange={handleInputChange}
              applyCoords={applyCoords}
              setAddressMode={setAddressMode}
              setSaveAddress={setSaveAddress}
              selectedAddressId={selectedAddressId}
              loadingAddresses={loadingAddresses}
              userAddresses={userAddresses}
              deliveryInfo={deliveryInfo}
              addressCoords={addressCoords}
              addressMode={addressMode}
              saveAddress={saveAddress}
              orderType={orderType}
              setOrderType={setOrderType}
              restaurant={restaurant}
              hasCpf={hasCpf}
              fieldErrors={fieldErrors}
            />
          ) : (
            <PaymentMethod
              setPaymentMethod={setPaymentMethod}
              setNeedsChange={setNeedsChange}
              setChangeAmount={setChangeAmount}
              paymentMethod={paymentMethod}
              availableMethods={availablePaymentMethods}
              changeAmount={changeAmount}
              needsChange={needsChange}
              total={total}
            />
          )}
        </div>
      </main>

      <OrderSummary
        handleSubmitOrder={handleSubmit}
        isProcessing={isSubmittingOrder}
        isRestaurantOpen={isStoreOpen}
        closedReason={closedReason}
        deliveryFee={deliveryFee}
        isDeliveryFeeKnown={isDeliveryFeeKnown}
        discount={discount}
        cartItems={cartItems}
        subtotal={subtotal}
        total={total}
        step={step}
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((v) => !v)}
        onContinue={handleContinue}
      />
    </AnimatedBackground>
  );
}
