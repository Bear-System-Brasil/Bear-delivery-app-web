import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O corpo de POST /order/:id (finalizar) é o único lugar por onde o backend
 * fica sabendo se o pedido é entrega ou retirada, e com quanto o cliente vai
 * pagar em dinheiro. Um campo errado aí não quebra nada visivelmente: o
 * pedido entra, e só depois alguém nota que a entrega não foi criada ou que
 * o troco veio errado. Estes testes travam o payload nos quatro casos.
 */

const finishOrder = vi.fn();
const openCart = vi.fn();
const viewOrder = vi.fn();
const paymentsCreate = vi.fn();
const deleteUserAddress = vi.fn();
const createUserAddress = vi.fn();
const toastError = vi.fn();
const updateCpf = vi.fn();

/**
 * Estado do "banco" de endereços. O hook lê a lista pelo mock de
 * useUserAddresses (congelada, para não recriar referência a cada render);
 * a checagem de estado dentro de default-address.ts lê daqui, que o PATCH
 * altera. Sem isso a conferência veria sempre a lista de antes e reprovaria
 * trocas que deram certo.
 */
let addressBook: { id: string; isDefault: boolean }[] = [];

type PatchResult = { success: boolean; data?: object; message?: string };

const patchAddress = async (
  id: string,
  body: { isDefault?: boolean },
): Promise<PatchResult> => {
  const address = addressBook.find((item) => item.id === id);
  if (address && body.isDefault !== undefined) {
    address.isDefault = body.isDefault;
  }
  return { success: true, data: {} };
};

const listAddresses = async () => ({
  success: true,
  data: addressBook.map((address) => ({ ...address })),
});

const updateUserAddress = vi.fn(patchAddress);
const getUserAddresses = vi.fn(listAddresses);

/**
 * Repõe a implementação, e não só o histórico: um `mockResolvedValue` de um
 * teste sobrevive ao `mockClear` e vazaria para o teste seguinte, que então
 * rodaria contra um backend que não grava nada.
 */
const resetAddressMocks = () => {
  updateUserAddress.mockReset();
  updateUserAddress.mockImplementation(patchAddress);
  getUserAddresses.mockReset();
  getUserAddresses.mockImplementation(listAddresses);
};

/** Repõe o banco a partir da lista que o hook vai enxergar. */
const seedAddressBook = (query: { data: { id: string; isDefault: boolean }[] }) => {
  addressBook = query.data.map(({ id, isDefault }) => ({ id, isDefault }));
};

const CART_ITEMS = [
  { id: "line-1", productId: "p1", name: "xTudo", price: 35.9, quantity: 1 },
];

const SOUND = { play: vi.fn(), unlock: vi.fn() };
const AUTH: {
  user: { id: string; name: string; phone: string; cpf?: string } | null;
} = {
  user: {
    id: "user-1",
    name: "Cliente",
    phone: "11999999999",
    cpf: "12345678900",
  },
};
const RESTAURANT_QUERY = { data: { id: "comp-1", deliveryFee: "0" } };
const ADDRESS_BASE = {
  id: "addr-1",
  zipCode: "01001000",
  street: "Praça da Sé",
  number: "1",
  neighborhood: "Sé",
  city: "São Paulo",
  state: "SP",
};

const ADDRESSES_WITH_DEFAULT = {
  data: [{ ...ADDRESS_BASE, isDefault: true }],
  isLoading: false,
};

// Cliente que só cadastrou endereço pelo checkout: nada é padrão, porque
// os dois pontos de criação usam isDefault: false.
const ADDRESSES_WITHOUT_DEFAULT = {
  data: [{ ...ADDRESS_BASE, isDefault: false }],
  isLoading: false,
};

// Dois endereços: o padrão é a casa, o pedido vai para o trabalho. É o caso
// em que a entrega saía no endereço errado sem ninguém perceber.
const ADDRESSES_TWO = {
  data: [
    { ...ADDRESS_BASE, id: "addr-casa", isDefault: true },
    { ...ADDRESS_BASE, id: "addr-trabalho", isDefault: false },
  ],
  isLoading: false,
};

const ADDRESSES_EMPTY = {
  data: [] as (typeof ADDRESS_BASE & { isDefault: boolean })[],
  isLoading: false,
};

