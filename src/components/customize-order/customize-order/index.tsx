import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  useAllCategories,
  useCartActions,
  usePublicProductAddOns,
  usePublicProductVariations,
  useRestaurant,
  useRestaurantOpeningHours,
} from "@/hooks";
import { resolveRestaurantOpenStatus } from "@/constants/opening-hours";
import { useAuth } from "@/contexts/auth-provider";
import { isSellableVariation } from "@/lib/product-variation";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/utils";
import { Minus, Plus, X } from "lucide-react";
import type { Category, Product } from "@/services/api";
import type { ProductCategory } from "@/types/restaurant";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { SelectOptions } from "../select-options";

type Props = {
  productData: Product;
  isModalOpen: boolean;
  setIsModalOpen: (val: boolean) => void;
  isRestaurantOpen?: boolean;
  closedReason?: string;
  /**
   * Modo prévia (admin): mostra tamanhos/complementos/preço como o cliente vê,
   * mas sem "Adicionar"/carrinho — é só pra o lojista conferir (LDMF-465).
   */
  preview?: boolean;
};

export type ExtraOption = {
  id: string;
  label: string;
  price: number;
  maxQuantity?: number;
};

export type ExtraGroup = {
  id: "variation" | "addon";
  title: string;
  multiple: boolean;
  required?: boolean;
  options: ExtraOption[];
  /**
   * Preço base do prato. Quando presente, cada opção exibe o valor cheio
   * (base + opção) em vez do acréscimo - é como o tamanho é anunciado
   * ("6 Pedaços R$ 60,00"), igual à gestão do cardápio. A conta do total
   * não muda: `price` segue sendo o delta somado ao base.
   */
  basePrice?: number;
};

/**
 * Teto por complemento, aplicado a cada um de forma independente: dá pra
 * levar 4 de cada tipo, e não há limite de quantos tipos o cliente escolhe.
 */
const ADD_ON_MAX_QUANTITY = 4;

