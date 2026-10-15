import type { Product } from "@/services/api";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O visitante monta o prato, clica em "Adicionar" e só então descobre que
 * precisa de login. Estes testes travam o que acontece com o que ele já
 * tinha escolhido: o modal não pode fechar nem zerar, e o clique tem que
 * ser refeito sozinho quando a sessão chega.
 */

const addToCart = vi.fn();
const showAuthModal = vi.fn();

// Lido a cada render pelo mock de useAuth - permite simular o login
// acontecendo com o modal do prato aberto.
let isAuthenticated = false;

const VARIATION = {
  id: "var-grande",
  name: "Grande",
  priceModifier: 5,
  isAvailable: true,
  stockQuantity: 10,
  productId: "prod-1",
};

const ADD_ON = {
  id: "add-queijo",
  name: "Queijo extra",
  priceModifier: 3,
  isAvailable: true,
  productId: "prod-1",
};

// Referência estável entre renders (mock com identidade nova a cada
// chamada causa laço de render). Os testes trocam o objeto inteiro.
const DEFAULT_VARIATIONS_RESULT = { data: [VARIATION], isLoading: false };
let variationsResult: {
  data: (typeof VARIATION)[];
  isLoading: boolean;
} = DEFAULT_VARIATIONS_RESULT;

vi.mock("@/hooks", () => ({
  useAllCategories: () => ({ data: [] }),
  useCartActions: () => ({ handleAddToCart: addToCart }),
  useRestaurant: () => ({
    data: { id: "comp-1", tradeName: "Lanchonete do Bear" },
    isLoading: false,
  }),
  usePublicProductVariations: () => variationsResult,
  usePublicProductAddOns: () => ({ data: [ADD_ON], isLoading: false }),
  useRestaurantOpeningHours: () => ({ data: undefined, isLoading: false }),
}));

vi.mock("@/contexts/auth-provider", () => ({
  useAuth: () => ({ isAuthenticated, showAuthModal }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

const { CustomizeOrder } = await import("./index");

const product = {
  id: "prod-1",
  name: "xTudo Duplo",
  description: "Dois hambúrgueres, queijo e bacon",
  salePrice: 35,
  isAvailable: true,
  companyId: "comp-1",
  imageURL: [
    { id: "img-1", url: "/xtudo.jpg", productId: "prod-1" },
  ],
  productCategories: [],
} as unknown as Product;

function renderModal() {
  return render(
    <CustomizeOrder
      productData={product}
      isModalOpen
      setIsModalOpen={vi.fn()}
    />,
  );
}

/** Deixa o prato montado: tamanho escolhido, 2 queijos, 2 unidades. */
async function buildOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByText("Grande"));
  await user.click(screen.getByLabelText("Aumentar Queijo extra"));
  await user.click(screen.getByLabelText("Aumentar Queijo extra"));
  await user.click(screen.getByLabelText("Aumentar quantidade"));
}

describe("CustomizeOrder - visitante sem sessão", () => {
  beforeEach(() => {
    addToCart.mockReset();
    // É o que o handleAddToCart real devolve sem sessão (use-cart-actions):
    // recusa e avisa. Mockar `true` aqui simularia um cenário impossível.
    addToCart.mockResolvedValue(false);
    showAuthModal.mockReset();
    isAuthenticated = false;
  });

  it("pede login em vez de tentar adicionar ao carrinho", async () => {
    const user = userEvent.setup();
    renderModal();

    await buildOrder(user);
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    expect(showAuthModal).toHaveBeenCalledWith("login");
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("mantém tamanho, complementos e quantidade na tela após o pedido de login", async () => {
    const user = userEvent.setup();
    renderModal();

    await buildOrder(user);
    // 35 base + 5 do tamanho + 2x3 de queijo = 46 por unidade, x2 = 92
    expect(screen.getByText("R$ 92,00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    // Nada foi descartado: o total continua o mesmo depois do pedido de
    // login, o que só acontece se tamanho, complementos e quantidade
    // seguirem escolhidos.
    expect(screen.getByText("R$ 92,00")).toBeInTheDocument();
  });

  it("refaz o 'Adicionar' sozinho quando a sessão chega, com as escolhas preservadas", async () => {
    const user = userEvent.setup();
    const { rerender } = renderModal();

    await buildOrder(user);
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));
    expect(addToCart).not.toHaveBeenCalled();

    // O AuthModal fecha e o Zustand passa a reportar sessão ativa.
    isAuthenticated = true;
    rerender(
      <CustomizeOrder
        productData={product}
        isModalOpen
        setIsModalOpen={vi.fn()}
      />,
    );

    await waitFor(() => expect(addToCart).toHaveBeenCalledTimes(1));

    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "prod-1",
        quantity: 2,
        price: 46,
        variations: [{ productVariationId: "var-grande" }],
        addOns: [{ productAddOnsId: "add-queijo", quantity: 2 }],
      }),
    );
  });
});

describe("CustomizeOrder - cliente com sessão", () => {
  beforeEach(() => {
    addToCart.mockReset();
    addToCart.mockResolvedValue(true);
    showAuthModal.mockReset();
    isAuthenticated = true;
  });

  it("adiciona direto, sem passar pelo pedido de login", async () => {
    const user = userEvent.setup();
    renderModal();

    await buildOrder(user);
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(addToCart).toHaveBeenCalledTimes(1));
    expect(showAuthModal).not.toHaveBeenCalled();
  });
});