let addressesQuery: typeof ADDRESSES_WITH_DEFAULT = ADDRESSES_WITH_DEFAULT;
const ROUTER = { push: vi.fn(), back: vi.fn() };

const cartStore = {
  items: CART_ITEMS,
  restaurant: { id: "comp-1", name: "Lanchonete do Bear" },
  orderId: "cart:user-1",
  appliedPromo: null,
  getTotal: () => 35.9,
  getSubtotal: () => 35.9,
  clearCart: vi.fn(),
  setOrderId: vi.fn(),
};

vi.mock("@/hooks/use-sound", () => ({ useSound: () => SOUND }));

const authStoreUpdateUser = vi.fn(
  (updated: Partial<{ id: string; name: string; phone: string; cpf?: string }>) => {
    if (AUTH.user) {
      AUTH.user = { ...AUTH.user, ...updated };
    }
  },
);

const useAuthStoreMock = Object.assign(
  () => AUTH,
  {
    getState: () => ({
      user: AUTH.user,
      updateUser: authStoreUpdateUser,
    }),
  },
);

vi.mock("@/stores", () => ({
  useAuthStore: useAuthStoreMock,
  useCartStore: () => cartStore,
}));

vi.mock("@/stores/cart-store", () => ({
  getDeliveryDiscount: () => 0,
  getPromoDiscount: () => 0,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ROUTER }));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: toastError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("./use-restaurants", () => ({
  useRestaurant: () => RESTAURANT_QUERY,
}));

let openingHoursQuery: { data: unknown; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
};

vi.mock("./use-opening-hours", () => ({
  useRestaurantOpeningHours: () => openingHoursQuery,
}));

// Endereço já salvo e marcado como padrão: o hook auto-seleciona, e o
// caminho de entrega pula geocodificação e criação de endereço.
vi.mock("./use-addresses", () => ({
  useUserAddresses: () => addressesQuery,
}));

vi.mock("@/lib/address-coordinates", () => ({
  resolveAddressCoordinates: vi.fn(),
  withCoords: vi.fn(),
}));

vi.mock("@/lib/geocode", () => ({ parseCoords: vi.fn() }));

vi.mock("@/services/api", () => ({
  apiService: {
    orders: { finishOrder, openCart, viewOrder },
    payments: { create: paymentsCreate },
    address: {
      deleteUserAddress,
      updateUserAddress,
      getUserAddresses,
      createUserAddress,
    },
    updateCpf,
  },
  PaymentMethod: {
    CASH: "CASH",
    CREDIT_CARD: "CREDIT_CARD",
    DEBIT_CARD: "DEBIT_CARD",
    PIX: "PIX",
    BANK_TRANSFER: "BANK_TRANSFER",
  },
  PaymentStatus: { PENDING: "PENDING" },
}));

const { useCheckoutProcess } = await import("./use-checkout-process");

// Cliente único e estável: um novo a cada render reiniciaria as queries em
// laço. Só serve para o hook poder invalidar o cache de endereços.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const renderCheckout = () =>
  renderHook(() => useCheckoutProcess(), { wrapper: Wrapper });

/** Corpo com que o finishOrder foi chamado (3º argumento). */
const finishBody = () => finishOrder.mock.calls[0]?.[2];

/** Sequência real de marcações/desmarcações de padrão, na ordem. */
const defaultCalls = () =>
  updateUserAddress.mock.calls.map(
    ([id, body]) => `${id}:${body.isDefault ? "on" : "off"}`,
  );

const SWAP_KEY = "pending-default-address";

type Hook = ReturnType<typeof useCheckoutProcess>;

async function submitWith(setup: (h: Hook) => void) {
  const { result } = renderCheckout();

  // O endereço padrão é auto-selecionado por efeito - esperar evita o
  // caminho de criação de endereço, que não é o que estes testes cobrem.
  await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));

  act(() => setup(result.current));
  await act(async () => {
    await result.current.handleSubmitOrder();
  });

  return result;
}

// Carrinho do backend todo da loja do checkout - a conferência antes de
// finalizar (LDMF-317) passa. Os testes da conferência trocam esta resposta.
const CART_OF_COMP_1 = {
  success: true,
  data: {
    id: "cart:user-1",
    companyId: "comp-1",
    orderedItems: [{ productId: "prod-1", product: { companyId: "comp-1" } }],
  },
};

