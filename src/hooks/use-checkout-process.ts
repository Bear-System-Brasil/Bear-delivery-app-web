import { useSound } from "@/hooks/use-sound";
import {
  apiService,
  PaymentMethod,
  type Address,
  type CreateOrderRequest,
} from "@/services/api";
import { useAuthStore, useCartStore } from "@/stores";
import { getDeliveryDiscount, getPromoDiscount } from "@/stores/cart-store";
import { getErrorMessage, onlyNumbers } from "@/utils";
import {
  resolveAddressCoordinates,
  withCoords,
  type CoordinateSource,
  type SourcedCoords,
} from "@/lib/address-coordinates";
import {
  restorePendingDefaultAddress,
  takeOverDefaultAddress,
  restoreDefaultAddress,
  unsetDefaultAddress,
  type PendingDefaultSwap,
} from "@/lib/default-address";
import { isClientRole } from "@/utils/role-helpers";
import { parseCoords } from "@/lib/geocode";
import {
  parseShippingCoords,
  resolveCheckoutShipping,
} from "@/lib/shipping-fee";
import { Coords } from "@/types/restaurant";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRestaurant } from "./use-restaurants";
import { useUserAddresses } from "./use-addresses";
import { useRestaurantOpeningHours } from "./use-opening-hours";
import { resolveRestaurantOpenStatus } from "@/constants/opening-hours";

function showCheckoutError(message: string) {
  toast.dismiss?.();
  toast.error(message);
}

/**
 * Opção escolhida no checkout -> forma gravada no pagamento. Crédito e débito
 * são opções separadas: antes era um "Cartão na maquininha" só, gravado
 * sempre como débito, e nenhuma tela sabia a forma de verdade.
 */
export const CHECKOUT_PAYMENT_METHODS: Record<string, PaymentMethod> = {
  cash: PaymentMethod.CASH,
  credit_card_machine: PaymentMethod.CREDIT_CARD,
  debit_card_machine: PaymentMethod.DEBIT_CARD,
  pix_on_delivery: PaymentMethod.PIX,
};

/**
 * Latitude/longitude não moram aqui: elas vivem em `addressCoords` junto com
 * a fonte que as produziu, porque quem decide se uma coordenada nova entra é
 * a prioridade da fonte (clique no mapa > geocodificação > CEP), não a ordem
 * em que os campos foram preenchidos.
 */
export interface DeliveryInfo {
  name: string;
  phone: string;
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
  reference: string;
}

/** Campos que, ao mudar, invalidam a coordenada herdada de um endereço salvo. */
const ADDRESS_TEXT_FIELDS = new Set([
  "zipCode",
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
]);

/** Chave do carrinho no Redis: `cart:<customerId>`. Nao e um id de pedido. */
const CART_KEY_PREFIX = "cart:";

function isPersistedOrderId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !value.startsWith(CART_KEY_PREFIX)
  );
}

function parsePositiveOrderTotal(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : null;
}

/**
 * Descobre o id e o totalValue do pedido gravado no banco depois do finishOrder.
 *
 * O carrinho vive no Redis sob `cart:<customerId>` e o pedido concluído ganha
 * UUID próprio e `totalValue` definitivo (já com o `totalShipping` calculado
 * pelo backend). Pagamento e entrega validam UUID, então mandar a chave do
 * carrinho faz o backend responder 400/403. Quando a resposta do finishOrder
 * vem com a chave do carrinho, buscamos o pedido recém-gravado na listagem
 * do cliente.
 */
