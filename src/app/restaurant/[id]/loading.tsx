import { Card } from "@/components/ui/card";
import { GlassCard, GlassCardContent } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";

import { MainHeader } from "@/components/main-header";

export default function RestaurantLoading() {
  return (
    <>
      <MainHeader
        showSearch
        showLocation
        showCart
        showOrders
        showNotifications
      />

      <div className="pt-20 mt-[88px] sm:pt-24 pb-6 sm:pb-8 px-3 sm:px-4">
        <div className="max-w-7xl mx-auto">
          <GlassCard className="shadow-2xl overflow-hidden">
            {/* Skeleton para imagem de capa */}
            <div className="w-full aspect-16/5">
              <Skeleton className="w-full h-full rounded-none" />
            </div>

            <GlassCardContent className="p-4 sm:p-6">
              <div className="mb-4 sm:mb-6 space-y-3">
                <Skeleton className="h-8 sm:h-10 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </GlassCardContent>
          </GlassCard>
        </div>

        <section className="px-4 mb-8 pb-32 mt-8">
          <div className="max-w-7xl mx-auto">
            {/* Skeleton para categorias */}
            <div className="flex gap-2 mb-6 sm:mb-8 overflow-x-auto pb-2">
              {Array.from({ length: 6 }).map((_, index) => {
                const width = `${4 + Math.random() * 10}%`;

                return (
                  <Skeleton
                    key={index}
                    style={{ width }}
                    className="h-9 sm:h-10 w-24 rounded-xl shrink-0 "
                  />
                );
              })}
            </div>

            {/* Skeleton para cards dos pratos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <Card
                  key={index}
                  className="border-0 bg-card/80 backdrop-blur-sm shadow-lg overflow-hidden"
                >
                  <Skeleton className="w-full aspect-16/10 rounded-none" />
                  <div className="p-4 sm:p-5 space-y-3">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="flex items-center justify-between pt-2">
                      <Skeleton className="h-8 w-24" />
                      <Skeleton className="h-9 w-28 rounded-xl" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
