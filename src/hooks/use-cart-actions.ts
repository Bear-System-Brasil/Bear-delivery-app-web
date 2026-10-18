import { resolveRestaurantOpenStatus } from "@/constants/opening-hours";
import { useConfirm } from "@/contexts/confirm-provider";
import { useSound } from "@/hooks/use-sound";
import { fetchFreshRestaurantOpeningHours } from "@/hooks/use-opening-hours";
import type { Product, ProductVariation } from "@/services/api";
import { apiService } from "@/services/api";
import { getCartItemStock, getCartStockIssues } from "@/lib/cart-stock";
import { getRestaurant } from "@/services/restaurant";
import { useCartStore } from "@/stores";
import { useAuthStore } from "@/stores/auth-store";
import { getErrorMessage } from "@/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Hook para gerenciar ações do carrinho com integração Backend Redis
 * Sincroniza estado local com carrinho no backend
 */

// Escopo de módulo (compartilhado entre TODAS as instâncias do hook) - evita
// que MainHeader + BottomBar + a página em si, todos montando useCartActions
// ao mesmo tempo, disparem 3 fetches simultâneos toda navegação.
let lastSyncAttempt = 0;
const SYNC_THROTTLE_MS = 3000;

// Promessas de "add ao carrinho" ainda em voo (POST em background, não
// esperado por quem chamou handleAddToCart - é o que dá a sensação de
// instantâneo). Se o usuário navegar pra /cart logo em seguida, o sync-on-
// mount da página pode rodar ANTES desse POST terminar de persistir no
// backend, ler o carrinho ainda sem o item novo e sobrescrever o estado
// otimista - o carrinho aparece vazio até um reload. O sync-on-mount espera
// essas promessas assentarem antes de confiar numa leitura do backend.
let pendingAddPromises: Promise<unknown>[] = [];

// Rajadas de "+"/"–" que o backend ainda não confirmou: debounce correndo,
// requisição na fila ou em voo. Mesmo papel de `pendingAddPromises` - uma
// leitura do backend feita agora traria a quantidade de antes da rajada e
// sobrescreveria a tela (LDMF-247).
let pendingQuantityWrites: Promise<unknown>[] = [];

// Muda a cada escrita local no carrinho. O sync compara antes e depois da
// leitura: se mudou, a resposta nasceu velha e é descartada.
let cartWriteVersion = 0;

// Fila de requisições de quantidade por linha. A rajada seguinte espera a
// anterior terminar em vez de abortá-la - o abort não garante que o backend
// deixou de aplicar, nem que aplicou, e o POST soma: o incremento abortado
// se perdia (LDMF-247).
const quantityQueues = new Map<string, Promise<void>>();

const trackQuantityWrite = (promise: Promise<unknown>) => {
  pendingQuantityWrites.push(promise);
  promise.finally(() => {
    pendingQuantityWrites = pendingQuantityWrites.filter((p) => p !== promise);
  });
};

const enqueueQuantityRequest = (itemId: string, send: () => Promise<void>) => {
  const previous = quantityQueues.get(itemId) ?? Promise.resolve();
  const request = previous.then(send);
  quantityQueues.set(itemId, request);
  request.finally(() => {
    if (quantityQueues.get(itemId) === request) quantityQueues.delete(itemId);
  });
  return request;
};

// Carrinhos sendo apagados no backend porque ficaram vazios (LDMF-317). O
// próximo "Adicionar" espera: se o POST /order chegasse antes do DELETE,
// o backend devolveria o carrinho velho, preso à loja antiga.
let pendingCartResets: Promise<unknown>[] = [];

const trackCartReset = (promise: Promise<unknown>) => {
  pendingCartResets.push(promise);
  promise.finally(() => {
    pendingCartResets = pendingCartResets.filter((p) => p !== promise);
  });
};

const waitForCartResets = async () => {
  while (pendingCartResets.length) {
    await Promise.allSettled([...pendingCartResets]);
  }
};

const waitForPendingWrites = async () => {
  // Em laço: uma escrita nova pode entrar enquanto as anteriores assentam
  while (
    pendingAddPromises.length ||
    pendingQuantityWrites.length ||
    pendingCartResets.length
  ) {
    await Promise.allSettled([
      ...pendingAddPromises,
      ...pendingQuantityWrites,
      ...pendingCartResets,
    ]);
  }
};

const hasPendingWrites = () =>
  pendingAddPromises.length > 0 ||
  pendingQuantityWrites.length > 0 ||
  pendingCartResets.length > 0;

/**
 * DELETE /order/:id. 404 conta como sucesso: o carrinho já não existe, que
 * é o que se queria. `apiRequest` não lança em 4xx - por isso o `success`.
 */
const deleteBackendCart = async (userId: string, cartId: string) => {
  try {
    const response = await apiService.orders.clearCart(userId, cartId);
    return response.success || response.status === 404;
  } catch {
    return false;
  }
};

const SYNC_MAX_ATTEMPTS = 3;

/**
 * O carrinho no Redis devolve addOns/variations com o nome da relação
 * aninhada variando conforme o include do backend (ver comentário em
 * `syncCartFromBackend`) - por isso todos os campos de rótulo aqui são
 * opcionais e checados em cascata.
 */
interface BackendCartAddOn {
  id?: string;
  productAddOnsId?: string;
  quantity?: number;
  priceSnapshot?: number;
  productAddOn?: { id?: string; name?: string; description?: string };
  productAddOns?: { id?: string; name?: string; description?: string };
  addOn?: { id?: string; name?: string; description?: string };
  name?: string;
  description?: string;
}

interface BackendCartVariation {
  id?: string;
  productVariationId?: string;
  priceSnapshot?: number;
  variation?: { id?: string; name?: string; description?: string };
  productVariation?: { id?: string; name?: string; description?: string };
  name?: string;
  description?: string;
}

interface BackendCartItem {
  productId: string;
  unitPrice: number;
  quantity: number;
  addIngredient?: Record<string, unknown>;
  product?: { name?: string; companyId?: string; imageURL?: { url: string }[] };
  addOns?: BackendCartAddOn[];
  variations?: BackendCartVariation[];
}