beforeEach(() => {
  openingHoursQuery = { data: undefined, isLoading: false };
  viewOrder.mockReset();
  viewOrder.mockResolvedValue(CART_OF_COMP_1);
  AUTH.user = {
    id: "user-1",
    name: "Cliente",
    phone: "11999999999",
    cpf: "12345678900",
  };
  updateCpf.mockReset();
  updateCpf.mockResolvedValue({
    success: true,
    data: { cpf: "12345678900" },
  });
  authStoreUpdateUser.mockClear();
});

describe("useCheckoutProcess - corpo do finishOrder", () => {
  beforeEach(() => {
    finishOrder.mockReset();
    finishOrder.mockResolvedValue({ success: true, data: { id: "order-1" } });
    openCart.mockReset();
    paymentsCreate.mockReset();
    paymentsCreate.mockResolvedValue({ success: true, data: {} });
    deleteUserAddress.mockReset();
    resetAddressMocks();
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);
  });

  it("manda DELIVERY quando o pedido é entrega", async () => {
    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("pix_on_delivery");
    });

    expect(finishOrder).toHaveBeenCalledTimes(1);
    expect(finishBody()).toEqual({ fulfillmentType: "DELIVERY" });
  });

  it("manda PICKUP quando o pedido é retirada", async () => {
    await submitWith((h) => {
      h.setOrderType("pickup");
      h.setPaymentMethod("pix_on_delivery");
    });

    expect(finishBody()).toEqual({ fulfillmentType: "PICKUP" });
  });

  it("manda changeFor com o valor que o cliente entrega, não o troco", async () => {
    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("cash");
      h.setNeedsChange(true);
      h.setChangeAmount("50");
    });

    // Pedido de R$ 35,90 pago com R$ 50 - o backend recebe 50, não 14,10.
    expect(finishBody()).toEqual({
      fulfillmentType: "DELIVERY",
      changeFor: 50,
    });
  });

  it("aceita vírgula como separador decimal", async () => {
    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("cash");
      h.setNeedsChange(true);
      h.setChangeAmount("50,50");
    });

    expect(finishBody()).toEqual({
      fulfillmentType: "DELIVERY",
      changeFor: 50.5,
    });
  });

  it("omite changeFor quando o cliente dispensa o troco", async () => {
    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("cash");
      h.setNeedsChange(false);
    });

    // Omitido, e não enviado como 0 - o backend leria 0 como "paga
    // exatamente o valor", que é outra afirmação.
    expect(finishBody()).toEqual({ fulfillmentType: "DELIVERY" });
    expect(finishBody()).not.toHaveProperty("changeFor");
  });

  it("omite changeFor quando o pagamento não é em dinheiro", async () => {
    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("credit_card_machine");
      // Resíduo de quem trocou de método depois de digitar: não pode vazar.
      h.setNeedsChange(true);
      h.setChangeAmount("50");
    });

    expect(finishBody()).not.toHaveProperty("changeFor");
  });

  it("omite changeFor quando o valor é menor que o total", async () => {
    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("cash");
      h.setNeedsChange(true);
      h.setChangeAmount("20");
    });

    expect(finishBody()).not.toHaveProperty("changeFor");
  });

  it("aceita o valor exato do total (troco zero)", async () => {
    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("cash");
      h.setNeedsChange(true);
      h.setChangeAmount("35,90");
    });

    expect(finishBody()).toEqual({
      fulfillmentType: "DELIVERY",
      changeFor: 35.9,
    });
  });
});

describe("useCheckoutProcess - forma de pagamento gravada", () => {
  beforeEach(() => {
    finishOrder.mockReset();
    finishOrder.mockResolvedValue({ success: true, data: { id: "order-1" } });
    openCart.mockReset();
    paymentsCreate.mockReset();
    paymentsCreate.mockResolvedValue({ success: true, data: {} });
    deleteUserAddress.mockReset();
    resetAddressMocks();
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);
  });

  // O campo tem que sair na requisição: tela que promete e não envia já
  // aconteceu quatro vezes neste projeto.
  it.each([
    ["credit_card_machine", "CREDIT_CARD"],
    ["debit_card_machine", "DEBIT_CARD"],
    ["pix_on_delivery", "PIX"],
    ["cash", "CASH"],
  ])("%s grava %s no pagamento", async (choice, expected) => {
    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod(choice);
    });

    await waitFor(() => expect(paymentsCreate).toHaveBeenCalledTimes(1));
    expect(paymentsCreate.mock.calls[0][0]).toMatchObject({
      orderId: "order-1",
      paymentMethod: expected,
    });
  });

  // A validação é do formulário (o delivery-wrapper checa antes de enviar).
  it("só aceita cartão com crédito ou débito escolhido", async () => {
    const { result } = renderCheckout();
    await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));
    act(() => result.current.setOrderType("delivery"));

    act(() => result.current.setPaymentMethod("credit_card_machine"));
    expect(result.current.isFormValid()).toBe(true);

    act(() => result.current.setPaymentMethod("card_machine"));
    expect(result.current.isFormValid()).toBe(false);

    act(() => result.current.setPaymentMethod("constructor"));
    expect(result.current.isFormValid()).toBe(false);
  });
});