describe("CustomizeOrder - preços dos extras", () => {
  beforeEach(() => {
    addToCart.mockReset();
    showAuthModal.mockReset();
    isAuthenticated = false;
  });

  it("anuncia o tamanho pelo valor cheio e o complemento pelo acréscimo", () => {
    renderModal();

    // Tamanho: 35 de base + 5 = R$ 40,00, sem "+" - é o que o cliente paga
    // naquele tamanho, igual ao que a gestão do cardápio mostra.
    const sizeOption = screen.getByRole("button", { name: /Grande/ });
    expect(within(sizeOption).getByText("R$ 40,00")).toBeInTheDocument();
    expect(screen.queryByText("+ R$ 5,00")).not.toBeInTheDocument();
    // Complemento continua somando por cima.
    expect(screen.getByText("+ R$ 3,00")).toBeInTheDocument();
  });
});

describe("CustomizeOrder - tamanhos vendáveis", () => {
  beforeEach(() => {
    addToCart.mockReset();
    showAuthModal.mockReset();
    isAuthenticated = false;
    variationsResult = DEFAULT_VARIATIONS_RESULT;
  });

  it("esconde tamanho sem estoque ou indisponível, como o cardápio", () => {
    variationsResult = {
      data: [
        VARIATION,
        { ...VARIATION, id: "var-familia", name: "Família", stockQuantity: 0 },
        { ...VARIATION, id: "var-gigante", name: "Gigante", isAvailable: false },
      ],
      isLoading: false,
    };
    renderModal();

    expect(screen.getByText("Grande")).toBeInTheDocument();
    expect(screen.queryByText("Família")).not.toBeInTheDocument();
    expect(screen.queryByText("Gigante")).not.toBeInTheDocument();
  });

  it("pré-seleciona o tamanho vendável mais barato", async () => {
    isAuthenticated = true;
    addToCart.mockResolvedValue(true);
    variationsResult = {
      data: [
        VARIATION,
        { ...VARIATION, id: "var-pequeno", name: "Pequeno", priceModifier: 0 },
        // Mais barato de todos, mas sem estoque - não pode ser o escolhido.
        { ...VARIATION, id: "var-mini", name: "Mini", priceModifier: 0, stockQuantity: 0 },
      ],
      isLoading: false,
    };
    const user = userEvent.setup();
    renderModal();

    // Botão já liberado, com o total do Pequeno (35 + 0).
    const addButton = await screen.findByRole("button", {
      name: /Adicionar.*R\$\s35,00/,
    });
    await user.click(addButton);

    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 35,
        variations: [{ productVariationId: "var-pequeno" }],
        variationLabel: "Pequeno",
      }),
    );
  });

  it("respeita a troca de tamanho feita pelo cliente", async () => {
    isAuthenticated = true;
    addToCart.mockResolvedValue(true);
    variationsResult = {
      data: [
        VARIATION,
        { ...VARIATION, id: "var-pequeno", name: "Pequeno", priceModifier: 0 },
      ],
      isLoading: false,
    };
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByText("Grande"));
    await user.click(
      screen.getByRole("button", { name: /Adicionar.*R\$\s40,00/ }),
    );

    expect(addToCart).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 40,
        variations: [{ productVariationId: "var-grande" }],
      }),
    );
  });

  it("trava o Adicionar quando nenhum tamanho é vendável", async () => {
    isAuthenticated = true;
    variationsResult = {
      data: [
        { ...VARIATION, stockQuantity: 0 },
        { ...VARIATION, id: "var-pequeno", name: "Pequeno", isAvailable: false },
      ],
      isLoading: false,
    };
    const user = userEvent.setup();
    renderModal();

    const button = screen.getByRole("button", {
      name: "Sem tamanhos disponíveis",
    });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("não trava prato que não tem tamanhos cadastrados", () => {
    variationsResult = { data: [], isLoading: false };
    renderModal();

    expect(
      screen.queryByRole("button", { name: "Sem tamanhos disponíveis" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar/ })).toBeEnabled();
  });

  it("lista os tamanhos do mais barato pro mais caro", () => {
    variationsResult = {
      data: [
        { ...VARIATION, id: "var-2l", name: "2L", priceModifier: 8 },
        { ...VARIATION, id: "var-500", name: "500ml", priceModifier: 0 },
        { ...VARIATION, id: "var-1l", name: "1L", priceModifier: 4 },
      ],
      isLoading: false,
    };
    renderModal();

    const labels = ["500ml", "1L", "2L"].map((label) => screen.getByText(label));
    // Cada rótulo vem depois do anterior no DOM.
    expect(
      labels[0].compareDocumentPosition(labels[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      labels[1].compareDocumentPosition(labels[2]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("respeita o maxQuantity customizado do adicional", async () => {
    const user = userEvent.setup();
    renderModal();

    const increaseBtn = screen.getByLabelText("Aumentar Queijo extra");
    // Clica 5 vezes
    await user.click(increaseBtn);
    await user.click(increaseBtn);
    await user.click(increaseBtn);
    await user.click(increaseBtn);
    await user.click(increaseBtn);

    // O padrão ADD_ON_MAX_QUANTITY é 4
    expect(increaseBtn).toBeDisabled();
  });
});

describe("CustomizeOrder - restaurante fechado", () => {
  it("desabilita o botão de adicionar e exibe o motivo de fechamento", () => {
    render(
      <CustomizeOrder
        productData={product}
        isModalOpen
        setIsModalOpen={vi.fn()}
        isRestaurantOpen={false}
        closedReason="Restaurante fechado no momento. Abre hoje às 18:00."
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Restaurante fechado no momento. Abre hoje às 18:00.");
    const addButton = screen.getByRole("button", { name: /Restaurante fechado/i });
    expect(addButton).toBeDisabled();
  });
});

describe("CustomizeOrder - checagem de estoque (LDMF-273)", () => {
  beforeEach(() => {
    addToCart.mockReset();
    showAuthModal.mockReset();
    isAuthenticated = true;
    variationsResult = DEFAULT_VARIATIONS_RESULT;
  });

  it("exibe 'Esgotado' e desabilita botão quando prato simples tem estoque zero", async () => {
    variationsResult = { data: [], isLoading: false };
    const user = userEvent.setup();
    render(
      <CustomizeOrder
        productData={{ ...product, stockQuantity: 0 }}
        isModalOpen
        setIsModalOpen={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Esgotado" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("exibe 'Esgotado' e desabilita botão quando prato simples está indisponível", async () => {
    variationsResult = { data: [], isLoading: false };
    const user = userEvent.setup();
    render(
      <CustomizeOrder
        productData={{ ...product, isAvailable: false, stockQuantity: 10 }}
        isModalOpen
        setIsModalOpen={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: "Esgotado" });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(addToCart).not.toHaveBeenCalled();
  });

  it("limita a quantidade escolhida ao estoque disponível da variação", async () => {
    variationsResult = {
      data: [{ ...VARIATION, stockQuantity: 2 }],
      isLoading: false,
    };
    const user = userEvent.setup();
    renderModal();

    const increaseBtn = screen.getByLabelText("Aumentar quantidade");
    expect(increaseBtn).toBeEnabled();

    // 1 unidade -> clica -> 2 unidades (atinge o estoque de 2)
    await user.click(increaseBtn);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(increaseBtn).toBeDisabled();

    // Tentar clicar com botão desabilitado não ultrapassa o limite
    await user.click(increaseBtn);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("limita a quantidade escolhida ao estoque disponível de prato simples", async () => {
    variationsResult = { data: [], isLoading: false };
    const user = userEvent.setup();
    render(
      <CustomizeOrder
        productData={{ ...product, stockQuantity: 2 }}
        isModalOpen
        setIsModalOpen={vi.fn()}
      />,
    );

    const increaseBtn = screen.getByLabelText("Aumentar quantidade");
    await user.click(increaseBtn);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(increaseBtn).toBeDisabled();
  });

  it("ajusta a quantidade quando o cliente troca para um tamanho com menor estoque", async () => {
    variationsResult = {
      data: [
        { ...VARIATION, id: "var-grande", name: "Grande", stockQuantity: 5, priceModifier: 5 },
        { ...VARIATION, id: "var-pequeno", name: "Pequeno", stockQuantity: 2, priceModifier: 0 },
      ],
      isLoading: false,
    };
    const user = userEvent.setup();
    renderModal();

    // Pré-selecionado é o Pequeno (mais barato), trocamos para Grande com estoque 5
    await user.click(screen.getByText("Grande"));
    const increaseBtn = screen.getByLabelText("Aumentar quantidade");
    await user.click(increaseBtn); // 2
    await user.click(increaseBtn); // 3
    await user.click(increaseBtn); // 4
    expect(screen.getByText("4")).toBeInTheDocument();

    // Troca para o Pequeno, que só tem 2 em estoque -> deve ajustar para 2
    await user.click(screen.getByText("Pequeno"));
    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
    expect(increaseBtn).toBeDisabled();
  });
});