interface BackendCart {
  id: string;
  companyId?: string;
  orderedItems?: BackendCartItem[];
}

/**
 * Chave de LINHA do carrinho: produto + combinação exata de tamanho/
 * complementos escolhida. Sem isso, "Burger Pequeno" e "Burger Médio"
 * colidiam no mesmo `id` (o productId), então viravam uma linha só com
 * quantidade somada e o preço/tamanho do primeiro que foi adicionado.
 */
const buildCartItemKey = (
  productId: string,
  variations?: { productVariationId: string }[],
  addOns?: { productAddOnsId: string; quantity: number }[],
) => {
  const variationPart = (variations || [])
    .map((v) => v.productVariationId?.trim())
    .filter((id): id is string => Boolean(id))
    .sort()
    .join(",");
  // A quantidade entra na chave: com o stepper de complementos, "2x queijo"
  // e "3x queijo" são combinações diferentes. Sem isso as duas caíam na
  // mesma linha e o merge só somava a quantidade do item, mantendo o preço
  // da primeira - o mesmo problema que o comentário acima descreve pros
  // tamanhos.
  const addOnPart = (addOns || [])
    .filter((a) => Boolean(a.productAddOnsId?.trim()) && (a.quantity || 0) > 0)
    .map((a) => `${a.productAddOnsId.trim()}x${a.quantity || 1}`)
    .sort()
    .join(",");
  return `${productId}::${variationPart}::${addOnPart}`;
};