describe("useCheckoutProcess - CEP do endereço novo", () => {
  it("não deixa avançar com CEP incompleto", async () => {
    const { result } = renderCheckout();

    act(() => {
      result.current.setOrderType("delivery");
      result.current.setAddressMode("new");
      Object.entries({
        name: "Cliente",
        phone: "11999999999",
        zipCode: "0100-10",
        street: "Praça da Sé",
        number: "1",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
      }).forEach(([field, value]) =>
        result.current.handleInputChange(field, value),
      );
    });

    // O POST aceita o CEP pela metade; o PATCH não. Deixar entrar aqui
    // condena aquele endereço a falhar em toda edição futura, inclusive na
    // troca de endereço padrão.
    expect(result.current.isDeliveryValid()).toBe(false);

    act(() => result.current.handleInputChange("zipCode", "01001-000"));
    expect(result.current.isDeliveryValid()).toBe(true);
  });
});

describe("useCheckoutProcess - isFormValid e o troco", () => {
  it("libera o valor exato do total e barra abaixo dele", async () => {
    const { result } = renderCheckout();

    act(() => {
      result.current.setPaymentMethod("cash");
      result.current.setNeedsChange(true);
      result.current.setChangeAmount("35,90");
    });
    expect(result.current.isFormValid()).not.toBe(false);

    act(() => result.current.setChangeAmount("20"));
    expect(result.current.isFormValid()).toBe(false);
  });
});

/**
 * O corpo do finalizar não aceita `deliveryAddressId`: o backend monta a
 * entrega a partir do endereço PADRÃO do cliente. Então o checkout promove o
 * endereço do pedido a padrão só durante a finalização e devolve o anterior
 * logo depois. Sem a promoção, quem só cadastrou endereço por aqui não tem
 * padrão e o finalizar quebra; sem a volta, o cliente perde a preferência
 * dele a cada compra.
 */
