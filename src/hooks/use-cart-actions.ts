import { resolveRestaurantOpenStatus } from "@/constants/opening-hours";
import { useConfirm } from "@/contexts/confirm-provider";
import { useSound } from "@/hooks/use-sound";
import { apiService } from "@/services/api";
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

const waitForPendingWrites = async () => {
  // Em laço: uma escrita nova pode entrar enquanto as anteriores assentam
  while (pendingAddPromises.length || pendingQuantityWrites.length) {
    await Promise.allSettled([...pendingAddPromises, ...pendingQuantityWrites]);
  }
};

const hasPendingWrites = () =>
  pendingAddPromises.length > 0 || pendingQuantityWrites.length > 0;

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
  product?: { name?: string; imageURL?: { url: string }[] };
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
        const orderId = backendCart.id;

        setOrderId(orderId);

        const orderedItems = backendCart.orderedItems;
        const hasItems = orderedItems && orderedItems.length > 0;

        if (orderedItems && hasItems) {
          const companyId = backendCart.companyId || "";
          if (companyId) {
            setRestaurant({
              id: companyId,
              name: restaurant?.name || "Restaurante",
            });
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
                  restaurant?.name || existing?.restaurantName || "Restaurante",
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

      // Validação: verificar se o restaurante está aberto
      try {
        if (apiService.openingHours?.getByCompany) {
          const openingHoursRes = await queryClient.fetchQuery({
            queryKey: ["opening-hours", "public", item.restaurantId],
            queryFn: () =>
              apiService.openingHours.getByCompany(item.restaurantId),
            staleTime: 60 * 1000,
          });

          if (openingHoursRes?.data) {
            const openStatus = resolveRestaurantOpenStatus(
              openingHoursRes.data,
            );
            if (!openStatus.isOpen) {
              toast.error(
                openStatus.reason || "Este restaurante está fechado no momento.",
              );
              setLoading(false);
              return false;
            }
          }
        }
      } catch {
        // Ignora falha de requisição de horários para não travar indevidamente
      }

      // Flag para saber se precisamos criar um novo carrinho
      let needsNewCart = !orderId;

      // Validação: verificar se há itens de outro restaurante
      if (restaurant && restaurant.id !== item.restaurantId) {
        const confirmChange = await confirm({
          title: "Trocar de restaurante?",
          currentRestaurant: restaurant.name,
          newRestaurant: item.restaurantName,
          confirmText: "Sim, limpar carrinho",
          cancelText: "Não, manter atual",
          variant: "danger",
        });

        if (!confirmChange) {
          setLoading(false);
          return false;
        }

        // Limpar carrinho e resetar estado (sem mostrar toast de sucesso)
        await handleClearCart(false);
        // Após limpar, precisamos criar um novo carrinho
        needsNewCart = true;
      }

      // Atualizar restaurant no estado se for novo ou diferente
      if (!restaurant || restaurant.id !== item.restaurantId) {
        setRestaurant({
          id: item.restaurantId,
          name: item.restaurantName,
        });
      }

      // Criar carrinho no backend se necessário
      let currentOrderId = orderId;
      if (needsNewCart) {
        const orderResponse = await apiService.orders.openCart(user.id, {
          companyId: item.restaurantId,
          discount: 0,
          totalShipping: 0,
          totalValue: 0,
          status: "CART",
        });

        if (orderResponse.success && orderResponse.data?.id) {
          currentOrderId = orderResponse.data.id;
          // IMPORTANTE: Não remover o prefixo 'cart:' - o backend precisa dele
          setOrderId(currentOrderId);
        } else {
          throw new Error("Erro ao criar carrinho");
        }
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

      const revertAddToCart = (message?: string) => {
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
        setItems(revertedItems);
        toast.error(message || "Erro ao adicionar item. Tente novamente.");
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
          const recreated = await apiService.orders.openCart(user.id, {
            companyId: item.restaurantId,
            discount: 0,
            totalShipping: 0,
            totalValue: 0,
            status: "CART",
          });

          if (recreated.success && recreated.data?.id) {
            setOrderId(recreated.data.id);
            response = await apiService.orderItems.addProductToCart(
              recreated.data.id,
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

      const backgroundAdd = addItemToBackend(abortController.signal)
        .then((response) => {
          clearTimeout(timeoutId);
          pendingRequests.current.delete(cartItemKey);

          // A requisição pode resolver normalmente mesmo quando o backend
          // recusa (ex: 403 de permissão) - sem checar `success` o app
          // mantinha o item no carrinho local como se tivesse sido salvo
          if (!response.success) {
            revertAddToCart(response.message);
          }
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          pendingRequests.current.delete(cartItemKey);

          // Ignorar erros de abort (esperado)
          if (error.name === "AbortError") return;

          console.error("Erro ao adicionar item:", error);
          revertAddToCart();
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

    if (newItems.length === 0) {
      setRestaurant(null);
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
    if (!user?.id || !orderId) {
      clearCartLocal();
      return;
    }

    try {
      setLoading(true);
      await apiService.orders.clearCart(user.id, orderId);
      clearCartLocal();
      if (showToast) {
        toast.success("Carrinho limpo com sucesso");
      }
    } catch (error) {
      console.error("Erro ao limpar carrinho:", error);
      // Limpar local mesmo se der erro no backend
      clearCartLocal();
    } finally {
      setLoading(false);
    }
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
