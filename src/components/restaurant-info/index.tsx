"use client";

import { useMemo, useState, useEffect, useRef } from "react";

import { useParams, useRouter } from "next/navigation";
import {
  Clock3,
  Info,
  MapPin,
  Phone,
  ShoppingBag,
  Star,
  UtensilsCrossed,
} from "lucide-react";

import { CustomizeOrder } from "@/components/customize-order/customize-order";
import { MainHeader } from "@/components/main-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { GradientButton } from "@/components/ui/gradient-button";
import { Skeleton } from "@/components/ui/skeleton";
import { MenuItemsList } from "@/components/menu-items-list";
import {
  RestaurantHero,
  resolveRestaurantRating,
} from "@/components/restaurant-info/restaurant-hero";
import { RestaurantReviews } from "@/components/restaurant-info/restaurant-reviews";
import { groupMenuByCategory } from "@/lib/menu-grouping";
import {
  getTodayKey,
  resolveRestaurantOpenStatus,
  toDayHours,
  type RestaurantOpenStatus,
} from "@/constants/opening-hours";
import { useAllCategories } from "@/hooks/use-categories";
import { useCartActions } from "@/hooks/use-cart-actions";
import { useCompanyProducts } from "@/hooks/use-products";
import { useCompanyReviews } from "@/hooks/use-company-reviews";
import { usePublicCompanyProductVariations } from "@/hooks/use-product-variations";
import { useRestaurant } from "@/hooks/use-restaurants";
import { useRestaurantOpeningHours } from "@/hooks/use-opening-hours";
import { useSyncedUserLocation } from "@/hooks/use-synced-user-location";
import {
  getRestaurantCoords,
  resolveStoreDeliveryFee,
} from "@/lib/shipping-fee";
import { useFavoritesStore } from "@/stores";
import { useAuthStore } from "@/stores/auth-store";
import { formatCurrency } from "@/utils/format-currency";
import { isCompanyStaffRole } from "@/utils/role-helpers";
import type { Category, OpeningHoursResponse, Product } from "@/services/api";
import type { Restaurant } from "@/types/restaurant";

// Função para gerar IDs seguros e sem colisão
function slugify(text: string) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Troca espaços e caracteres especiais por hífen
    .replace(/(^-|-$)+/g, ""); // Remove hifens sobrando nas pontas
}


type RestaurantTab = "menu" | "info" | "reviews";

const RESTAURANT_TABS: Array<{
  id: RestaurantTab;
  label: string;
  icon: typeof UtensilsCrossed;
}> = [
  { id: "menu", label: "Cardápio", icon: UtensilsCrossed },
  { id: "info", label: "Informações", icon: Info },
  { id: "reviews", label: "Avaliações", icon: Star },
];