describe("useCheckoutProcess - endereço padrão da entrega", () => {
  beforeEach(() => {
    finishOrder.mockReset();
    finishOrder.mockResolvedValue({ success: true, data: { id: "order-1" } });
    paymentsCreate.mockReset();
    paymentsCreate.mockResolvedValue({ success: true, data: {} });
    resetAddressMocks();
    deleteUserAddress.mockReset();
    deleteUserAddress.mockResolvedValue({ success: true, data: {} });
    createUserAddress.mockReset();
    createUserAddress.mockResolvedValue({
      success: true,
      data: { id: "addr-new", isDefault: true },
    });
    toastError.mockReset();
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);
    localStorage.clear();
  });

  it("promove o endereço do pedido a padrão quando o cliente não tem nenhum", async () => {
    addressesQuery = ADDRESSES_WITHOUT_DEFAULT;
    seedAddressBook(ADDRESSES_WITHOUT_DEFAULT);

    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("pix");
    });

    expect(defaultCalls()).toEqual(["addr-1:on"]);
    expect(finishOrder).toHaveBeenCalledTimes(1);
  });

  it("não mexe em nada quando o endereço do pedido já é o padrão", async () => {
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);

    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("pix");
    });

    expect(updateUserAddress).not.toHaveBeenCalled();
    expect(finishOrder).toHaveBeenCalledTimes(1);
  });

  it("troca o padrão pelo endereço escolhido e devolve o anterior depois", async () => {
    addressesQuery = ADDRESSES_TWO;
    seedAddressBook(ADDRESSES_TWO);

    const { result } = renderCheckout();
    await waitFor(() =>
      expect(result.current.selectedAddressId).toBe("addr-casa"),
    );

    act(() => {
      result.current.setOrderType("delivery");
      result.current.setPaymentMethod("pix");
      result.current.handleAddressSelect("addr-trabalho");
    });

    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    // A entrega sai no trabalho, e a casa volta a ser o padrão do cliente.
    expect(defaultCalls()).toEqual([
      "addr-casa:off",
      "addr-trabalho:on",
      "addr-trabalho:off",
      "addr-casa:on",
    ]);
    expect(finishOrder).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SWAP_KEY)).toBeNull();
  });

  it("devolve o padrão anterior quando o finalizar falha", async () => {
    addressesQuery = ADDRESSES_TWO;
    seedAddressBook(ADDRESSES_TWO);
    finishOrder.mockResolvedValue({ success: false, message: "boom" });

    const { result } = renderCheckout();
    await waitFor(() =>
      expect(result.current.selectedAddressId).toBe("addr-casa"),
    );

    act(() => {
      result.current.setOrderType("delivery");
      result.current.setPaymentMethod("pix");
      result.current.handleAddressSelect("addr-trabalho");
    });

    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    // Um pedido que nem foi criado não pode custar ao cliente a preferência
    // de endereço dele.
    expect(defaultCalls().slice(-2)).toEqual([
      "addr-trabalho:off",
      "addr-casa:on",
    ]);
    expect(localStorage.getItem(SWAP_KEY)).toBeNull();
  });

  it("não promove nada em retirada no local", async () => {
    addressesQuery = ADDRESSES_WITHOUT_DEFAULT;
    seedAddressBook(ADDRESSES_WITHOUT_DEFAULT);

    await submitWith((h) => {
      h.setOrderType("pickup");
      h.setPaymentMethod("pix");
    });

    // Retirada não gera entrega, então não há endereço a definir.
    expect(updateUserAddress).not.toHaveBeenCalled();
    expect(finishOrder).toHaveBeenCalledTimes(1);
  });

  it("falha com mensagem própria se não conseguir definir o padrão", async () => {
    addressesQuery = ADDRESSES_WITHOUT_DEFAULT;
    seedAddressBook(ADDRESSES_WITHOUT_DEFAULT);
    updateUserAddress.mockResolvedValue({ success: false, message: "boom" });
    // mockResolvedValue substitui a implementação: nada é gravado, que é
    // exatamente o cenário deste teste.

    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("pix");
    });

    // Sem padrão o finalizar falharia com "Pedido não encontrado", que não
    // explica nada - então nem chega a ser chamado.
    expect(finishOrder).not.toHaveBeenCalled();
    // A razão do backend chega à tela: é o que separa "a regra dele barrou"
    // de "mandamos algo errado" sem precisar abrir o DevTools.
    expect(toastError).toHaveBeenCalledWith(
      "Não foi possível usar este endereço na entrega: boom",
    );
  });

  it("desmarca o endereço temporário antes de descartá-lo", async () => {
    addressesQuery = ADDRESSES_WITHOUT_DEFAULT;
    seedAddressBook(ADDRESSES_WITHOUT_DEFAULT);

    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("pix");
      // "Salvar este endereço para pedidos futuros" desmarcado.
      h.setSaveAddress(false);
      h.setAddressMode("new");
    });

    // Sem o "off", o cliente ficaria com um endereço padrão apagado - e o
    // próximo pedido de entrega sairia desse endereço morto.
    expect(defaultCalls()).toEqual(["addr-1:on", "addr-1:off"]);
    expect(deleteUserAddress).toHaveBeenCalledWith("addr-1");
  });

  it("desfaz na montagem uma troca que ficou pela metade", async () => {
    // Aba fechada entre a promoção e a volta: o padrão do cliente ficou no
    // endereço de um pedido antigo.
    seedAddressBook(ADDRESSES_TWO);
    addressBook = [
      { id: "addr-casa", isDefault: false },
      { id: "addr-trabalho", isDefault: true },
    ];
    localStorage.setItem(
      SWAP_KEY,
      JSON.stringify({
        previousDefaultId: "addr-casa",
        promotedId: "addr-trabalho",
        userId: "user-1",
      }),
    );

    renderCheckout();

    await waitFor(() =>
      expect(defaultCalls()).toEqual(["addr-trabalho:off", "addr-casa:on"]),
    );
    expect(localStorage.getItem(SWAP_KEY)).toBeNull();
  });

  it("cadastra novo endereço como padrão quando o cliente não tem endereços e salva para o futuro", async () => {
    addressesQuery = ADDRESSES_EMPTY;
    seedAddressBook(ADDRESSES_EMPTY);
    createUserAddress.mockResolvedValue({
      success: true,
      data: {
        id: "addr-novo",
        isDefault: true,
        street: "Praça da Sé",
        number: "1",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
        zipCode: "01001000",
      },
    });

    const { result } = renderCheckout();

    act(() => {
      result.current.setOrderType("delivery");
      result.current.setPaymentMethod("pix_on_delivery");
      result.current.setSaveAddress(true);
      result.current.setAddressMode("new");
      Object.entries({
        name: "Cliente",
        phone: "11999999999",
        zipCode: "01001-000",
        street: "Praça da Sé",
        number: "1",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
      }).forEach(([field, value]) =>
        result.current.handleInputChange(field, value),
      );
    });

    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    expect(createUserAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        isDefault: true,
        zipCode: "01001000",
      }),
    );
    expect(finishOrder).toHaveBeenCalledTimes(1);
  });

  it("cadastra novo endereço sem padrão quando o cliente desmarca salvar para o futuro", async () => {
    addressesQuery = ADDRESSES_EMPTY;
    seedAddressBook(ADDRESSES_EMPTY);
    createUserAddress.mockResolvedValue({
      success: true,
      data: {
        id: "addr-novo",
        isDefault: false,
        street: "Praça da Sé",
        number: "1",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
        zipCode: "01001000",
      },
    });

    const { result } = renderCheckout();

    act(() => {
      result.current.setOrderType("delivery");
      result.current.setPaymentMethod("pix_on_delivery");
      result.current.setSaveAddress(false);
      result.current.setAddressMode("new");
      Object.entries({
        name: "Cliente",
        phone: "11999999999",
        zipCode: "01001-000",
        street: "Praça da Sé",
        number: "1",
        neighborhood: "Sé",
        city: "São Paulo",
        state: "SP",
      }).forEach(([field, value]) =>
        result.current.handleInputChange(field, value),
      );
    });

    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    expect(createUserAddress).toHaveBeenCalledWith(
      expect.objectContaining({
        isDefault: false,
        zipCode: "01001000",
      }),
    );
  });
});