async function resolveFinalOrder(
  finishedOrder: unknown,
  companyId: string,
): Promise<{ id: string | null; totalValue: number | null }> {
  const record = (finishedOrder ?? {}) as {
    id?: unknown;
    orderId?: unknown;
    totalValue?: unknown;
    order?: { id?: unknown; totalValue?: unknown };
  };
  const fromResponse = [record.id, record.orderId, record.order?.id].find(
    isPersistedOrderId,
  );
  const totalFromResponse =
    parsePositiveOrderTotal(record.totalValue) ??
    parsePositiveOrderTotal(record.order?.totalValue);

  if (fromResponse) {
    return { id: fromResponse, totalValue: totalFromResponse };
  }

  const response = await apiService.orders.getCustomerOrders();

  if (!response.success || !Array.isArray(response.data)) {
    return { id: null, totalValue: totalFromResponse };
  }

  const [mostRecent] = response.data
    .filter(
      (order) =>
        isPersistedOrderId(order?.id) &&
        order?.status !== "CART" &&
        (!companyId || !order?.companyId || order.companyId === companyId),
    )
    .sort(
      (first, second) =>
        new Date(second.created_at).getTime() -
        new Date(first.created_at).getTime(),
    );

  return {
    id: mostRecent?.id ?? null,
    totalValue:
      totalFromResponse ?? parsePositiveOrderTotal(mostRecent?.totalValue),
  };
}

/**
 * Hook completo para gerenciar todo o processo de checkout
 * Incluindo: endereços, formulário, pagamento e criação de pedido
 */