export const useCartActions = () => {
  const router = useRouter();
  const { user } = useAuthStore();
  const { confirm } = useConfirm();
  const { play } = useSound("customer");
  const queryClient = useQueryClient();
  const {
    items,
    restaurant,
    orderId,
    isLoading,
    setItems,
    setRestaurant,
    setOrderId,
    setLoading,
    clearCart: clearCartLocal,
    getTotalItems,
    getTotalPrice,
  } = useCartStore();

  // ==== CONTRAMEDIDAS CONTRA RACE CONDITIONS ====
  // Map para rastrear requisições pendentes por itemId
  const pendingRequests = useRef<Map<string, AbortController>>(new Map());

  // Debounce timers para atualizações de quantidade
  const updateTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Quantidade que o backend conhece de cada item enquanto há um debounce
  // pendente. A diferença enviada é "final - base", não "final - valor do
  // clique anterior" - senão cliques rápidos mandam só o último incremento.
  const debounceBaseQuantities = useRef<Map<string, number>>(new Map());

  // Resolve a promessa de "rajada pendente" (ver pendingQuantityWrites)
  // quando a requisição dela termina ou a rajada é descartada.
  const burstFinishers = useRef<Map<string, () => void>>(new Map());

  /**
   * Nome da loja pelo id. O carrinho do backend só traz `companyId`; o nome
   * vem do mesmo cache do `useRestaurant` (GET /company/:id). Devolve null
   * quando não dá para saber - quem chama decide, em vez de mostrar o nome
   * de outra loja ou um "Restaurante" genérico (LDMF-317).
   */
  const resolveRestaurantName = async (
    companyId: string,
  ): Promise<string | null> => {
    const current = useCartStore.getState().restaurant;
    if (current?.id === companyId && current.name) return current.name;

    try {
      const company = await queryClient.fetchQuery({
        queryKey: ["restaurant", companyId],
        queryFn: () => getRestaurant(companyId),
        staleTime: 15 * 60 * 1000,
      });
      return company?.tradeName?.trim() || null;
    } catch {
      return null;
    }
  };

  /**
   * Busca carrinho do backend e atualiza estado local
   * IMPORTANTE: Erro 404 é ESPERADO quando o usuário não tem carrinho ativo
   * (ex: primeira vez acessando ou após finalizar pedido)
   */
  const syncCartFromBackend = async () => {
    for (let attempt = 0; attempt < SYNC_MAX_ATTEMPTS; attempt++) {
      if (await readCartFromBackend()) return;
    }
  };

  /**
   * Uma leitura do carrinho. Devolve false quando a resposta foi descartada
   * por ter nascido velha - houve escrita local durante a leitura.
   */
  const readCartFromBackend = async (): Promise<boolean> => {
    if (!user?.id) return true;

    try {
      // Escrita local ainda não confirmada: ler agora traria o carrinho de
      // antes dela e sobrescreveria o estado otimista.
      await waitForPendingWrites();
      const versionAtRead = cartWriteVersion;
      const isStale = () =>
        cartWriteVersion !== versionAtRead || hasPendingWrites();

      const cartKey = `cart:${user.id}`;
      const response = await apiService.orders.viewOrder(user.id, cartKey);

      // A conta pode ter trocado (logout, outra conta entrando) enquanto a
      // leitura estava em voo - aplicar a resposta agora poria o carrinho
      // da conta anterior na sessão da seguinte (LDMF-239).
      if (useAuthStore.getState().user?.id !== user.id) return true;

      // Clique em "+"/"–" ou item adicionado durante a leitura (LDMF-247)
      if (isStale()) return false;

      if (response.success && response.data) {
        const backendCart = response.data as BackendCart;

        const orderedItems = backendCart.orderedItems;
        const hasItems = orderedItems && orderedItems.length > 0;

        if (orderedItems && hasItems) {
          setOrderId(backendCart.id);

          // A loja vem do backend; id e nome sempre da mesma loja. Antes o
          // nome vinha do store local, e o carrinho mostrava o id de uma
          // loja com o nome de outra, ou só "Restaurante" (LDMF-317).
          const companyId = backendCart.companyId || "";
          let restaurantName = "";
          if (companyId) {
            restaurantName = (await resolveRestaurantName(companyId)) ?? "";
            if (isStale()) return false;
            setRestaurant({ id: companyId, name: restaurantName });
          }

          // Antes de sobrescrever `items`, guarda o que já tínhamos por
          // chave de linha - se a releitura do backend não conseguir
          // reconstruir o rótulo (formato aninhado incerto/variável), o
          // item mantém o que já estava certo em vez de perder o texto de
          // tamanho/complemento a cada sync.
          const currentItemsById = new Map(
            useCartStore.getState().items.map((i) => [i.id, i]),
          );

          // O carrinho ainda vive no Redis (antes do checkout) e essa
          // leitura pode devolver só os IDs de tamanho/complemento, sem
          // nome/descrição resolvidos - diferente do pedido já persistido
          // no Postgres (GET /order/company), que vem com o nome aninhado.
          // Busca o catálogo da empresa (mesma fonte que o modal de
          // personalização usa) e resolve o nome pelo ID como último
          // recurso. Via queryClient (não apiService direto) pra reaproveitar
          // o cache de 5min entre syncs em vez de rebuscar tudo a cada vez
          // que o carrinho sincroniza (throttled a 1x/3s, mas ainda assim
          // gerava 2 requests novos por sync sem necessidade).
          let addOnNameById = new Map<string, string>();
          let variationNameById = new Map<string, string>();
          if (companyId) {
            const [addOnsRes, variationsRes] = await Promise.all([
              queryClient.fetchQuery({
                queryKey: ["product-add-ons", "public", "company", companyId],
                queryFn: () => apiService.productAddOns.getAllPublic(companyId),
                staleTime: 5 * 60 * 1000,
              }),
              queryClient.fetchQuery({
                queryKey: [
                  "product-variations",
                  "public",
                  "company",
                  companyId,
                ],
                queryFn: () =>
                  apiService.productVariations.getAllPublic(companyId),
                staleTime: 5 * 60 * 1000,
              }),
            ]);
            if (addOnsRes.success && addOnsRes.data) {
              addOnNameById = new Map(
                addOnsRes.data.map((a) => [a.id, a.name]),
              );
            }
            if (variationsRes.success && variationsRes.data) {
              variationNameById = new Map(
                variationsRes.data.map((v) => [v.id, v.name]),
              );
            }
          }

          // O catálogo também é uma espera: confere de novo antes de escrever
          if (isStale()) return false;

          interface GroupedCartEntry {
            item: BackendCartItem;
            totalQuantity: number;
            addOnsTotal: number;
            variationsTotal: number;
            variations: { productVariationId: string }[];
            addOns: { productAddOnsId: string; quantity: number }[];
            variationLabel: string;
            addOnLabels: string[];
          }

          const groupedMap = new Map<string, GroupedCartEntry>();

          for (const item of orderedItems) {
            // item.unitPrice é só o preço base do produto - os extras de
            // tamanho/complemento vêm à parte, em addOns[]/variations[]
            // (cada um com seu priceSnapshot). Sem somar isso aqui, o
            // carrinho "esquece" o valor adicionado assim que sincroniza
            // com o backend (ex: ao entrar em /cart), voltando pro preço
            // original do prato.
            const addOnsTotal = (item.addOns || []).reduce(
              (sum: number, addOn) =>
                sum + (addOn.priceSnapshot || 0) * (addOn.quantity || 1),
              0,
            );
            const variationsTotal = (item.variations || []).reduce(
              (sum: number, variation) =>
                sum + (variation.priceSnapshot || 0),
              0,
            );

            const variations = (item.variations || [])
              .map((v) => {
                const varId =
                  v.productVariationId ||
                  v.productVariation?.id ||
                  v.variation?.id ||
                  v.id;
                return varId ? { productVariationId: varId } : null;
              })
              .filter((v): v is { productVariationId: string } => Boolean(v));

            const addOns = (item.addOns || [])
              .map((a) => {
                const addOnId =
                  a.productAddOnsId ||
                  a.productAddOn?.id ||
                  a.productAddOns?.id ||
                  a.addOn?.id ||
                  a.id;
                return addOnId
                  ? { productAddOnsId: addOnId, quantity: a.quantity || 1 }
                  : null;
              })
              .filter(
                (a): a is { productAddOnsId: string; quantity: number } =>
                  Boolean(a),
              );

            // Nome pode vir aninhado de formas diferentes dependendo do
            // include do backend - tenta os formatos conhecidos e ignora
            // o que não bater, em vez de quebrar a linha do carrinho.
            const variationLabel = (item.variations || [])
              .map((v) => {
                const varId =
                  v.productVariationId ||
                  v.productVariation?.id ||
                  v.variation?.id ||
                  v.id;
                return (
                  v.variation?.name ||
                  v.productVariation?.name ||
                  v.productVariation?.description ||
                  v.name ||
                  v.description ||
                  (varId ? variationNameById.get(varId) : undefined)
                );
              })
              .filter(Boolean)
              .join(", ");

            const addOnLabels = (item.addOns || [])
              .map((a) => {
                const addOnId =
                  a.productAddOnsId ||
                  a.productAddOn?.id ||
                  a.productAddOns?.id ||
                  a.addOn?.id ||
                  a.id;
                return (
                  a.productAddOn?.name ||
                  a.productAddOns?.name ||
                  a.productAddOns?.description ||
                  a.addOn?.name ||
                  a.name ||
                  a.description ||
                  (addOnId ? addOnNameById.get(addOnId) : undefined)
                );
              })
              .filter((label): label is string => Boolean(label));

            // Agrupa itens do backend com a mesma chave (mesmo produto +
            // mesma variação + mesmos adicionais). No Redis o backend
            // adiciona novos itens no array em vez de somar a quantidade;
            // sem agrupar aqui, o usuário via o mesmo produto duplicado
            // em linhas separadas em vez de uma linha com quantidade somada.
            const id = buildCartItemKey(item.productId, variations, addOns);
            const qty = item.quantity || 1;

            const existingGroup = groupedMap.get(id);
            if (existingGroup) {
              existingGroup.totalQuantity += qty;
              if (!existingGroup.variationLabel && variationLabel) {
                existingGroup.variationLabel = variationLabel;
              }
              if (
                existingGroup.addOnLabels.length === 0 &&
                addOnLabels.length > 0
              ) {
                existingGroup.addOnLabels = addOnLabels;
              }
            } else {
              groupedMap.set(id, {
                item,
                totalQuantity: qty,
                addOnsTotal,
                variationsTotal,
                variations,
                addOns,
                variationLabel,
                addOnLabels,
              });
            }
          }

          const cartItems = Array.from(groupedMap.entries()).map(
            ([id, group]) => {
              const {
                item,
                totalQuantity,
                addOnsTotal,
                variationsTotal,
                variations,
                addOns,
                variationLabel,
                addOnLabels,
              } = group;
              const existing = currentItemsById.get(id);

              return {
                id,
                productId: item.productId,
                name: item.product?.name || existing?.name || "Produto",
                price: item.unitPrice + addOnsTotal + variationsTotal,
                quantity: totalQuantity,
                imageUrl:
                  item.product?.imageURL?.[0]?.url || existing?.imageUrl,
                restaurantId: companyId,
                restaurantName:
                  restaurantName ||
                  (existing?.restaurantId === companyId
                    ? existing.restaurantName
                    : ""),
                customizations:
                  item.addIngredient || existing?.customizations || undefined,
                variationLabel: variationLabel || existing?.variationLabel,
                addOnLabels: addOnLabels.length
                  ? addOnLabels
                  : existing?.addOnLabels,
                variations: variations.length ? variations : undefined,
                addOns: addOns.length ? addOns : undefined,
              };
            },
          );
          setItems(cartItems);
        } else {
          // Carrinho vazio no backend continua preso à loja antiga: guardar
          // o orderId dele faria o próximo item, de qualquer loja, cair
          // nele sem aviso (LDMF-317). Sem orderId, o próximo "Adicionar"
          // passa pelo POST /order, que confere a loja.
          setOrderId(null);
          setRestaurant(null);
          setItems([]);
        }
      }
    } catch (error) {
      // 404 é esperado quando não há carrinho ativo
    }
    return true;
  };

  /**
   * "Trocar de restaurante?" com o nome real da loja do carrinho. Sem
   * conseguir o nome, não pergunta às cegas: avisa e não adiciona.
   */
  const confirmRestaurantChange = async (
    currentRestaurantId: string,
    newRestaurantName: string,
  ) => {
    const currentName = await resolveRestaurantName(currentRestaurantId);
    if (!currentName) {
      toast.error(
        "Não conseguimos confirmar a loja do seu carrinho. Tente novamente.",
      );
      return false;
    }

    return confirm({
      title: "Trocar de restaurante?",
      currentRestaurant: currentName,
      newRestaurant: newRestaurantName,
      confirmText: "Sim, limpar carrinho",
      cancelText: "Não, manter atual",
      variant: "danger",
    });
  };

  /**
   * POST /order para a loja pedida. Com carrinho já existente, o backend
   * devolve ele com a loja ANTIGA e ignora o `companyId` enviado (medido
   * em 15/10, LDMF-317) - aceitar calado põe o item na loja errada.
   * - Carrinho devolvido vazio: apaga e pede de novo.
   * - Com itens: pergunta "Trocar de restaurante?" (só com `interactive`;
   *   sem, lança erro). Cancelando, devolve null e o local passa a mostrar
   *   o carrinho real.
   */
  const openCartFor = async (
    restaurantId: string,
    restaurantName: string,
    { interactive }: { interactive: boolean },
  ): Promise<string | null> => {
    const userId = user!.id;

    // Duas voltas: a segunda só acontece depois de apagar o carrinho velho
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await apiService.orders.openCart(userId, {
        companyId: restaurantId,
        discount: 0,
        totalShipping: 0,
        totalValue: 0,
        status: "CART",
      });

      if (!response.success || !response.data?.id) {
        throw new Error("Erro ao criar carrinho");
      }

      const cart = response.data as unknown as BackendCart;
      if (!cart.companyId || cart.companyId === restaurantId) return cart.id;

      const hasItems = (cart.orderedItems?.length ?? 0) > 0;
      if (hasItems) {
        if (!interactive) {
          throw new Error(
            "Seu carrinho tem itens de outra loja. Revise o carrinho e tente novamente.",
          );
        }

        const confirmChange = await confirmRestaurantChange(
          cart.companyId,
          restaurantName,
        );
        if (!confirmChange) {
          await syncCartFromBackend();
          return null;
        }
      }

      if (!(await deleteBackendCart(userId, cart.id))) {
        throw new Error(
          "Não foi possível limpar o carrinho anterior. Tente novamente.",
        );
      }
      if (hasItems) clearCartLocal();
    }

    throw new Error(
      "Não foi possível abrir um carrinho para esta loja. Tente novamente.",
    );
  };

  /**
   * Adiciona um item ao carrinho (backend + local)
   */
  const handleAddToCart = async (item: {
    id: string;
    name: string;
    price: number;
    quantity?: number;
    restaurantId: string;
    restaurantName: string;
    image?: string;
    addOns?: { productAddOnsId: string; quantity: number }[];
    variations?: { productVariationId: string }[];
    variationLabel?: string;
    addOnLabels?: string[];
  }) => {
    if (!user?.id) {
      toast.error("Você precisa estar logado para adicionar itens ao carrinho");
      return false;
    }

    try {
      setLoading(true);

      // Validação: verificar se o restaurante está aberto. Usa a mesma
      // consulta do selo: gravar outro formato nessa chave fazia o selo
      // mostrar "Fechado" logo depois de adicionar (LDMF-374).
      try {
        const openingHours = await fetchFreshRestaurantOpeningHours(
          queryClient,
          item.restaurantId,
        );
        const openStatus = resolveRestaurantOpenStatus(openingHours);
        if (!openStatus.isOpen) {
          toast.error(
            openStatus.reason || "Este restaurante está fechado no momento.",
          );
          setLoading(false);
          return false;
        }
      } catch {
        // Ignora falha de requisição de horários para não travar indevidamente
      }

      // Um carrinho que acabou de esvaziar ainda pode estar sendo apagado
      await waitForCartResets();

      // Lê do store, não do render: o closure pode estar atrasado (ex.:
      // "Repetir pedido" chama esta função em laço com o render do clique).
      let { restaurant: cartRestaurant, orderId: cartOrderId } =
        useCartStore.getState();

      // orderId sem loja: carrinho de antes de recarregar a página, ainda
      // não lido. Sem ler antes, o item cairia nele sem o aviso de troca.
      if (cartOrderId && !cartRestaurant) {
        await syncCartFromBackend();
        ({ restaurant: cartRestaurant, orderId: cartOrderId } =
          useCartStore.getState());
      }

      // Sem loja conhecida, o carrinho existente (se houver) não é
      // reaproveitado às cegas: o POST /order devolve ele e confere a loja.
      let needsNewCart = !cartOrderId || !cartRestaurant;

      // Compara com a loja real do carrinho - a do backend, depois do sync
      if (cartRestaurant && cartRestaurant.id !== item.restaurantId) {
        const confirmChange = await confirmRestaurantChange(
          cartRestaurant.id,
          item.restaurantName,
        );

        if (!confirmChange) {
          setLoading(false);
          return false;
        }

        // Limpar carrinho e resetar estado (sem mostrar toast de sucesso).
        // Se o backend não limpou, para aqui: o erro já foi mostrado.
        if (!(await handleClearCart(false))) {
          setLoading(false);
          return false;
        }
        needsNewCart = true;
      }

      // Criar carrinho no backend se necessário
      let currentOrderId = cartOrderId;
      if (needsNewCart) {
        // Uma leitura do backend em voo agora traria o carrinho de antes
        cartWriteVersion++;
        const openedId = await openCartFor(
          item.restaurantId,
          item.restaurantName,
          { interactive: true },
        );
        if (!openedId) {
          setLoading(false);
          return false;
        }
        currentOrderId = openedId;
        // IMPORTANTE: Não remover o prefixo 'cart:' - o backend precisa dele
        setOrderId(currentOrderId);
      }

      // Atualizar restaurant no estado se for novo ou diferente
      const latestRestaurant = useCartStore.getState().restaurant;
      if (!latestRestaurant || latestRestaurant.id !== item.restaurantId) {
        setRestaurant({
          id: item.restaurantId,
          name: item.restaurantName,
        });
      }

      // Verificar se temos um orderId válido
      if (!currentOrderId) {
        throw new Error("Erro: carrinho não foi criado corretamente");
      }

      // ===== OPTIMISTIC UPDATE =====
      // Adicionar item localmente ANTES da API responder (melhor UX)
      const cartItemKey = buildCartItemKey(
        item.id,
        item.variations,
        item.addOns,
      );

      const optimisticItem = {
        id: cartItemKey,
        productId: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity || 1,
        imageUrl: item.image,
        restaurantId: item.restaurantId,
        restaurantName: item.restaurantName,
        variationLabel: item.variationLabel,
        addOnLabels: item.addOnLabels,
        variations: item.variations,
        addOns: item.addOns,
      };

      // Verificar se essa MESMA combinação (produto + tamanho + complementos)
      // já existe no carrinho - combinações diferentes viram linhas separadas
      // Lê do store, não do `items` da renderização: se o carrinho acabou de
      // ser limpo (troca de restaurante), o `items` do closure ainda tem os
      // itens antigos.
      const currentCartItems = useCartStore.getState().items;
      const existingItemIndex = currentCartItems.findIndex(
        (i) => i.id === cartItemKey,
      );
      let newItems;

      if (existingItemIndex >= 0) {
        // Item já existe, aumentar quantidade
        newItems = [...currentCartItems];
        newItems[existingItemIndex] = {
          ...newItems[existingItemIndex],
          quantity: newItems[existingItemIndex].quantity + (item.quantity || 1),
        };
      } else {
        // Novo item
        newItems = [...currentCartItems, optimisticItem];
      }

      // Atualizar estado local imediatamente
      cartWriteVersion++;
      setItems(newItems);
      // Primeira nota do motivo, curtinha e baixa. É a única micro-interação
      // com som no app: se cada toque apitasse, o som deixaria de significar
      // qualquer coisa.
      play("cart-add");
      toast.success(`${item.name} adicionado ao carrinho!`);

      // ===== API CALL EM BACKGROUND =====
      // Fazer requisição ao backend em paralelo (não bloqueia UX)
      // SEM syncCartFromBackend() - economiza 1-2s por operação

      // CONTRAMEDIDA: Cancelar requisição anterior se houver
      if (pendingRequests.current.has(cartItemKey)) {
        pendingRequests.current.get(cartItemKey)?.abort();
      }

      const abortController = new AbortController();
      pendingRequests.current.set(cartItemKey, abortController);

      // Timeout de 10 segundos (previne requisições travadas)
      const timeoutId = setTimeout(() => abortController.abort(), 10000);

      // Reverte pela QUANTIDADE que essa chamada tentou adicionar, não pro
      // valor absoluto de antes dela - se outra chamada mais recente para o
      // mesmo item já mudou o carrinho nesse meio-tempo, subtrair só o que
      // essa tentativa somou preserva a mudança da outra em vez de apagá-la.
      const addedQuantity = item.quantity || 1;

      const revertAddToCart = (message?: string, { silent = false } = {}) => {
        const currentItems = useCartStore.getState().items;
        const existing = currentItems.find((i) => i.id === cartItemKey);
        const revertedItems =
          existing && existing.quantity > addedQuantity
            ? currentItems.map((i) =>
              i.id === cartItemKey
                ? { ...i, quantity: i.quantity - addedQuantity }
                : i,
            )
            : currentItems.filter((i) => i.id !== cartItemKey);
        cartWriteVersion++;
        setItems(revertedItems);
        if (!silent) {
          toast.error(message || "Erro ao adicionar item. Tente novamente.");
        }
      };

      const addItemToBackend = async (signal: AbortSignal) => {
        const extras = {
          addOns: item.addOns,
          variations: item.variations,
        };

        let response = await apiService.orderItems.addProductToCart(
          currentOrderId,
          item.id,
          user.id,
          item.quantity || 1,
          extras,
          signal,
        );

        // 404 aqui significa que o orderId guardado no localStorage não existe
        // mais no backend (pedido ja finalizado ou carrinho expirado no Redis).
        // Nesse caso abrimos um carrinho novo e tentamos de novo, em vez de
        // insistir num id morto e falhar toda adição de item.
        if (!response.success && response.status === 404) {
          // Em segundo plano não dá para perguntar nada: carrinho de outra
          // loja com itens vira erro e o item é desfeito.
          let recreatedId: string | null;
          try {
            recreatedId = await openCartFor(
              item.restaurantId,
              item.restaurantName,
              { interactive: false },
            );
          } catch (error) {
            return {
              success: false,
              message: getErrorMessage(error, "Erro ao criar carrinho"),
            };
          }

          if (recreatedId) {
            setOrderId(recreatedId);
            response = await apiService.orderItems.addProductToCart(
              recreatedId,
              item.id,
              user.id,
              item.quantity || 1,
              extras,
              signal,
            );
          }
        }

        return response;
      };

      // Devolve o companyId do carrinho quando o item caiu no carrinho de
      // outra loja (já desfeito), ou null
      const backgroundAdd = addItemToBackend(abortController.signal)
        .then(async (response): Promise<string | null> => {
          clearTimeout(timeoutId);
          pendingRequests.current.delete(cartItemKey);

          // A requisição pode resolver normalmente mesmo quando o backend
          // recusa (ex: 403 de permissão) - sem checar `success` o app
          // mantinha o item no carrinho local como se tivesse sido salvo
          if (!response.success) {
            revertAddToCart(response.message);
            return null;
          }

          // Outra aba pode ter trocado o carrinho do backend sem esta saber:
          // o mesmo `cart:<userId>`, agora preso a outra loja. O backend
          // aceita o item mesmo assim (LDMF-347) - desfaz aqui, antes de
          // qualquer leitura do carrinho, e quem chamou pergunta depois.
          const cart = response.data as unknown as BackendCart | undefined;
          if (cart?.companyId && cart.companyId !== item.restaurantId) {
            await apiService.orderItems
              .removeProductFromCart(
                user.id,
                cart.id || currentOrderId,
                item.id,
                addedQuantity,
              )
              .catch(() => undefined);
            revertAddToCart(undefined, { silent: true });
            return cart.companyId;
          }
          return null;
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          pendingRequests.current.delete(cartItemKey);

          // Ignorar erros de abort (esperado)
          if (error.name === "AbortError") return null;

          console.error("Erro ao adicionar item:", error);
          revertAddToCart();
          return null;
        });

      // Registrado pra quem for sincronizar do backend (ex: ao entrar em
      // /cart) esperar essa escrita assentar antes de ler - ver
      // waitForPendingWrites.
      pendingAddPromises.push(backgroundAdd);
      backgroundAdd.finally(() => {
        pendingAddPromises = pendingAddPromises.filter(
          (p) => p !== backgroundAdd,
        );
      });

      // Fora da promessa registrada: o sync aqui dentro esperaria por ela
      // mesma. O local passa a mostrar o carrinho real e o cliente escolhe.
      backgroundAdd.then(async (foreignCompanyId) => {
        if (!foreignCompanyId) return;

        await syncCartFromBackend();
        const confirmChange = await confirmRestaurantChange(
          foreignCompanyId,
          item.restaurantName,
        );
        if (!confirmChange) return;
        if (!(await handleClearCart(false))) return;
        await handleAddToCart(item);
      });

      // Retornar true imediatamente (optimistic)
      return true;
    } catch (error) {
      console.error("Erro ao adicionar item:", error);
      toast.error(getErrorMessage(error, "Erro ao adicionar item ao carrinho"));
      return false;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Encerra a rajada de "+"/"–" de uma linha sem enviá-la (a linha vai ser
   * removida). Devolve a quantidade de antes da rajada - é o que o backend
   * vai ter depois da fila, já que a diferença dela nunca saiu.
   */
  const cancelQuantityBurst = (itemId: string) => {
    const unsentBase = debounceBaseQuantities.current.get(itemId);
    if (updateTimers.current.has(itemId)) {
      clearTimeout(updateTimers.current.get(itemId)!);
      updateTimers.current.delete(itemId);
    }
    debounceBaseQuantities.current.delete(itemId);
    burstFinishers.current.get(itemId)?.();
    burstFinishers.current.delete(itemId);
    return unsentBase;
  };

  /**
   * Remove um item do carrinho (OPTIMISTIC - instantâneo)
   */
  const handleRemoveFromCart = async (itemId: string) => {
    if (!user?.id || !orderId) return;

    if (pendingRequests.current.has(itemId)) {
      pendingRequests.current.get(itemId)?.abort();
      pendingRequests.current.delete(itemId);
    }
    const unsentBase = cancelQuantityBurst(itemId);

    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    // ===== OPTIMISTIC UPDATE =====
    cartWriteVersion++;
    const newItems = items.filter((i) => i.id !== itemId);
    setItems(newItems);

    // Último item: o carrinho inteiro sai, no backend e no local. Guardar o
    // orderId fazia o próximo item, de qualquer loja, cair no carrinho
    // vazio preso à loja antiga - e o pedido ia para ela (LDMF-317).
    const isLastItem = newItems.length === 0;
    const previousRestaurant = useCartStore.getState().restaurant;
    if (isLastItem) {
      setRestaurant(null);
      setOrderId(null);
    }

    toast.success("Item removido do carrinho");

    // ===== API CALL EM BACKGROUND =====
    // Backend só entende productId, não a linha específica (produto +
    // tamanho/complemento) - ver nota em buildCartItemKey.
    // Remove o que o backend vai ter, não o que a tela mostra: com uma
    // rajada ainda no debounce (ex.: "–" de 3 até 0), a tela já está à
    // frente do backend (LDMF-247). Entra na fila da linha para sair depois
    // de qualquer "+"/"–" ainda em voo.
    const userId = user.id;
    const currentOrderId = orderId;
    const quantityToRemove = unsentBase ?? item.quantity;

    if (isLastItem) {
      const request = enqueueQuantityRequest(itemId, async () => {
        if (await deleteBackendCart(userId, currentOrderId)) return;

        // Falhou: o carrinho continua no backend - devolve tudo como estava
        setItems([...useCartStore.getState().items, item]);
        setRestaurant(
          previousRestaurant ?? {
            id: item.restaurantId,
            name: item.restaurantName,
          },
        );
        setOrderId(currentOrderId);
        toast.error("Erro ao remover. Tente novamente.");
      });
      trackQuantityWrite(request);
      trackCartReset(request);
      return;
    }

    const request = enqueueQuantityRequest(itemId, () =>
      apiService.orderItems
        .removeProductFromCart(
          userId,
          currentOrderId,
          item.productId,
          quantityToRemove,
        )
        .then(() => undefined)
        .catch(() => {
          const currentItems = useCartStore.getState().items;
          setItems([...currentItems, item]);

          if (currentItems.length === 0) {
            setRestaurant({ id: item.restaurantId, name: item.restaurantName });
          }

          toast.error("Erro ao remover. Tente novamente.");
        }),
    );
    trackQuantityWrite(request);
  };

  /**
   * Envia a rajada de "+"/"–" de uma linha: a diferença entre a quantidade
   * atual e a de antes da rajada. Entra na fila da linha - se a rajada
   * anterior ainda está em voo, espera ela terminar.
   */
  const sendQuantityBurst = (itemId: string) => {
    updateTimers.current.delete(itemId);
    const baseQuantity = debounceBaseQuantities.current.get(itemId);
    debounceBaseQuantities.current.delete(itemId);
    const finishBurst = burstFinishers.current.get(itemId) ?? (() => {});
    burstFinishers.current.delete(itemId);

    // Lê dos stores, não do render: no unmount esta função roda com o
    // closure do último render, que pode estar atrasado
    const userId = useAuthStore.getState().user?.id;
    const currentOrderId = useCartStore.getState().orderId;
    const currentItem = useCartStore
      .getState()
      .items.find((i) => i.id === itemId);

    if (!userId || !currentOrderId || !currentItem || baseQuantity === undefined) {
      finishBurst();
      return;
    }

    const diff = currentItem.quantity - baseQuantity;
    if (diff === 0) {
      finishBurst();
      return;
    }

    // Reverte subtraindo o `diff` que ESSA rajada tentou aplicar, do valor
    // atual - preserva a rajada seguinte, que já mudou a tela por cima.
    const revertQuantity = (message?: string) => {
      const currentItems = useCartStore.getState().items;
      const revertedItems = currentItems.map((i) =>
        i.id === itemId
          ? { ...i, quantity: Math.max(1, i.quantity - diff) }
          : i,
      );
      setItems(revertedItems);
      toast.error(message || "Erro ao atualizar. Tente novamente.");
    };

    const request = enqueueQuantityRequest(itemId, async () => {
      // Só o timeout aborta: uma requisição travada não pode segurar a fila
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 10000);

      try {
        // Backend só entende productId, não a linha específica (produto +
        // tamanho/complemento) - ver nota em buildCartItemKey. No incremento
        // dá pra reduzir a ambiguidade mandando addOns/variations (o endpoint
        // já aceita, é o mesmo usado em handleAddToCart); no decremento não -
        // DELETE /order-item/cart/:orderId/products/:productId/:quantity não
        // tem como receber extras.
        const response =
          diff > 0
            ? await apiService.orderItems.addProductToCart(
              currentOrderId,
              currentItem.productId,
              userId,
              diff,
              { addOns: currentItem.addOns, variations: currentItem.variations },
              abortController.signal,
            )
            : await apiService.orderItems.removeProductFromCart(
              userId,
              currentOrderId,
              currentItem.productId,
              Math.abs(diff),
              abortController.signal,
            );

        if (!response.success) {
          revertQuantity(response.message);
        }
      } catch (error) {
        console.error("Erro ao atualizar quantidade:", error);
        revertQuantity();
      } finally {
        clearTimeout(timeoutId);
      }
    });

    request.finally(finishBurst);
  };

  // O cleanup do unmount roda com o closure do primeiro render
  const sendQuantityBurstRef = useRef(sendQuantityBurst);
  sendQuantityBurstRef.current = sendQuantityBurst;

  /**
   * Atualiza a quantidade de um item (OPTIMISTIC + DEBOUNCED)
   * CONTRAMEDIDA: Debounce de 300ms para evitar múltiplas requisições
   */
  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    if (!user?.id || !orderId) return;

    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    // Se nova quantidade é 0 ou negativa, remover item
    if (newQuantity <= 0) {
      handleRemoveFromCart(itemId);
      return;
    }

    // Se a quantidade estiver aumentando, valida contra o estoque se disponível
    if (newQuantity > item.quantity) {
      const targetRestaurantId = restaurant?.id || item.restaurantId;
      if (targetRestaurantId) {
        const cachedVariations = queryClient.getQueryData<ProductVariation[]>([
          "product-variations",
          "public",
          "by-company",
          targetRestaurantId,
        ]);
        const cachedProducts = queryClient.getQueryData<Product[]>([
          "products",
          "company",
          targetRestaurantId,
        ]);

        if (
          (cachedVariations && cachedVariations.length > 0) ||
          (cachedProducts && cachedProducts.length > 0)
        ) {
          const itemStock = getCartItemStock(
            item,
            cachedProducts ?? [],
            cachedVariations ?? [],
          );
          if (
            itemStock.availableStock !== undefined &&
            newQuantity > itemStock.availableStock
          ) {
            toast.error("Quantidade excede o estoque disponível.");
            return;
          }
        }
      }
    }

    // Primeiro clique da rajada: guarda a quantidade antes dela e marca a
    // rajada como pendente até a requisição dela terminar - o sync espera
    if (!debounceBaseQuantities.current.has(itemId)) {
      debounceBaseQuantities.current.set(itemId, item.quantity);
      let finishBurst = () => {};
      trackQuantityWrite(
        new Promise<void>((resolve) => {
          finishBurst = resolve;
        }),
      );
      burstFinishers.current.set(itemId, finishBurst);
    }

    // ===== OPTIMISTIC UPDATE IMEDIATO =====
    cartWriteVersion++;
    const newItems = items.map((i) =>
      i.id === itemId ? { ...i, quantity: newQuantity } : i,
    );
    setItems(newItems);

    // ===== DEBOUNCE: Aguardar 300ms antes de enviar API =====
    // CONTRAMEDIDA: Se usuário clicar múltiplas vezes, só envia a última
    if (updateTimers.current.has(itemId)) {
      clearTimeout(updateTimers.current.get(itemId)!);
    }

    const timer = setTimeout(() => sendQuantityBurst(itemId), 300);
    updateTimers.current.set(itemId, timer);
  };

  /**
   * Limpa o carrinho (backend + local)
   */
  const handleClearCart = async (showToast: boolean = true) => {
    // Do store, não do render: pode ser chamada logo depois de outra escrita
    const currentOrderId = useCartStore.getState().orderId;
    if (!user?.id || !currentOrderId) {
      clearCartLocal();
      return true;
    }

    setLoading(true);
    const request = deleteBackendCart(user.id, currentOrderId);
    trackCartReset(request);
    const deleted = await request;
    setLoading(false);

    // Limpar só o local deixava o carrinho de pé no backend, preso à loja
    // antiga - o próximo item caía nele (LDMF-317). Mantém o carrinho na
    // tela para o cliente tentar de novo.
    if (!deleted) {
      toast.error("Não foi possível limpar o carrinho. Tente novamente.");
      return false;
    }

    clearCartLocal();
    if (showToast) {
      toast.success("Carrinho limpo com sucesso");
    }
    return true;
  };

  /**
   * Navega para o checkout
   */
  const handleGoToCheckout = () => {
    if (items.length === 0) {
      toast.error("Seu carrinho está vazio");
      return;
    }

    const targetRestaurantId = restaurant?.id || items[0]?.restaurantId;
    if (targetRestaurantId) {
      const cachedOpeningHours = queryClient.getQueryData<{
        data?: Parameters<typeof resolveRestaurantOpenStatus>[0];
      }>(["opening-hours", "public", targetRestaurantId]);

      if (cachedOpeningHours?.data) {
        const openStatus = resolveRestaurantOpenStatus(
          cachedOpeningHours.data,
        );
        if (!openStatus.isOpen) {
          toast.error(
            openStatus.reason || "Este restaurante está fechado no momento.",
          );
          return;
        }
      }

      // Se houver dados de produtos/variações no cache do React Query, valida estoque
      const cachedVariations = queryClient.getQueryData<ProductVariation[]>([
        "product-variations",
        "public",
        "by-company",
        targetRestaurantId,
      ]);
      const cachedProducts = queryClient.getQueryData<Product[]>([
        "products",
        "company",
        targetRestaurantId,
      ]);

      if (
        (cachedVariations && cachedVariations.length > 0) ||
        (cachedProducts && cachedProducts.length > 0)
      ) {
        const stockResult = getCartStockIssues(
          items,
          cachedProducts ?? [],
          cachedVariations ?? [],
        );
        if (stockResult.hasIssues) {
          toast.error(
            "Remova ou ajuste os itens esgotados antes de finalizar o pedido.",
          );
          return;
        }
      }
    }

    router.push("/checkout");
  };

  /**
   * Navega para a página do carrinho
   */
  const handleGoToCart = () => {
    router.push("/cart");
  };

  /**
   * Verifica se um produto (qualquer combinação de tamanho/complemento)
   * está no carrinho
   */
  const isItemInCart = (productId: string): boolean => {
    return items.some((item) => item.productId === productId);
  };

  /**
   * Retorna a quantidade total de um produto no carrinho, somando todas
   * as combinações de tamanho/complemento
   */
  const getItemQuantity = (productId: string): number => {
    return items
      .filter((item) => item.productId === productId)
      .reduce((total, item) => total + item.quantity, 0);
  };

  // Sync cart on mount (non-blocking).
  // Antes só rodava se `items` estivesse vazio - como `items` não é
  // persistido (só `orderId` é, ver cart-store.ts), isso fazia o carrinho
  // só se auto-corrigir depois de um reload de página (que zera `items`).
  // Dentro da mesma sessão (navegação SPA), um estado local desalinhado do
  // backend nunca era corrigido. Agora sempre resincroniza ao montar,
  // com um throttle de módulo pra não disparar 1 fetch por componente
  // (MainHeader, BottomBar, página) montando o hook ao mesmo tempo.
  useEffect(() => {
    if (!user?.id) return;

    const now = Date.now();
    if (now - lastSyncAttempt < SYNC_THROTTLE_MS) return;
    lastSyncAttempt = now;

    // O sync espera qualquer escrita em voo ("Adicionar", "+", "–") antes
    // de ler do backend - senão a leitura chega primeiro e sobrescreve o
    // estado otimista (ex: tocar "Adicionar" e ir direto pra /cart).
    syncCartFromBackend().catch(() => {
      // Ignore errors - doesn't block UX
    });
  }, [syncCartFromBackend, user?.id]);

  // CLEANUP: ao desmontar, envia na hora as rajadas que ainda estavam no
  // debounce - descartar o timer perdia o clique feito logo antes de sair
  // da tela, e a quantidade voltava no próximo sync (LDMF-247).
  // NÃO abortar `pendingRequests` aqui: esses AbortControllers são de
  // chamadas que gravam no backend (Redis) + store global (Zustand), não
  // estado local do componente - não há "setState em componente
  // desmontado" a evitar. Abortar no unmount só derrubava o POST de
  // handleAddToCart bem no meio do caminho sempre que o componente que
  // iniciou a chamada desmontava antes dela terminar (ex: modal fecha e o
  // usuário toca em "Ver carrinho" logo em seguida, navegando pra /cart e
  // desmontando a página/modal) - o catch de AbortError ignora isso
  // silenciosamente (nem reverte nem avisa), e o sync do backend na
  // página seguinte lia o carrinho sem o item que acabou de ganhar o toast
  // de sucesso. Isso sabotava o próprio mecanismo (`pendingAddPromises`/
  // `waitForPendingWrites`) feito pra essas requisições sobreviverem à
  // navegação.
  useEffect(() => {
    const timers = updateTimers.current;
    return () => {
      timers.forEach((timer, itemId) => {
        clearTimeout(timer);
        sendQuantityBurstRef.current(itemId);
      });
      timers.clear();
    };
  }, []);

  return {
    items,
    restaurant,
    orderId,
    isLoading,
    totalItems: getTotalItems(),
    totalPrice: getTotalPrice(),
    handleAddToCart,
    handleRemoveFromCart,
    handleUpdateQuantity,
    handleGoToCheckout,
    handleGoToCart,
    handleClearCart,
    isItemInCart,
    getItemQuantity,
    syncCartFromBackend,
  };
};