describe("useCheckoutProcess - frete, total e valor do pagamento (LDMF-315)", () => {
  beforeEach(() => {
    finishOrder.mockReset();
    openCart.mockReset();
    paymentsCreate.mockReset();
    paymentsCreate.mockResolvedValue({ success: true, data: {} });
    deleteUserAddress.mockReset();
    resetAddressMocks();
    RESTAURANT_QUERY.data = { id: "comp-1", deliveryFee: "0" } as never;
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);
  });

  it("registra o pagamento em POST /payment com o totalValue gravado no pedido (incluindo o frete calculado pelo backend)", async () => {
    finishOrder.mockResolvedValue({
      success: true,
      data: {
        id: "order-125",
        totalShipping: 5,
        totalValue: 40.9,
      },
    });

    await submitWith((h) => {
      h.setOrderType("delivery");
      h.setPaymentMethod("pix_on_delivery");
    });

    await waitFor(() => expect(paymentsCreate).toHaveBeenCalledTimes(1));
    expect(paymentsCreate.mock.calls[0][0]).toEqual({
      orderId: "order-125",
      paymentMethod: "PIX",
      amount: 40.9,
    });
  });

  it("calcula o frete e soma ao total do checkout quando loja e endereço do cliente têm coordenadas", async () => {
    RESTAURANT_QUERY.data = {
      id: "comp-1",
      Address: [
        {
          latitude: "-20.6025799",
          longitude: "-41.2022979",
          isActive: true,
        },
      ],
    } as never;

    const addressWithCoords = {
      data: [
        {
          ...ADDRESS_BASE,
          isDefault: true,
          latitude: "-20.605",
          longitude: "-41.209359",
        },
      ],
      isLoading: false,
    };
    addressesQuery = addressWithCoords;
    seedAddressBook(addressWithCoords);

    const { result } = renderCheckout();

    await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));

    expect(result.current.deliveryFee).toBe(5);
    expect(result.current.isDeliveryFeeKnown).toBe(true);
    expect(result.current.total).toBe(40.9);

    act(() => {
      result.current.setOrderType("pickup");
    });

    expect(result.current.deliveryFee).toBe(0);
    expect(result.current.isDeliveryFeeKnown).toBe(true);
    expect(result.current.total).toBe(35.9);
  });

  it("sinaliza isDeliveryFeeKnown=false na entrega quando ainda não há coordenadas para calcular o frete", async () => {
    RESTAURANT_QUERY.data = { id: "comp-1" } as never;
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);

    const { result } = renderCheckout();

    await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));

    expect(result.current.orderType).toBe("delivery");
    expect(result.current.deliveryFee).toBe(0);
    expect(result.current.isDeliveryFeeKnown).toBe(false);
    expect(result.current.total).toBe(35.9);
  });
});