export const useCheckoutProcess = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { play, unlock } = useSound("customer");
  const { user } = useAuthStore();
  const cartStore = useCartStore();
  const {
    items: cartItems,
    restaurant,
    orderId: cartOrderId,
    appliedPromo,
    getTotal,
    getSubtotal,
    clearCart,
    setOrderId,
  } = cartStore;

  // O cart-store só guarda {id, name} do restaurante (ver cart-store.ts) -
  // buscamos os detalhes da loja (endereço/coordenadas e eventual deliveryFee)
  // para calcular o mesmo frete que o backend grava na finalização (LDMF-315).
  const { data: restaurantDetails } = useRestaurant(restaurant?.id ?? null);
  const { data: openingHoursData } = useRestaurantOpeningHours(
    restaurant?.id ?? null,
  );
  const openStatus = resolveRestaurantOpenStatus(
    openingHoursData,
    restaurantDetails ?? restaurant,
  );

  // Address management
  const { data: userAddresses = [], isLoading: loadingAddresses } =
    useUserAddresses();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [addressMode, setAddressMode] = useState<"select" | "new">("select");
  const [saveAddress, setSaveAddress] = useState(true);

  // Delivery vs pickup
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");

  // Form state
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({
    name: user?.name || "",
    phone: user?.phone || "",
    zipCode: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    complement: "",
    reference: "",
  });

  // Coordenada do endereço + de onde ela veio. Começa vazia de propósito:
  // enquanto não houver fonte real (clique no mapa, geocodificação ou CEP), o
  // endereço é salvo sem coordenada em vez de com um palpite errado.
  const [addressCoords, setAddressCoords] = useState<SourcedCoords | null>(
    null,
  );

  // Pagamento online foi removido: todo pedido é pago na entrega.
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [changeAmount, setChangeAmount] = useState(""); // Troco para dinheiro
  const [needsChange, setNeedsChange] = useState(false);
  const [paymentGatewayUrl, setPaymentGatewayUrl] = useState<string | null>(
    null,
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const submittingRef = useRef(false);

  // Calculated values:
  // - Em retirada (`pickup`), frete é R$ 0,00 ("Grátis").
  // - Em entrega (`delivery`), calcula o frete pela distância entre a loja e o
  //   endereço do cliente (mesma regra de POST /order/:id no backend) ou usa
  //   `restaurantDetails.deliveryFee` quando disponível.
  // - Se as coordenadas ainda não estão disponíveis, `isDeliveryFeeKnown` fica
  //   `false` para o checkout avisar que o frete é calculado na finalização em
  //   vez de exibir "Grátis" (LDMF-315).
  const subtotal = getSubtotal();
  const customerCoords =
    addressCoords &&
    !(
      addressMode === "new" &&
      !selectedAddressId &&
      addressCoords.source === "stored"
    )
      ? addressCoords.coords
      : null;
  const { deliveryFee, isDeliveryFeeKnown } = resolveCheckoutShipping({
    orderType,
    restaurant: restaurantDetails,
    customerCoords,
  });
  const deliveryDiscount = getDeliveryDiscount(appliedPromo, deliveryFee);
  const promoDiscount = getPromoDiscount(appliedPromo, subtotal);
  const rawCartTotal = getTotal(deliveryFee);
  const totalBeforeDiscounts =
    rawCartTotal >= subtotal + deliveryFee
      ? rawCartTotal
      : subtotal + deliveryFee;
  const total = Math.max(
    0,
    Math.round(
      (totalBeforeDiscounts - deliveryDiscount - promoDiscount) * 100,
    ) / 100,
  );

  /**
   * Carrega dados de um endereço no formulário
   */
  const loadAddressData = (address: Address) => {
    setDeliveryInfo((prev) => ({
      ...prev,
      zipCode: address.zipCode,
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      complement: address.complement || "",
      reference: address.reference || "",
    }));

    // A coordenada do endereço salvo vale enquanto o cliente não mexer no
    // texto dele - `handleInputChange` descarta quando isso acontece, para o
    // endereço novo não herdar o ponto do antigo.
    const coords =
      parseCoords(address.latitude, address.longitude) ??
      parseShippingCoords(address.latitude, address.longitude);

    setAddressCoords(coords ? { coords, source: "stored" } : null);
  };

  /**
   * Seleciona um endereço salvo
   */
  const handleAddressSelect = (addressId: string) => {
    setSelectedAddressId(addressId);
    const address = userAddresses.find((a: Address) => a.id === addressId);
    if (address) {
      loadAddressData(address);
    }
  };

  /**
   * Atualiza campo de entrega
   */
  const handleInputChange = (field: string, value: string | number) => {
    setDeliveryInfo((prev) => ({ ...prev, [field]: value }));

    // Endereço diferente, ponto diferente: a coordenada herdada de um endereço
    // salvo não sobrevive à edição do texto, senão o endereço novo seria
    // gravado no lugar do antigo.
    if (ADDRESS_TEXT_FIELDS.has(field)) {
      setAddressCoords((coords) =>
        coords?.source === "stored" ? null : coords,
      );
    }
  };

  /**
   * Registra uma coordenada respeitando a prioridade das fontes
   * (clique no mapa > geocodificação > CEP).
   */
  const applyCoords = (coords: Coords | null, source: CoordinateSource) => {
    setAddressCoords((current) => withCoords(current, coords, source));
  };

  /**
   * Coordenada definitiva do endereço digitado. Sem gesto explícito do
   * cliente, geocodificação o que foi digitado - é isso que evita o endereço ir
   * para o banco com a coordenada errada (ou sem nenhuma).
   */
  const resolveDeliveryCoords = async () => {
    const resolved = await resolveAddressCoordinates(
      deliveryInfo,
      addressCoords,
    );

    if (resolved) setAddressCoords(resolved);

    return resolved?.coords ?? null;
  };

  /**
   * Salva novo endereço do usuário (lança erro se falhar para não duplicar
   * requisição nem empilhar toasts no fluxo de finalização).
   */
  const saveNewAddress = async (coords: Coords | null): Promise<string> => {
    const hasDefault = Boolean(userAddresses?.some((a) => a.isDefault));
    const shouldBeDefault =
      saveAddress && (!hasDefault || userAddresses.length === 0);

    const addressData = {
      zipCode: onlyNumbers(deliveryInfo.zipCode),
      state: deliveryInfo.state,
      city: deliveryInfo.city,
      neighborhood: deliveryInfo.neighborhood,
      longitude: coords?.lng,
      latitude: coords?.lat,
      street: deliveryInfo.street,
      number: deliveryInfo.number,
      complement: deliveryInfo.complement || undefined,
      reference: deliveryInfo.reference || undefined,
      isDefault: shouldBeDefault,
    };

    const response = await apiService.address.createUserAddress(addressData);

    if (response.success && response.data?.id) {
      const created = response.data;
      const id = created.id;
      setSelectedAddressId(id);
      queryClient.setQueryData(
        ["addresses", "user", user?.id],
        (old: Address[] | undefined) => [...(old || []), created],
      );
      toast.success("Endereço salvo com sucesso!");
      return id;
    }

    throw new Error(response.message || "Erro ao criar endereço de entrega");
  };

  /**
   * Valida os dados de entrega (etapa 1 do checkout)
   * Endereço so e obrigatório quando o pedido e para entrega
   */
  const isDeliveryValid = () => {
    const contactValid = Boolean(deliveryInfo.name && deliveryInfo.phone);

    if (orderType === "pickup") {
      return contactValid;
    }

    // CEP tem de estar completo. Aqui só se exigia "não vazio", enquanto o
    // formulário do perfil pede 8 dígitos e o PATCH do backend recusa o que
    // estiver fora do formato. Resultado: um CEP pela metade digitado no
    // checkout entrava no banco pelo POST, que é mais permissivo, e depois
    // qualquer PATCH naquele endereço falhava com "CEP inválido" - inclusive
    // o que só queria mudar o endereço padrão.
    return Boolean(
      contactValid &&
      deliveryInfo.street &&
      deliveryInfo.number &&
      deliveryInfo.neighborhood &&
      deliveryInfo.city &&
      deliveryInfo.state &&
      onlyNumbers(deliveryInfo.zipCode).length === 8,
    );
  };

  /**
   * Valida formulário antes de submeter
   */
  const isFormValid = () => {
    if (!openStatus.isOpen) return false;

    const requiredFields = isDeliveryValid();

    // Só pagamento na entrega é aceito
    const paymentValid = Object.hasOwn(CHECKOUT_PAYMENT_METHODS, paymentMethod);

    // Se é dinheiro e precisa de troco, validar valor. `>=` e não `>`:
    // pagar exatamente o total é válido (troco zero), e a mensagem da tela
    // diz "menor que o total" - com `>` ela aparecia no valor exato, que
    // não é menor que nada.
    const changeValid =
      paymentMethod !== "cash" ||
      !needsChange ||
      (changeAmount.trim().length > 0 &&
        Number.parseFloat(changeAmount.replace(",", ".")) >= total);

    return requiredFields && paymentValid && changeValid;
  };

  /**
   * Fluxo completo de finalização de pedido
   *
   * IMPORTANTE: Itens já foram adicionados ao carrinho Redis via use-cart-actions
   *
   * Etapas:
   * 1. Salva novo endereço (se necessário)
   * 2. Finaliza pedido (converte carrinho Redis → Order PostgreSQL)
   * 3. Cria registro de pagamento (payment) usando orderId do banco
   * 4. Cria registro de entrega (delivery) usando orderId do banco
   * 5. Redireciona para página de acompanhamento
   * 6. Limpa carrinho local (após delay para evitar redirect indesejado)
   */
  const handleSubmitOrder = async () => {
    // Trava síncrona: cliques repetidos antes do re-render do React (ou
    // enquanto a navegação pós-sucesso ainda está em andamento) são ignorados
    // no ato, evitando finalizações/pagamentos duplicados e toasts empilhados.
    if (submittingRef.current || isProcessing || isNavigating) {
      return;
    }

    // Este clique é o único gesto garantido antes de a tela de acompanhamento
    // começar a tocar sozinha, no polling. Destravar o áudio aqui é o que faz
    // "em preparo" e "chegou" saírem depois — sem isso o navegador bloqueia
    // tudo em silêncio, porque quem espera o pedido não toca mais na tela.
    unlock();

    if (cartItems.length === 0) {
      showCheckoutError("Seu carrinho está vazio!");
      router.push("/#lojas");
      return;
    }

    if (!user?.id) {
      showCheckoutError("Você precisa estar logado para finalizar o pedido");
      router.push("/#lojas");
      return;
    }

    if (!restaurant?.id) {
      showCheckoutError(
        "Erro ao identificar o restaurante. Por favor, adicione os itens novamente ao carrinho.",
      );
      clearCart();
      router.push("/#lojas");
      return;
    }

    if (!openStatus.isOpen) {
      showCheckoutError(
        openStatus.reason || "Este restaurante está fechado no momento.",
      );
      return;
    }

    submittingRef.current = true;
    setIsProcessing(true);

    // Preenchido quando o endereço do pedido não é o padrão do cliente. O
    // `finally` devolve o padrão anterior em qualquer saída - inclusive
    // quando o pedido falha no meio.
    let defaultAddressSwap: PendingDefaultSwap | null = null;
    let orderCompleted = false;

    try {
      // --------------------------------------------------
      // 1️⃣ GARANTIR QUE EXISTE UM ADDRESS (apenas para entrega)
      // --------------------------------------------------

      let deliveryAddressId = selectedAddressId;

      if (orderType === "delivery") {
        // Uma resolução só para a criação de endereço abaixo: geocodificar de
        // novo seria uma ida à rede repetida bem no clique de finalizar.
        const coords = deliveryAddressId ? null : await resolveDeliveryCoords();

        if (!deliveryAddressId) {
          deliveryAddressId = await saveNewAddress(coords);
        }

        // O backend monta a entrega a partir do endereço PADRÃO do cliente
        // (order.md, POST /order/:id), não do que foi escolhido aqui - o
        // corpo do finalizar nem aceita `deliveryAddressId`. Duas
        // consequências, as duas ruins:
        //
        // 1. Quem só cadastrou endereço pelo checkout não tem padrão nenhum
        //    (os dois pontos de criação acima usam `isDefault: false`), o
        //    backend não acha, e o finalizar falha com "Pedido não
        //    encontrado" - mensagem que fala de pedido para um problema de
        //    endereço.
        // 2. Quem tem mais de um endereço recebe no padrão, e não no que
        //    escolheu na tela. Em silêncio.
        //
        // Então o endereço do pedido vira padrão durante a finalização e o
        // padrão anterior volta logo depois (ver src/lib/default-address.ts).
        // A troca fica gravada em localStorage enquanto dura, para ser
        // desfeita mesmo se a aba fechar no meio.
        //
        // Remover quando POST /order/:id aceitar `deliveryAddressId`: aí o
        // endereço do pedido passa a ser o escolhido, e não o padrão.
        if (deliveryAddressId) {
          const currentAddresses =
            queryClient.getQueryData<Address[]>([
              "addresses",
              "user",
              user?.id,
            ]) ?? userAddresses;

          defaultAddressSwap = await takeOverDefaultAddress({
            addresses: currentAddresses,
            addressId: deliveryAddressId,
            userId: user.id,
          });
        }
      }

      // --------------------------------------------------
      // 2️⃣ GARANTIR CARRINHO
      // --------------------------------------------------

      let currentOrderId = cartOrderId;

      if (!currentOrderId) {
        const orderData: CreateOrderRequest = {
          companyId: restaurant.id,
          discount: deliveryDiscount + promoDiscount,
          totalShipping: deliveryFee,
          totalValue: total,
          status: "CART",
        };

        const orderResponse = await apiService.orders.openCart(
          user.id,
          orderData,
        );

        if (!orderResponse?.data?.id) {
          throw new Error("Erro ao criar pedido");
        }

        currentOrderId = orderResponse.data.id;
        setOrderId(currentOrderId);
      }

      // `changeFor` é o que o cliente entrega em dinheiro, não o troco:
      // R$ 35,90 com changeFor 50 são R$ 14,10 de volta. Só acompanha
      // pagamento em dinheiro com troco pedido - em qualquer outro caso o
      // campo é omitido, e não enviado como 0, que o backend leria como
      // "paga exatamente o valor".
      const parsedChangeFor = Number.parseFloat(changeAmount.replace(",", "."));
      const changeFor =
        paymentMethod === "cash" &&
          needsChange &&
          Number.isFinite(parsedChangeFor) &&
          parsedChangeFor >= total
          ? parsedChangeFor
          : undefined;

      const finishOrderResponse = await apiService.orders.finishOrder(
        user.id,
        currentOrderId,
        {
          fulfillmentType: orderType === "delivery" ? "DELIVERY" : "PICKUP",
          ...(changeFor !== undefined ? { changeFor } : {}),
        },
      );

      if (!finishOrderResponse.success) {
        throw new Error(
          finishOrderResponse.message || "Erro ao finalizar pedido",
        );
      }

      // O backend já leu o padrão para montar a entrega: daqui em diante a
      // troca não serve mais a ninguém. Devolver agora, e não no `finally`,
      // deixa o descarte do endereço temporário (lá embaixo) acontecer com
      // ele já desmarcado - apagar o endereço padrão do cliente deixaria a
      // entrega do próximo pedido apontando para um registro inativo.
      if (defaultAddressSwap) {
        const restored = await restoreDefaultAddress(defaultAddressSwap);
        defaultAddressSwap = null;

        if (!restored) {
          toast.warning(
            "Não conseguimos devolver seu endereço padrão anterior. Confira em Meus endereços.",
          );
        }

        queryClient.invalidateQueries({
          queryKey: ["addresses", "user", user.id],
        });
      }

      const { id: finalOrderId, totalValue: finalOrderTotal } =
        await resolveFinalOrder(finishOrderResponse.data, restaurant.id);

      // O pagamento precisa ser registrado com o total real gravado no pedido
      // (que já inclui `totalShipping` calculado pelo backend em POST /order/:id).
      // Se a resposta do finalizar não trouxer `totalValue` (ex.: mocks de teste),
      // cai para o `total` calculado no checkout (LDMF-315).
      const paymentAmount = finalOrderTotal ?? total;

      // Chegando aqui o pedido ja esta gravado no banco. Sem o UUID não da para
      // registrar pagamento e entrega, mas cancelar o fluxo seria mentira - o
      // pedido existe e precisa aparecer em "Meus pedidos".
      if (!finalOrderId) {
        toast.warning(
          "Pedido registrado, mas não conseguimos identificar o numero dele. Confira em Meus pedidos.",
        );
      }

      // --------------------------------------------------
      // 3️⃣ PAGAMENTO e 4️⃣ DELIVERY (USANDO O MESMO ADDRESS)
      // --------------------------------------------------
      // Nenhum dos dois depende do resultado do outro - rodar em paralelo
      // poupa um round-trip inteiro no passo mais sensível a latência do
      // app (o clique de "finalizar pedido"). Delivery é pulado quando é
      // retirada no local.

      const createPayment = async () => {
        if (!finalOrderId) return;

        try {
          const paymentData = {
            orderId: finalOrderId,
            // customerId: user.id,
            paymentMethod:
              CHECKOUT_PAYMENT_METHODS[paymentMethod] ?? PaymentMethod.CASH,
            amount: paymentAmount,
            // status: PaymentStatus.PENDING,
          };

          const paymentResponse = await apiService.payments.create(paymentData);

          // `apiRequest` não lança exceção em 4xx - sem checar `success` a falha
          // de pagamento passava batida e o cliente via "pedido realizado".
          if (!paymentResponse.success) {
            showCheckoutError(
              paymentResponse.message ||
              "Pedido criado, mas falhou ao registrar o pagamento.",
            );
          }

          if (paymentResponse.data?.gatewayUrl) {
            setPaymentGatewayUrl(paymentResponse.data.gatewayUrl);
          }
        } catch (error) {
          console.error("Erro no pagamento:", error);
          showCheckoutError("Pedido criado, mas falhou ao registrar o pagamento.");
        }
      };

      // A entrega não é mais criada aqui: o backend a cria sozinho ao
      // finalizar o pedido, a partir do fulfillmentType. O POST /delivery
      // que existia aqui é proibido pra role client, então falhava sempre e
      // disparava um toast de erro em todo pedido de entrega.
      await createPayment();

      // O endereço continua sendo criado antes de finalizar - um pedido de
      // entrega precisa de um endereço do cliente gravado no backend. Mas se
      // o cliente desmarcou "Salvar este endereço para pedidos futuros", ele
      // não pode sobrar em "meus endereços" depois - descarta (soft delete) o
      // que acabou de ser criado só pra esse pedido.
      if (!saveAddress && addressMode === "new" && deliveryAddressId) {
        try {
          // Este endereço pode ter acabado de virar o padrão do cliente:
          // quando não havia padrão nenhum, a promoção acima fica de pé em
          // vez de ser desfeita. Apagar sem desmarcar deixaria um padrão
          // apontando para um registro inativo - e o próximo pedido de
          // entrega sairia dali. Quando a promoção já foi desfeita, este
          // PATCH não muda nada.
          await unsetDefaultAddress(deliveryAddressId);
          await apiService.address.deleteUserAddress(deliveryAddressId);
        } catch (error) {
          console.error("Erro ao descartar endereço temporário:", error);
        }
      }

      // O motivo da marca por inteiro, terminando aberto: pico de alívio do
      // cliente e o momento mais raro e mais carregado da jornada dele.
      play("order-confirmed");
      toast.success("Pedido realizado com sucesso!");

      orderCompleted = true;
      setIsNavigating(true);

      if (isClientRole(user?.role)) {
        router.push("/orders");
      } else if (finalOrderId) {
        router.push(`/order-status?orderId=${finalOrderId}`);
      } else {
        router.push("/orders");
      }

      setTimeout(() => {
        clearCart();
        setIsNavigating(false);
        setIsProcessing(false);
        submittingRef.current = false;
      }, 1500);
    } catch (error) {
      showCheckoutError(
        getErrorMessage(error, "Erro ao processar pedido. Tente novamente."),
      );
    } finally {
      if (!orderCompleted) {
        submittingRef.current = false;
        setIsProcessing(false);
      }

      // Só sobra troca aqui quando o pedido não chegou ao fim. O padrão do
      // cliente não pode ficar trocado por causa de um pedido que falhou.
      if (defaultAddressSwap) {
        await restoreDefaultAddress(defaultAddressSwap);
        queryClient.invalidateQueries({
          queryKey: ["addresses", "user", user.id],
        });
      }
    }
  };

  // Uma finalização interrompida (aba fechada, rede caída, F5 no meio) pode
  // ter deixado o endereço daquele pedido como padrão do cliente. A troca
  // fica gravada em localStorage justamente para ser desfeita aqui, na
  // próxima abertura do checkout.
  useEffect(() => {
    if (!user?.id) return;

    let active = true;

    restorePendingDefaultAddress(user.id).then((restored) => {
      if (restored && active) {
        queryClient.invalidateQueries({
          queryKey: ["addresses", "user", user.id],
        });
      }
    });

    return () => {
      active = false;
    };
  }, [user?.id, queryClient]);

  // Auto-select o endereço padrão quando os endereços carregam - antes
  // pegava sempre userAddresses[0], ignorando qual o cliente marcou como
  // padrão no perfil (isDefault), então o checkout pré-selecionava um
  // endereço "aleatório" (ordem do backend) em vez do que o cliente escolheu.
  useEffect(() => {
    if (
      addressMode === "select" &&
      userAddresses.length > 0 &&
      !selectedAddressId
    ) {
      const defaultAddress =
        userAddresses.find((a: Address) => a.isDefault) || userAddresses[0];
      setSelectedAddressId(defaultAddress.id);
      loadAddressData(defaultAddress);
    }

    if (userAddresses.length === 0 && !loadingAddresses) {
      setAddressMode("new");
    }
  }, [userAddresses, loadingAddresses, selectedAddressId, addressMode]);

  // Update user info when available
  useEffect(() => {
    if (user) {
      setDeliveryInfo((prev) => ({
        ...prev,
        name: user.name || prev.name,
        phone: user.phone || prev.phone,
      }));
    }
  }, [user]);

  return {
    // Address management
    userAddresses,
    selectedAddressId,
    addressMode,
    saveAddress,
    loadingAddresses,
    setAddressMode,
    setSaveAddress,
    handleAddressSelect,
    loadAddressData,
    setSelectedAddressId,

    // Delivery vs pickup
    orderType,
    setOrderType,
    isDeliveryValid,

    // Form state
    deliveryInfo,
    addressCoords,
    applyCoords,
    paymentMethod,
    changeAmount,
    needsChange,
    paymentGatewayUrl,
    handleInputChange,
    setPaymentMethod,
    setChangeAmount,
    setNeedsChange,

    // Calculated values
    subtotal,
    deliveryFee,
    isDeliveryFeeKnown,
    discount: deliveryDiscount + promoDiscount,
    total,
    cartItems,
    restaurant,
    isRestaurantOpen: openStatus.isOpen,
    closedReason: openStatus.reason,
    restaurantOpenStatus: openStatus,

    // Actions
    resolveDeliveryCoords,
    handleSubmitOrder,
    isFormValid,
    isProcessing,
    isNavigating,
  };
};