export function CustomizeOrder({
  productData,
  isModalOpen,
  setIsModalOpen,
  isRestaurantOpen: isRestaurantOpenProp,
  closedReason: closedReasonProp,
  preview = false,
}: Props) {
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [quantity, setQuantity] = useState(1);
  // Tamanho é escolha única (ids); complemento agora carrega quantidade,
  // então mora em `addOnQuantities` (id -> quantidade, 0 = fora do pedido).
  const [selections, setSelections] = useState<Record<string, string[]>>({
    variation: [],
    addon: [],
  });
  const [addOnQuantities, setAddOnQuantities] = useState<
    Record<string, number>
  >({});
  // Marca que o clique em "Adicionar" veio de visitante e ficou pendente
  // de login - o efeito lá embaixo refaz o clique quando a sessão chega.
  const [addAfterLogin, setAddAfterLogin] = useState(false);

  const { isAuthenticated, showAuthModal } = useAuth();

  // O back já suporta várias fotos por prato (productData.imageURL é um
  // array) - antes só a primeira era exibida. Sem foto nenhuma, cai no
  // placeholder.
  const images = productData.imageURL?.length
    ? productData.imageURL
    : [{ url: "/placeholder.svg" }];

  const [imageApi, setImageApi] = useState<CarouselApi>();
  const [currentImage, setCurrentImage] = useState(0);

  const updateCurrentImage = useCallback((api: CarouselApi) => {
    if (!api) return;
    setCurrentImage(api.selectedScrollSnap());
  }, []);

  useEffect(() => {
    if (!imageApi) return;

    setCurrentImage(0);
    updateCurrentImage(imageApi);
    imageApi.on("select", updateCurrentImage);
    imageApi.on("reInit", updateCurrentImage);

    return () => {
      imageApi.off("select", updateCurrentImage);
      imageApi.off("reInit", updateCurrentImage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageApi, productData.id]);

  const { data: restaurant, isLoading: restaurantLoading } = useRestaurant(
    productData.companyId,
  );
  const { data: openingHoursData } = useRestaurantOpeningHours(
    productData.companyId,
  );

  const computedOpenStatus = resolveRestaurantOpenStatus(
    openingHoursData,
    restaurant,
  );
  const isStoreOpen = isRestaurantOpenProp ?? computedOpenStatus.isOpen;
  const closedReasonText =
    closedReasonProp ||
    computedOpenStatus.reason ||
    "Restaurante fechado no momento.";

  const { handleAddToCart: addToCart } = useCartActions();

  const { data: categories } = useAllCategories();

  const { data: variations = [], isLoading: variationsLoading } =
    usePublicProductVariations(productData.id, productData.companyId);
  const { data: addOns = [], isLoading: addOnsLoading } =
    usePublicProductAddOns(productData.id, productData.companyId);

  // Enquanto isso ainda tá carregando, `extraGroups` fica vazio e nada
  // aparece pra clicar - mas se o clique em "Adicionar" cair bem nessa
  // janela (antes de tamanhos/complementos chegarem), o pedido sai sem eles
  // ou a função aborta em silêncio (restaurant ainda undefined). Trava o
  // botão até tudo estar pronto, em vez de deixar o usuário adicionar algo
  // incompleto que o backend depois rejeita (some do carrinho).
  const isCustomizationLoading =
    variationsLoading || addOnsLoading || restaurantLoading;

  const extraGroups: ExtraGroup[] = useMemo(() => {
    const groups: ExtraGroup[] = [];

    // Mesmo critério do "A partir de" do cardápio: tamanho sem estoque não
    // é vendável, então não entra na lista nem ancora a pré-seleção.
    const availableVariations = variations.filter(isSellableVariation);
    if (availableVariations.length > 0) {
      groups.push({
        id: "variation",
        title: "Tamanho",
        multiple: false,
        // O card do cardápio anuncia "a partir de" com o menor
        // priceModifier - se o tamanho fosse opcional, dava pra pular a
        // escolha e pagar só o salePrice, que é sempre menor que esse
        // "a partir de" (priceModifier nunca é negativo). Obrigatório
        // garante que o preço anunciado seja o que o cliente paga de fato.
        required: true,
        basePrice: Number(productData.salePrice || 0),
        // Do mais barato pro mais caro - a ordem que a API devolve é a de
        // cadastro. `sort` é estável: empate mantém a ordem de cadastro.
        options: [...availableVariations]
          .sort((a, b) => a.priceModifier - b.priceModifier)
          .map((v) => ({
            id: v.id,
            label: v.name,
            price: v.priceModifier,
          })),
      });
    }

    const availableAddOns = addOns.filter((a) => a.isAvailable);
    if (availableAddOns.length > 0) {
      groups.push({
        id: "addon",
        title: "Complementos",
        multiple: true,
        options: availableAddOns.map((a) => ({
          id: a.id,
          label: a.name,
          price: a.priceModifier,
          maxQuantity: a.maxQuantity,
        })),
      });
    }

    return groups;
  }, [variations, addOns, productData.salePrice]);

  // O tamanho mais barato entre os vendáveis já vem marcado - a escolha
  // continua obrigatória, mas o cliente que quer o preço base não precisa
  // procurar por ele.
  const cheapestVariationId = useMemo(() => {
    const options =
      extraGroups.find((group) => group.id === "variation")?.options ?? [];
    if (options.length === 0) return undefined;
    return options.reduce((cheapest, option) =>
      option.price < cheapest.price ? option : cheapest,
    ).id;
  }, [extraGroups]);

  // Só preenche quando não há escolha - não sobrescreve a do cliente. O
  // resetState ao fechar zera a seleção, então reabrir pré-seleciona de novo.
  useEffect(() => {
    if (!isModalOpen || !cheapestVariationId) return;
    setSelections((prev) =>
      prev.variation?.length
        ? prev
        : { ...prev, variation: [cheapestVariationId] },
    );
  }, [isModalOpen, cheapestVariationId]);

  const handleSelectionChange = (groupId: string, selectedIds: string[]) => {
    setSelections((prev) => ({ ...prev, [groupId]: selectedIds }));
  };

  // Trava o intervalo aqui também, e não só no `disabled` dos botões, pra
  // que o teto valha mesmo se a chamada vier de outro caminho.
  const handleAddOnQuantityChange = (
    optionId: string,
    nextQuantity: number,
  ) => {
    const addOn = addOns.find((a) => a.id === optionId);
    const maxLimit = addOn?.maxQuantity ?? ADD_ON_MAX_QUANTITY;
    const clamped = Math.min(Math.max(nextQuantity, 0), maxLimit);
    setAddOnQuantities((prev) => ({ ...prev, [optionId]: clamped }));
  };

  // Valor dos extras POR UNIDADE do produto: o complemento entra
  // multiplicado pela quantidade escolhida dele, e o resultado ainda é
  // multiplicado pela quantidade do item lá embaixo (totalPrice).
  const extrasTotal = useMemo(() => {
    return extraGroups.reduce((total, group) => {
      if (group.id === "addon") {
        return (
          total +
          group.options.reduce(
            (sum, option) =>
              sum + option.price * (addOnQuantities[option.id] ?? 0),
            0,
          )
        );
      }

      const selectedIds = selections[group.id] || [];
      const groupTotal = group.options
        .filter((option) => selectedIds.includes(option.id))
        .reduce((sum, option) => sum + option.price, 0);
      return total + groupTotal;
    }, 0);
  }, [extraGroups, selections, addOnQuantities]);

  const categoryMap = useMemo(() => {
    if (!categories) return {};

    return Object.fromEntries(categories.map((c: Category) => [c.id, c.name]));
  }, [categories]);

  const getProductCategoryNames = (
    productCategories: ProductCategory[] | undefined,
    categoryMap: Record<string, string>,
  ) => {
    if (!productCategories) return [];

    return productCategories
      .map((pc) => categoryMap[pc.categoryId])
      .filter(Boolean);
  };

  const resetState = () => {
    setQuantity(1);
    setSelections({ variation: [], addon: [] });
    setAddOnQuantities({});
    setAddAfterLogin(false);
  };

  const handleConfirmAddToCart = async () => {
    if (!productData || !restaurant || isCustomizationLoading) return;
    if (
      pendingRequiredGroup ||
      hasNoSellableVariation ||
      isProductOutOfStock
    ) {
      return;
    }
    if (maxAllowedQuantity !== undefined && quantity > maxAllowedQuantity) {
      return;
    }

    if (!isStoreOpen) {
      toast.error(closedReasonText);
      return;
    }

    // Visitante: pede o login aqui, sem fechar o modal nem descartar o que
    // ele montou. Checar antes de `addToCart` evita o toast de "precisa
    // estar logado" (use-cart-actions) competir com o AuthModal - o pedido
    // de login aparece uma vez só, no lugar certo. Vem depois do
    // `pendingRequiredGroup` de propósito: não faz sentido mandar alguém
    // logar pra só então avisar que falta escolher o tamanho.
    if (!isAuthenticated) {
      setAddAfterLogin(true);
      showAuthModal("login");
      return;
    }

    setIsAddingToCart(true);

    try {
      const selectedVariationId = selections.variation?.[0];

      const variationGroup = extraGroups.find((g) => g.id === "variation");
      const addOnGroup = extraGroups.find((g) => g.id === "addon");
      const variationLabel = variationGroup?.options.find(
        (o) => o.id === selectedVariationId,
      )?.label;

      // Só entra no pedido o complemento com quantidade > 0.
      const selectedAddOns = (addOnGroup?.options ?? [])
        .map((option) => ({
          option,
          addOnQuantity: addOnQuantities[option.id] ?? 0,
        }))
        .filter((entry) => entry.addOnQuantity > 0);

      const addOnLabels = selectedAddOns.map(({ option }) => option.label);

      const success = await addToCart({
        id: productData.id.toString(),
        name: productData.name,
        price: unitPrice,
        image: productData.imageURL?.[0]?.url || "/placeholder.svg",
        restaurantId: restaurant.id,
        restaurantName: restaurant.tradeName,
        quantity,
        variations: selectedVariationId
          ? [{ productVariationId: selectedVariationId }]
          : undefined,
        addOns: selectedAddOns.length
          ? selectedAddOns.map(({ option, addOnQuantity }) => ({
              productAddOnsId: option.id,
              quantity: addOnQuantity,
            }))
          : undefined,
        variationLabel,
        addOnLabels: addOnLabels.length ? addOnLabels : undefined,
      });

      if (success) {
        setIsModalOpen(false);
        resetState();
      }
    } catch (error) {
      console.error("Erro ao adicionar ao carrinho:", error);
    } finally {
      setIsAddingToCart(false);
    }
  };

  // O AuthModal abre por cima do modal do prato, que nunca desmonta - então
  // tamanho, complementos, quantidade e observação seguem na tela enquanto o
  // visitante loga. Assim que a sessão existe, o "Adicionar" que ficou
  // pendente é refeito sozinho e o item entra no carrinho.
  useEffect(() => {
    if (!addAfterLogin || !isAuthenticated) return;

    setAddAfterLogin(false);
    void handleConfirmAddToCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAfterLogin, isAuthenticated]);

  const productTags = getProductCategoryNames(
    productData.productCategories,
    categoryMap,
  );

  const handleModalClose = (val: boolean) => {
    resetState();
    setIsModalOpen(val);
  };

  const unitPrice = productData.salePrice + extrasTotal;

  const totalPrice = unitPrice * quantity;

  // Prato com tamanhos cadastrados, mas nenhum vendável: sem o grupo
  // Tamanho o item iria pro carrinho sem variação, pelo preço base - e não
  // está confirmado que o backend aceita isso. Trava o "Adicionar".
  const hasNoSellableVariation =
    !variationsLoading &&
    variations.length > 0 &&
    !variations.some(isSellableVariation);

  const selectedVariationId = selections.variation?.[0];
  const selectedVariation = variations.find((v) => v.id === selectedVariationId);

  const availableStock = useMemo(() => {
    if (variations.length > 0) {
      if (!selectedVariation) return 0;
      return selectedVariation.stockQuantity ?? 0;
    }
    return productData.stockQuantity;
  }, [variations.length, selectedVariation, productData.stockQuantity]);

  const isProductOutOfStock =
    !variationsLoading &&
    variations.length === 0 &&
    (productData.isAvailable === false ||
      (productData.stockQuantity !== undefined &&
        productData.stockQuantity <= 0));

  const maxAllowedQuantity =
    availableStock !== undefined ? Math.max(0, availableStock) : undefined;

  // Ajusta a quantidade se o tamanho selecionado tiver estoque menor que a quantidade atual
  useEffect(() => {
    if (
      maxAllowedQuantity !== undefined &&
      maxAllowedQuantity > 0 &&
      quantity > maxAllowedQuantity
    ) {
      setQuantity(maxAllowedQuantity);
    }
  }, [maxAllowedQuantity, quantity]);

  const pendingRequiredGroup = extraGroups.find(
    (group) => group.required && (selections[group.id]?.length ?? 0) === 0,
  );

  return (
    <Dialog
      open={isModalOpen}
      onOpenChange={(open) => {
        handleModalClose(open);
      }}
    >
      <DialogContent
        hideClose
        className="flex w-[calc(100%-2rem)] max-h-[86dvh] max-w-[440px] flex-col gap-0 overflow-hidden rounded-2xl border-0 p-0 shadow-2xl sm:w-full sm:rounded-2xl"
      >
        {/* Header image */}
        <div className="relative h-[118px] shrink-0 bg-muted">
          {images.length > 1 ? (
            <Carousel setApi={setImageApi} className="h-full" opts={{ loop: true }}>
              <CarouselContent className="ml-0 h-[118px]">
                {images.map((image, index) => (
                  <CarouselItem key={index} className="h-full pl-0">
                    <Image
                      width={440}
                      height={118}
                      src={image.url || "/placeholder.svg"}
                      alt={`${productData.name} - foto ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          ) : (
            <Image
              width={440}
              height={118}
              src={images[0].url || "/placeholder.svg"}
              alt={productData.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />

          {images.length > 1 && (
            <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
              {images.map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 rounded-full bg-card transition-all",
                    currentImage === index ? "w-4 opacity-100" : "w-1.5 opacity-60",
                  )}
                />
              ))}
            </div>
          )}

          {productTags.length > 0 && (
            <span className="absolute left-3 top-3 z-20 rounded-md bg-card/95 px-2.5 py-[3px] text-[10.5px] font-extrabold text-foreground">
              {productTags[0]}
            </span>
          )}

          <button
            type="button"
            onClick={() => handleModalClose(false)}
            className="absolute right-3 top-3 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-card/95 text-foreground transition hover:bg-card"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Radix requires a title/description for a11y; the product name is shown visually below */}
        <DialogTitle className="sr-only">{productData.name}</DialogTitle>
        <DialogDescription className="sr-only">
          {productData.description || productData.name}
        </DialogDescription>

        {/* Scrollable middle section - keeps header and footer always visible */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-3 pt-3.5">
          {/* Sem preço aqui: o do tamanho aparece em cada opção e o total
              fica no botão "Adicionar" - repetir o preço base confundia
              (parecia que o prato saía por ele). */}
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-extrabold tracking-[-0.02em] text-foreground">
              {productData.name}
            </h2>
            {productData.description && (
              <p className="mt-[3px] text-[12.5px] font-medium text-muted-foreground">
                {productData.description}
              </p>
            )}
          </div>

          <div className="mt-3.5 flex flex-col gap-3.5">
            {isCustomizationLoading ? (
              <div className="flex flex-col gap-1.5">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="h-[50px] animate-pulse rounded-[10px] bg-muted" />
                  <div className="h-[50px] animate-pulse rounded-[10px] bg-muted" />
                  <div className="h-[50px] animate-pulse rounded-[10px] bg-muted" />
                </div>
              </div>
            ) : (
              extraGroups.map((group) => (
                <SelectOptions
                  key={group.id}
                  group={group}
                  selectedIds={selections[group.id] || []}
                  onChange={handleSelectionChange}
                  quantities={addOnQuantities}
                  onQuantityChange={handleAddOnQuantityChange}
                  maxQuantity={ADD_ON_MAX_QUANTITY}
                />
              ))
            )}
          </div>
        </div>

        {!preview && !isStoreOpen && (
          <div
            role="alert"
            className="border-t border-orange-200 bg-orange-50 px-4 py-2.5 text-center text-xs font-semibold text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
          >
            {closedReasonText}
          </div>
        )}

        {/* Quantity and Add button */}
        <div className="flex shrink-0 items-center gap-3 border-t border-border bg-card px-[18px] py-3">
          <div className="flex h-10 shrink-0 items-center gap-0.5 rounded-[10px] bg-muted px-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1 || !isStoreOpen || isProductOutOfStock}
              className="flex h-8 w-[30px] items-center justify-center rounded-lg text-foreground disabled:opacity-40"
              aria-label="Diminuir quantidade"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[22px] text-center text-sm font-extrabold text-foreground">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() =>
                setQuantity((q) =>
                  maxAllowedQuantity !== undefined
                    ? Math.min(q + 1, maxAllowedQuantity)
                    : q + 1,
                )
              }
              disabled={
                !isStoreOpen ||
                isProductOutOfStock ||
                (maxAllowedQuantity !== undefined &&
                  quantity >= maxAllowedQuantity)
              }
              className="flex h-8 w-[30px] items-center justify-center rounded-lg text-foreground disabled:opacity-40"
              aria-label="Aumentar quantidade"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {preview ? (
            <div className="flex h-10 flex-1 items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-muted text-[13px] font-bold text-muted-foreground">
              <span>Prévia</span>
              <span className="opacity-60">•</span>
              <span>{formatCurrency(totalPrice)}</span>
            </div>
          ) : (
            <Button
              onClick={handleConfirmAddToCart}
              disabled={
                !isStoreOpen ||
                isProductOutOfStock ||
                isAddingToCart ||
                isCustomizationLoading ||
                !!pendingRequiredGroup ||
                hasNoSellableVariation
              }
              className="h-10 flex-1 rounded-[10px] bg-brand-500 text-[13.5px] font-extrabold text-white shadow-[0_4px_12px_var(--tw-shadow-color)] shadow-brand-500/30 hover:bg-brand-600 disabled:opacity-60"
            >
              {isCustomizationLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                Carregando...
              </span>
            ) : !isStoreOpen ? (
              <span>Restaurante fechado</span>
            ) : isProductOutOfStock ? (
              <span>Esgotado</span>
            ) : isAddingToCart ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                Adicionando...
              </span>
            ) : hasNoSellableVariation ? (
              <span>Sem tamanhos disponíveis</span>
            ) : pendingRequiredGroup ? (
              <span>Selecione {pendingRequiredGroup.title.toLowerCase()}</span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>Adicionar</span>
                <span className="opacity-60">•</span>
                <span>{formatCurrency(totalPrice)}</span>
              </span>
            )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
