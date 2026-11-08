"use client";

import { MainHeader } from "@/components/main-header";
import { OrderStatus } from "@/components/order-status";
import { ErrorPage } from "@/components/order-status/error";
import { AnimatedBackground } from "@/components/ui/custom";
import { useAuth } from "@/contexts/auth-provider";
import { useCartActions, useOrderStatus } from "@/hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoadingPage } from "../../components/order-status/loading";

export default function OrderStatusPage() {
  const router = useRouter();

  const { isAuthenticated, user } = useAuth();

  const {
    order,
    loading,
    error,
    isRefreshing,
    secondsUntilRefresh,
    refresh,
    getStatusMessage,
  } = useOrderStatus();
  const { totalItems } = useCartActions();

  const data = {
    order,
    isRefreshing,
    secondsUntilRefresh,
    refresh,
    getStatusMessage,
  };

  const errorData = {
    totalItems,
    error,
  };

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.replace("/");
    }
  }, [isAuthenticated, router, user]);

  // Loading state
  if (loading) {
    return <LoadingPage />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  // Error state
  if (error || !order) {
    return <ErrorPage data={errorData} />;
  }

  return (
    <AnimatedBackground showBlobs={true} blobCount={2}>
      <MainHeader
        cartItems={totalItems}
        onCartClick={() => router.push("/cart")}
        showSearch={false}
        showLocation
        showCart
        showOrders
        showNotifications
      />
      <div className="min-h-screen">
        <main className="pt-28 pb-8">
          <div className="mx-auto w-full max-w-[800px] px-5">
            <OrderStatus data={data} />
          </div>
        </main>
      </div>
    </AnimatedBackground>
  );
}