describe("useCheckoutProcess - restaurante fechado", () => {
  beforeEach(() => {
    openingHoursQuery = { data: undefined, isLoading: false };
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);
    RESTAURANT_QUERY.data = { id: "comp-1", deliveryFee: "0" };
    finishOrder.mockReset();
    openCart.mockReset();
  });

  it("invalida o formulário e bloqueia o envio quando o restaurante está fechado", async () => {
    openingHoursQuery = {
      data: {
        isOpen: false,
        linkedToCashRegister: false,
        days: [
          {
            day: "mon",
            isOpen: false,
            openTime: "18:00",
            closeTime: "23:00",
          },
        ],
      },
      isLoading: false,
    };

    const { result } = renderCheckout();
    await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));

    expect(result.current.isRestaurantOpen).toBe(false);
    expect(result.current.isFormValid()).toBe(false);

    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining("Restaurante fechado"),
    );
    expect(finishOrder).not.toHaveBeenCalled();
    expect(openCart).not.toHaveBeenCalled();
  });
});

describe("useCheckoutProcess - primeiro pedido e CPF (LDMF-301)", () => {
  beforeEach(() => {
    finishOrder.mockReset();
    finishOrder.mockResolvedValue({ success: true, data: { id: "order-1" } });
    openCart.mockReset();
    paymentsCreate.mockReset();
    paymentsCreate.mockResolvedValue({ success: true, data: {} });
    deleteUserAddress.mockReset();
    resetAddressMocks();
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);
    toastError.mockReset();
  });

  it("hasCpf reflete presença ou ausência de CPF no usuário logado", () => {
    AUTH.user = { id: "user-1", name: "Cliente", phone: "11999999999", cpf: "12345678900" };
    const { result: withCpf } = renderCheckout();
    expect(withCpf.current.hasCpf).toBe(true);

    AUTH.user = { id: "user-2", name: "Cliente Sem CPF", phone: "11999999999", cpf: "" };
    const { result: withoutCpf } = renderCheckout();
    expect(withoutCpf.current.hasCpf).toBe(false);
  });

  it("exige CPF no primeiro pedido quando o cliente não informou no cadastro", async () => {
    AUTH.user = { id: "user-2", name: "Cliente Sem CPF", phone: "11999999999", cpf: "" };
    const { result } = renderCheckout();
    await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));

    // Sem CPF preenchido
    expect(result.current.isDeliveryValid()).toBe(false);

    // Tentativa de submissão direta barra com erro
    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    expect(toastError).toHaveBeenCalledWith("Informe um CPF válido para finalizar o pedido.");
    expect(finishOrder).not.toHaveBeenCalled();

    // Com CPF inválido/incompleto
    act(() => {
      result.current.handleInputChange("cpf", "12345");
    });
    expect(result.current.isDeliveryValid()).toBe(false);

    // Com CPF válido (11 dígitos)
    act(() => {
      result.current.handleInputChange("cpf", "12345678900");
    });
    expect(result.current.deliveryInfo.cpf).toBe("123.456.789-00");
    expect(result.current.isDeliveryValid()).toBe(true);
  });

  it("salva o CPF no backend e atualiza o store antes de finalizar o primeiro pedido", async () => {
    AUTH.user = { id: "user-2", name: "Cliente Sem CPF", phone: "11999999999", cpf: "" };
    updateCpf.mockResolvedValueOnce({ success: true, data: { cpf: "12345678900" } });
    finishOrder.mockResolvedValueOnce({ success: true, data: { id: "order-99" } });

    const { result } = renderCheckout();
    await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));

    act(() => {
      result.current.setOrderType("delivery");
      result.current.setPaymentMethod("pix_on_delivery");
      result.current.handleInputChange("cpf", "123.456.789-00");
    });

    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    expect(updateCpf).toHaveBeenCalledWith("12345678900");
    expect(authStoreUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ cpf: "12345678900" }),
    );
    expect(finishOrder).toHaveBeenCalledTimes(1);
  });

  it("não finaliza o pedido caso o salvamento do CPF falhe", async () => {
    AUTH.user = { id: "user-2", name: "Cliente Sem CPF", phone: "11999999999", cpf: "" };
    updateCpf.mockResolvedValueOnce({ success: false, message: "CPF já cadastrado" });

    const { result } = renderCheckout();
    await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));

    act(() => {
      result.current.setOrderType("delivery");
      result.current.setPaymentMethod("pix_on_delivery");
      result.current.handleInputChange("cpf", "123.456.789-00");
    });

    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    expect(updateCpf).toHaveBeenCalledWith("12345678900");
    expect(toastError).toHaveBeenCalledWith("CPF já cadastrado");
    expect(finishOrder).not.toHaveBeenCalled();
  });

  it("quem já possui CPF informado não é perguntado novamente nem chama updateCpf", async () => {
    AUTH.user = { id: "user-1", name: "Cliente", phone: "11999999999", cpf: "12345678900" };
    finishOrder.mockResolvedValueOnce({ success: true, data: { id: "order-100" } });

    const { result } = renderCheckout();
    await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-1"));

    expect(result.current.hasCpf).toBe(true);
    expect(result.current.isDeliveryValid()).toBe(true);

    act(() => {
      result.current.setOrderType("delivery");
      result.current.setPaymentMethod("pix_on_delivery");
    });

    await act(async () => {
      await result.current.handleSubmitOrder();
    });

    expect(updateCpf).not.toHaveBeenCalled();
    expect(finishOrder).toHaveBeenCalledTimes(1);
  });
});



