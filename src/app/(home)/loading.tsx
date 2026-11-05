import { MainHeader } from "@/components/main-header";
import { Skeleton } from "@/components/ui/skeleton";
import { RestaurantGridSkeleton } from "@/components/restaurant-card-skeleton";

export default function HomePageLoading() {
  return (
    <>
      <MainHeader
        showSearch
        showLocation
        showCart
        showOrders
        showNotifications
      />

      <main className="flex-1 pt-24">
        {/* Banner */}
        <section className="px-4 mt-6">
          <div className="max-w-7xl mx-auto">
            <Skeleton className="h-52 md:h-72 rounded-3xl w-full" />
          </div>
        </section>

        {/* Novidades / Lojas */}
        <section className="px-4 mt-8">
          <div className="max-w-7xl mx-auto">
            <div className="mb-4 flex items-center justify-between">
              <Skeleton className="h-11 w-56 rounded-lg" />
              <Skeleton className="hidden h-4 w-28 sm:block" />
            </div>
            <div className="mb-6">
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-40" />
            </div>

            <RestaurantGridSkeleton count={6} />
          </div>
        </section>

        {/* Cupom */}
        <section className="px-4 mt-10 mb-12">
          <div className="max-w-7xl mx-auto">
            <Skeleton className="h-32 rounded-3xl w-full" />
          </div>
        </section>
      </main>
    </>
  );
}