export default function RestaurantPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as string;

  const { totalItems, totalPrice } = useCartActions();
  const { user } = useAuthStore();
  const { favorites, toggleFavorite } = useFavoritesStore();
  const isFavorite = favorites.includes(companyId);

  const {
    data: restaurant,
    isLoading: loadingRestaurant,
    error: restaurantError,
  } = useRestaurant(companyId);
  const {
    data: menuItems = [],
    isLoading: loadingProducts,
    error: productsError,
    // Cardápio do cliente atualiza ao vivo: refaz a busca ao focar a aba /
    // montar, pra refletir disponibilidade que o restaurante mudou (LDMF-445).
  } = useCompanyProducts(companyId, { live: true });
  const { data: allCategories } = useAllCategories();
  const { data: companyVariations = [] } =
    usePublicCompanyProductVariations(companyId);
  const { data: openingHoursData } = useRestaurantOpeningHours(companyId);
  const reviewsQuery = useCompanyReviews(companyId);
  const { location: userLocation } = useSyncedUserLocation();

  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [activeTab, setActiveTab] = useState<RestaurantTab>("menu");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Product | null>(null);

  const navRef = useRef<HTMLElement>(null);

  const loading = loadingRestaurant || loadingProducts;
  const error = restaurantError || productsError;

  const categoryMap = useMemo(() => {
    if (!allCategories) return {};
    return Object.fromEntries(
      allCategories.map((category: Category) => [category.id, category.name]),
    );
  }, [allCategories]);

  // Menor acréscimo entre os tamanhos que o cliente realmente consegue
  // pedir - é o que vira o "A partir de" no card. A lista vem com as
  // variações da empresa inteira (o backend ignora o filtro productId),
  // então o agrupamento por prato é feito aqui.
  const minVariationModifierByProduct = useMemo(() => {
    const byProduct = new Map<string, number>();

    companyVariations.forEach((variation) => {
      // Sem estoque o tamanho não é vendável, então não pode ancorar o
      // "a partir de" - `stockQuantity` ausente conta como zero.
      if (!variation.isAvailable) return;
      if ((variation.stockQuantity ?? 0) <= 0) return;

      const current = byProduct.get(variation.productId);
      if (current === undefined || variation.priceModifier < current) {
        byProduct.set(variation.productId, variation.priceModifier);
      }
    });

    return byProduct;
  }, [companyVariations]);

  // Agrupa e ordena pelo util compartilhado (LDMF-454): a prévia do admin usa
  // o mesmo, pros dois não divergirem. Categoria 100% indisponível some
  // (LDMF-442); ordem pela position do back (LDMF-345).
  const { groupedItems, categories } = useMemo(
    () => groupMenuByCategory(menuItems, categoryMap),
    [menuItems, categoryMap],
  );

  // Define a primeira categoria como selecionada inicialmente
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0]);
    }
  }, [categories, selectedCategory]);

  // 3. Efeito para mudar a aba ativa no menu enquanto o usuário rola a página
  useEffect(() => {
    // Interrompe imediatamente se não houver categorias
    if (categories.length === 0) return;

    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const headerOffset = 150; // Compensação da altura do cabeçalho fixo

      let currentActive = categories[0];

      categories.forEach((category) => {
        // Busca usando o slug seguro
        const element = document.getElementById(
          `category-${slugify(category)}`,
        );
        if (element) {
          const elementTop = element.offsetTop;
          if (scrollPosition >= elementTop - headerOffset) {
            currentActive = category;
          }
        }
      });
      setSelectedCategory(currentActive);
    };

    // Adicionado { passive: true } para performance no mobile
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [categories]);

  // 4. Efeito para centralizar o botão da categoria no menu horizontal
  useEffect(() => {
    if (navRef.current && selectedCategory) {
      // Busca usando o slug seguro
      const activeButton = document.getElementById(
        `nav-btn-${slugify(selectedCategory)}`,
      );
      if (activeButton) {
        const nav = navRef.current;
        // Calcula a posição para centralizar o botão no scroll horizontal
        const scrollLeft =
          activeButton.offsetLeft -
          nav.offsetWidth / 2 +
          activeButton.offsetWidth / 2;
        nav.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }
  }, [selectedCategory]);

  // Função de Clique para rolar até a categoria
  const scrollToCategory = (categoryName: string) => {
    // Busca usando o slug seguro
    const element = document.getElementById(
      `category-${slugify(categoryName)}`,
    );
    if (element) {
      // Usa 120 para compensar o header fixo e a barra de categorias
      const y = element.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: y, behavior: "smooth" });
      setSelectedCategory(categoryName);
    }
  };

  // A nota vem do GET /reviews: o back não atualiza `rating`/`totalReviews`
  // da loja quando entra avaliação (LDMF-498). Enquanto as avaliações não
  // chegam (ou se falharem), fica o que a loja trouxer.
  const reviewsSummary = reviewsQuery.data;
  const { rating: restaurantRating, total: totalReviews } =
    resolveRestaurantRating(reviewsSummary, restaurant);
  // Frete (LDMF-534): o do back quando vier; senão, a mesma estimativa do
  // checkout (loja + endereço escolhido); sem endereço, "a partir de".
  // Tempo só quando a API mandar - o back não tem tempo antes do pedido.
  const deliveryFee = resolveStoreDeliveryFee({
    deliveryFee: restaurant?.deliveryFee,
    storeCoords: getRestaurantCoords(restaurant),
    customerCoords: userLocation
      ? { lat: userLocation.lat, lng: userLocation.lng }
      : null,
  });
  const deliveryTime = restaurant?.time?.trim() || null;
  // O cabeçalho escreve o "a partir de" à parte, menor que o valor.
  const deliveryLabel = deliveryFee.valueLabel;
  const isFreeDelivery = deliveryFee.isFree;
  const openStatus = resolveRestaurantOpenStatus(openingHoursData, restaurant);
  const isOpen = openStatus.isOpen;

  // Visitante deslogado abre o modal normalmente - descrição, tamanhos e
  // complementos são vitrine, não dado protegido. O login só é cobrado ao
  // tentar adicionar ao carrinho, onde `handleAddToCart` já barra quem não
  // tem sessão (use-cart-actions.ts). Pedir login antes de deixar ver o
  // prato afastava o visitante na etapa em que ele ainda está decidindo.
  const handleOpenModal = (item: Product) => {
    setSelectedItem(item);
    setIsModalOpen(true);
  };

  // Conta de restaurante tem sessão, mas não é quem faz pedido: vê o
  // cardápio em modo read-only, igual à prévia do admin - card não
  // clicável e sem "+" (LDMF-473). Antes o card parecia clicável e só
  // mostrava um toast de erro.
  const isStaffAccount = isCompanyStaffRole(user?.role);

  return (
    <AnimatedBackground showBlobs={false} className="bg-muted py-0">
      <MainHeader
        cartItems={totalItems}
        onCartClick={() => router.push("/cart")}
        showSearch
        showLocation
        showCart
        showOrders
        showNotifications
      />

      <main className="px-3 pb-28 pt-20 sm:px-5 sm:pt-24">
        <div className="mx-auto max-w-[1160px]">
          {loading ? (
            <RestaurantPageSkeleton />
          ) : error || !restaurant ? (
            <Card className="border-border bg-card p-8 text-center shadow-sm">
              <p className="mb-4 text-red-600 dark:text-red-400">
                {error?.message || "Restaurante não encontrado"}
              </p>
              <GradientButton onClick={() => router.push("/#lojas")} size="sm">
                Voltar para restaurantes
              </GradientButton>
            </Card>
          ) : (
            <>
              {/* === CABEÇALHO DO RESTAURANTE (LDMF-498) === */}
              <RestaurantHero
                restaurant={restaurant}
                isOpen={isOpen}
                isFavorite={isFavorite}
                onToggleFavorite={() => toggleFavorite(companyId)}
                onBack={() => router.push("/#lojas")}
                rating={restaurantRating}
                totalReviews={totalReviews}
                deliveryTime={deliveryTime}
                deliveryLabel={deliveryLabel}
                isFreeDelivery={isFreeDelivery}
                isDeliveryFeeFrom={deliveryFee.kind === "from"}
              />

              {/* Abas no lugar do botão "Informações" que abria uma gaveta. */}
              <div
                role="tablist"
                aria-label="Seções da loja"
                className="mt-3 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1 shadow-sm"
              >
                {RESTAURANT_TABS.map(({ id, label, icon: Icon }) => {
                  const selected = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      id={`tab-${id}`}
                      aria-selected={selected}
                      aria-controls={`painel-${id}`}
                      onClick={() => setActiveTab(id)}
                      className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold transition-colors sm:text-sm ${
                        selected
                          ? "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400"
                          : "text-foreground hover:bg-muted/60"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {activeTab === "info" && (
                <div
                  role="tabpanel"
                  id="painel-info"
                  aria-labelledby="tab-info"
                  className="mt-3"
                >
                  <RestaurantInfoDetails
                    restaurant={restaurant}
                    isOpen={isOpen}
                    openingHoursData={openingHoursData}
                    openStatus={openStatus}
                  />
                </div>
              )}

              {activeTab === "reviews" && (
                <div
                  role="tabpanel"
                  id="painel-reviews"
                  aria-labelledby="tab-reviews"
                  className="mt-3"
                >
                  <RestaurantReviews
                    summary={reviewsSummary}
                    isLoading={reviewsQuery.isLoading}
                    isError={reviewsQuery.isError}
                    onRetry={() => reviewsQuery.refetch()}
                  />
                </div>
              )}

              {activeTab === "menu" && (
                <div role="tabpanel" id="painel-menu" aria-labelledby="tab-menu">
                {/* === BARRA DE NAVEGAÇÃO DE CATEGORIAS FIXA ===
                    Gruda logo abaixo do header, que tem 52px (64px a partir
                    do sm) desde que ficou colado no topo (LDMF-495). */}
                <nav
                  ref={navRef}
                  className="sticky top-[52px] z-30 -mx-3 flex gap-2 overflow-x-auto bg-muted/95 px-3 py-3 scrollbar-hide sm:top-[64px] sm:-mx-5 sm:px-5"
                >
                  {categories.map((category) => {
                    const isActive = selectedCategory === category;
                    return (
                      <button
                        key={category}
                        id={`nav-btn-${slugify(category)}`} // Uso do slug
                        type="button"
                        onClick={() => scrollToCategory(category)}
                        className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium shadow-sm transition-all sm:h-9 sm:px-4 sm:text-sm ${
                          isActive
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-border bg-card text-foreground hover:border-orange-200 hover:bg-orange-50 dark:hover:border-orange-800 dark:hover:bg-orange-950/40"
                        }`}
                      >
                        {category}
                      </button>
                    );
                  })}
                </nav>

                {/* Lista de produtos: componente compartilhado com a prévia do
                    admin (LDMF-454). */}
                <MenuItemsList
                  className="mt-2"
                  categories={categories}
                  groupedItems={groupedItems}
                  minVariationByProduct={minVariationModifierByProduct}
                  onSelectItem={isStaffAccount ? undefined : handleOpenModal}
                />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {selectedItem && (
        <CustomizeOrder
          isModalOpen={isModalOpen}
          setIsModalOpen={setIsModalOpen}
          productData={selectedItem}
          isRestaurantOpen={isOpen}
          closedReason={openStatus.reason}
        />
      )}

      {totalItems > 0 && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 sm:left-4 sm:right-4 md:bottom-4">
          <div className="mx-auto max-w-[1160px] rounded-xl border border-border bg-card px-3 py-3 text-foreground shadow-lg sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ShoppingBag className="h-4 w-4 shrink-0 text-brand-400" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold sm:text-sm">
                    {totalItems} {totalItems === 1 ? "item" : "itens"} no
                    carrinho
                  </p>
                  <p className="text-[11px] font-medium text-muted-foreground sm:text-xs">
                    Total: {formatCurrency(totalPrice || 0)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => router.push("/cart")}
                className="h-9 shrink-0 rounded-lg bg-card px-3 text-xs font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40 sm:px-4"
              >
                Ver carrinho
              </Button>
            </div>
          </div>
        </div>
      )}
    </AnimatedBackground>
  );
}

function RestaurantPageSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-[260px] w-full rounded-[14px] sm:h-[300px] lg:h-[250px]" />
      <Skeleton className="h-[54px] w-full rounded-2xl" />

      <div className="flex gap-2 overflow-hidden py-3">
        {["a", "b", "c", "d"].map((item) => (
          <Skeleton key={item} className="h-8 w-20 shrink-0 rounded-lg" />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {["a", "b", "c", "d", "e", "f"].map((item) => (
          <Card
            key={item}
            className="flex min-h-[116px] gap-3 border-border bg-card p-3"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="mt-auto h-4 w-20" />
            </div>
            <Skeleton className="h-[92px] w-[92px] shrink-0 rounded-[10px]" />
          </Card>
        ))}
      </div>
    </div>
  );
}

type RestaurantInfoDetailsProps = {
  restaurant: Restaurant;
  isOpen: boolean | null;
  openingHoursData?: OpeningHoursResponse | null;
  openStatus?: RestaurantOpenStatus;
};

/**
 * Aba "Informações": endereço, telefone, descrição e horários. Era uma
 * gaveta aberta por botão; virou aba no LDMF-498.
 */
function RestaurantInfoDetails({
  restaurant,
  isOpen,
  openingHoursData,
  openStatus,
}: RestaurantInfoDetailsProps) {
  const address = restaurant.Address?.[0];
  const addressLine = address
    ? [
        [address.street, address.number].filter(Boolean).join(", "),
        address.neighborhood,
        [address.city, address.state].filter(Boolean).join(" - "),
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const description = restaurant.description?.trim();
  // Horário real quando a API mandar; se não houver horário cadastrado, exibe semana vazia sem mock
  const openingHours = openingHoursData
    ? toDayHours(openingHoursData)
    : toDayHours(null);
  const todayKey = getTodayKey();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-border bg-card px-4 pb-8 pt-4 sm:max-h-[85vh] sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-xl sm:w-[calc(100%-2rem)] sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl sm:p-6 sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-muted sm:hidden" />

        <div className="mx-auto w-full max-w-xl space-y-4">
          <div className="space-y-1">
            <SheetTitle className="pr-6 text-lg font-bold text-foreground">
              {restaurant.tradeName}
            </h2>
            {isOpen !== null && (
              <p
                className={`text-xs font-bold ${
                  isOpen
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-orange-600 dark:text-orange-400"
                }`}
              >
                {isOpen
                  ? "Aberto agora"
                  : openStatus?.nextOpeningLabel
                    ? `Fechado no momento · ${openStatus.nextOpeningLabel}`
                    : "Fechado no momento"}
              </p>
            )}
          </div>

          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}

          <div className="divide-y divide-border rounded-2xl border border-border">
            {addressLine && (
              <div className="flex items-start gap-3 px-4 py-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Endereço
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {addressLine}
                  </p>
                </div>
              </div>
            )}
            {restaurant.phone && (
              <a
                href={`tel:${restaurant.phone.replace(/\D/g, "")}`}
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Telefone
                  </p>
                  <p className="mt-0.5 text-sm text-foreground">
                    {restaurant.phone}
                  </p>
                </div>
              </a>
            )}
            {!addressLine && !restaurant.phone && (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                A loja ainda não informou endereço nem telefone.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Clock3 className="h-4 w-4 shrink-0 text-orange-500" />
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Horário de funcionamento
              </p>
            </div>
            {openStatus?.hasNoSchedule ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                A loja ainda não cadastrou horários de funcionamento.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {openingHours.map((day) => {
                  const isToday = day.day === todayKey;
                  return (
                    <li
                      key={day.day}
                      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm ${
                        isToday
                          ? "bg-orange-50/60 font-bold dark:bg-orange-950/30"
                          : ""
                      }`}
                    >
                      <span className="flex items-center gap-2 text-foreground">
                        {day.label}
                        {isToday && (
                          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase leading-none tracking-wide text-white">
                            Hoje
                          </span>
                        )}
                      </span>
                      <span
                        className={
                          day.isOpen ? "text-foreground" : "text-muted-foreground"
                        }
                      >
                        {day.isOpen
                          ? `${day.openTime} – ${day.closeTime}`
                          : "Fechado"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
    </div>
  );
}