describe("useCheckoutProcess - loja do carrinho antes de finalizar (LDMF-317)", () => {
  beforeEach(() => {
    finishOrder.mockReset();
    finishOrder.mockResolvedValue({ success: true, data: { id: "order-1" } });
    openCart.mockReset();
    paymentsCreate.mockReset();
    paymentsCreate.mockResolvedValue({ success: true, data: {} });
    resetAddressMocks();
    addressesQuery = ADDRESSES_WITH_DEFAULT;
    seedAddressBook(ADDRESSES_WITH_DEFAULT);
  });

  const pickup = (h: Hook) => {
    h.setOrderType("pickup");
    h.setPaymentMethod("pix_on_delivery");
  };

  it("carrinho todo da loja do checkout: confere e finaliza", async () => {
    await submitWith(pickup);

    expect(viewOrder).toHaveBeenCalledWith("user-1", "cart:user-1");
    expect(finishOrder).toHaveBeenCalledTimes(1);
  });

  it("carrinho do backend preso a outra loja: bloqueia e avisa", async () => {
    // O pedido de 15/10: loja do carrinho = A, checkout achando que é a B
    viewOrder.mockResolvedValue({
      success: true,
      data: {
        id: "cart:user-1",
        companyId: "comp-outra",
        orderedItems: [{ productId: "prod-1", product: { companyId: "comp-1" } }],
      },
    });

    await submitWith(pickup);

    expect(finishOrder).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "Seu carrinho tem itens de outra loja. Revise o carrinho antes de finalizar o pedido.",
    );
  });

  it("item de outra loja dentro do carrinho certo: bloqueia e avisa", async () => {
    viewOrder.mockResolvedValue({
      success: true,
      data: {
        id: "cart:user-1",
        companyId: "comp-1",
        orderedItems: [
          { productId: "prod-1", product: { companyId: "comp-1" } },
          { productId: "prod-x", product: { companyId: "comp-outra" } },
        ],
      },
    });

    await submitWith(pickup);

    expect(finishOrder).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "Seu carrinho tem itens de outra loja. Revise o carrinho antes de finalizar o pedido.",
    );
  });

  it("sem carrinho no backend: não finaliza um pedido vazio", async () => {
    viewOrder.mockResolvedValue({ success: false, status: 404 });

    await submitWith(pickup);

    expect(finishOrder).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining("Não encontramos os itens do seu carrinho"),
    );
  });
});
