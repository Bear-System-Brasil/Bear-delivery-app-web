import { MainHeader } from "@/components/main-header";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCartActions } from "@/hooks";
import { useRouter } from "next/navigation";

export function LoadingPage() {
  const router = useRouter();
  const { totalItems } = useCartActions();

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
      <div className="min-h-screen pt-32 sm:pt-32 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Card className="p-6 space-y-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="border-t pt-4">
              <Skeleton className="h-6 w-full" />
            </div>
          </Card>
        </div>
      </div>
    </AnimatedBackground>
  );
}
