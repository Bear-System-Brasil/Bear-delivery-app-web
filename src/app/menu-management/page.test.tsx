import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNLIMITED_STOCK } from "@/lib/unlimited-stock";
import type { Product, ProductAddOn, ProductVariation } from "@/services/api";

const {
  menuHookState,
  variationsState,
  addOnsState,
  mockHandleOpenCreateModal,
  mockHandleOpenEditModal,
  mockSetActiveTab,
} = vi.hoisted(() => ({
  menuHookState: {
    products: [] as Product[],
    allProducts: [] as Product[],
    categories: [] as { id: string; name: string }[],
    companyId: "comp-1",
    isLoading: false,
    isModalOpen: false,
    editingProduct: null as Product | null,
    formData: {
      name: "",
      description: "",
      costPrice: undefined,
      salePrice: 30,
      categoryId: "",
      imageURL: [] as string[],
      available: true,
      stockQuantity: 10,
    },
    searchQuery: "",
    setSearchQuery: vi.fn(),
    selectedCategory: "all",
    setSelectedCategory: vi.fn(),
    handleOpenCreateModal: vi.fn(),
    handleOpenEditModal: vi.fn(),
    handleCloseModal: vi.fn(),
    handleSaveProduct: vi.fn(),
    handleRequestDelete: vi.fn(),
    handleConfirmDelete: vi.fn(),
    handleCancelDelete: vi.fn(),
    handleToggleAvailability: vi.fn(),
    handleDuplicateProduct: vi.fn(),
    duplicatingProductId: null as string | null,
    handleDeleteProductImage: vi.fn(),
    updateFormField: vi.fn(),
    isCreatingCategory: false,
    setIsCreatingCategory: vi.fn(),
    newCategoryName: "",
    setNewCategoryName: vi.fn(),
    isSaving: false,
    isDeleting: false,
    deleteTarget: null,
    activeTab: "details" as "details" | "variations" | "addons",
    setActiveTab: vi.fn(),
    draftVariations: [] as ProductVariation[],
    setDraftVariations: vi.fn(),
    draftAddOns: [] as ProductAddOn[],
    setDraftAddOns: vi.fn(),
  },
  variationsState: { data: [] as ProductVariation[] },
  addOnsState: { data: [] as ProductAddOn[] },
  mockHandleOpenCreateModal: vi.fn(),
  mockHandleOpenEditModal: vi.fn(),
  mockSetActiveTab: vi.fn(),
}));

menuHookState.handleOpenCreateModal = mockHandleOpenCreateModal;
menuHookState.handleOpenEditModal = mockHandleOpenEditModal;
menuHookState.setActiveTab = mockSetActiveTab;

vi.mock("@/components/protected-route", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/admin-page-layout", () => ({
  AdminPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-menu-management", () => ({
  useMenuManagement: () => menuHookState,
}))
vi.mock("@/hooks/use-product-variations", () => ({
  useProductVariations: () => variationsState,
}))
vi.mock("@/hooks/use-product-add-ons", () => ({
  useProductAddOns: () => addOnsState,
}))

vi.mock("@/contexts/confirm-provider", () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock("next/image", () => ({
  default: ({ alt = "", src = "" }: { alt?: string; src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

import MenuManagementPage from "./page";

const makeProduct = (id: string, name: string): Product => ({
  id,
  name,
  description: "Descrição",
  costPrice: 15,
  salePrice: 35,
  isAvailable: true,
  stockQuantity: 10,
  companyId: "comp-1",
  imageURL: [],
  productCategories: [],
  created_at: "",
  updated_at: "",
});

describe("MenuManagementPage - Unificação com abas e atalhos (LDMF-332)", () => {
  beforeEach(() => {
    mockHandleOpenCreateModal.mockReset();
    mockHandleOpenEditModal.mockReset();
    mockSetActiveTab.mockReset();

    menuHookState.products = [makeProduct("p1", "Pizza Margherita")];
    menuHookState.allProducts = menuHookState.products;
    menuHookState.isModalOpen = false;
    menuHookState.editingProduct = null;
    menuHookState.activeTab = "details";
    variationsState.data = [];
    addOnsState.data = [];
  });

  it("ao clicar no ícone de Régua do card, abre o modal de edição na aba 'variations'", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    const rulerButton = screen.getByRole("button", {
      name: /Tamanhos de Pizza Margherita/i,
    });
    await user.click(rulerButton);

    expect(mockHandleOpenEditModal).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Pizza Margherita" }),
      "variations",
    );
  });

  it("ao clicar no ícone de Sanduíche do card, abre o modal de edição na aba 'addons'", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    const sandwichButton = screen.getByRole("button", {
      name: /Complementos de Pizza Margherita/i,
    });
    await user.click(sandwichButton);

    expect(mockHandleOpenEditModal).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Pizza Margherita" }),
      "addons",
    );
  });

  it("ao clicar no botão Editar do card, abre o modal de edição na aba 'details'", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    const editButton = screen.getByRole("button", {
      name: /Editar Pizza Margherita/i,
    });
    await user.click(editButton);

    expect(mockHandleOpenEditModal).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", name: "Pizza Margherita" }),
      "details",
    );
  });

  it("exibe contadores nas abas ao editar prato com tamanhos e complementos", () => {
    menuHookState.isModalOpen = true;
    menuHookState.editingProduct = makeProduct("p1", "Pizza Margherita");
    variationsState.data = [
      { id: "v1", name: "Broto", priceModifier: 0, stockQuantity: 5, isAvailable: true, productId: "p1", created_at: "", updated_at: "" },
      { id: "v2", name: "Grande", priceModifier: 15, stockQuantity: 5, isAvailable: true, productId: "p1", created_at: "", updated_at: "" },
    ];
    addOnsState.data = [
      { id: "a1", name: "Borda Recheada", priceModifier: 8, isAvailable: true, productId: "p1", created_at: "", updated_at: "" },
    ];

    render(<MenuManagementPage />);

    expect(screen.getByRole("tab", { name: /Dados do Prato/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Tamanhos \(2\)/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Complementos \(1\)/i })).toBeInTheDocument();
  });

  it("ao navegar pelas abas do modal, dispara setActiveTab", async () => {
    const user = userEvent.setup();
    menuHookState.isModalOpen = true;
    menuHookState.editingProduct = makeProduct("p1", "Pizza Margherita");

    render(<MenuManagementPage />);

    const variationsTab = screen.getByRole("tab", { name: /Tamanhos/i });
    await user.click(variationsTab);

    expect(mockSetActiveTab).toHaveBeenCalledWith("variations");
  });
});

describe("MenuManagementPage - Prévia interativa do app (Fase 2, LDMF-454)", () => {
  beforeEach(() => {
    menuHookState.products = [makeProduct("p1", "Pizza Margherita")];
    menuHookState.allProducts = menuHookState.products;
    menuHookState.categories = [];
    menuHookState.isModalOpen = false;
    menuHookState.editingProduct = null;
  });

  it("começa fechada e abre o painel de prévia pelo botão 'Prévia'", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    // Fechada por padrão: o título do painel não está montado.
    expect(screen.queryByText("Prévia no app")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Prévia" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Prévia no app")).toBeInTheDocument();
    // Mostra os cards read-only do cliente (componente compartilhado).
    expect(within(dialog).getByText("Pizza Margherita")).toBeInTheDocument();
  });

  it("fecha pelo botão 'Fechar prévia' do cabeçalho", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    await user.click(screen.getByRole("button", { name: "Prévia" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(
      within(dialog).getByRole("button", { name: "Fechar prévia" }),
    );

    expect(screen.queryByText("Prévia no app")).not.toBeInTheDocument();
  });
});


describe("MenuManagementPage - prato sem controle de estoque", () => {
  beforeEach(() => {
    menuHookState.products = [makeProduct("p1", "Pizza Margherita")];
    menuHookState.allProducts = menuHookState.products;
    menuHookState.isModalOpen = true;
    menuHookState.editingProduct = null;
    menuHookState.activeTab = "details";
    menuHookState.formData.stockQuantity = 10;
    menuHookState.updateFormField = vi.fn();
    variationsState.data = [];
    addOnsState.data = [];
  });

  it("marcar 'Não controlo estoque' grava o número irreal no form", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    await user.click(screen.getByLabelText("Não controlo estoque deste prato"));

    expect(menuHookState.updateFormField).toHaveBeenCalledWith(
      "stockQuantity",
      UNLIMITED_STOCK,
    );
  });

  it("com o número irreal, esconde a quantidade e deixa marcado", () => {
    menuHookState.formData.stockQuantity = UNLIMITED_STOCK;
    render(<MenuManagementPage />);

    expect(screen.getByText("Sem controle de estoque")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Não controlo estoque deste prato"),
    ).toBeChecked();
    expect(screen.queryByLabelText("Qtd. Estoque")).not.toBeInTheDocument();
  });

  it("desmarcar volta o campo para vazio, não para 0", async () => {
    menuHookState.formData.stockQuantity = UNLIMITED_STOCK;
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    await user.click(screen.getByLabelText("Não controlo estoque deste prato"));

    expect(menuHookState.updateFormField).toHaveBeenCalledWith(
      "stockQuantity",
      undefined,
    );
  });
});

describe("MenuManagementPage - Duplicar prato (LDMF-489)", () => {
  beforeEach(() => {
    mockHandleOpenEditModal.mockReset();
    menuHookState.products = [
      makeProduct("p1", "Pizza Margherita"),
      makeProduct("p2", "Lasanha"),
    ];
    menuHookState.allProducts = menuHookState.products;
    menuHookState.isModalOpen = false;
    menuHookState.editingProduct = null;
    menuHookState.duplicatingProductId = null;
    menuHookState.handleDuplicateProduct = vi
      .fn()
      .mockResolvedValue(makeProduct("p3", "Pizza Margherita (cópia)"));
  });

  it("fora do modo, o card não oferece duplicar", () => {
    render(<MenuManagementPage />);

    expect(
      screen.queryByRole("button", { name: /Duplicar Pizza Margherita/i }),
    ).not.toBeInTheDocument();
  });

  it("liga o modo e o clique no card duplica aquele prato", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    await user.click(screen.getByRole("button", { name: /^Duplicar$/i }));
    expect(
      screen.getByText(/Clique no prato que você quer duplicar/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Duplicar Lasanha/i }),
    );

    expect(menuHookState.handleDuplicateProduct).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p2", name: "Lasanha" }),
    );
    // Duplicou: sai do modo.
    expect(
      screen.queryByText(/Clique no prato que você quer duplicar/i),
    ).not.toBeInTheDocument();
  });

  it("no modo, editar e excluir ficam inacessíveis", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    await user.click(screen.getByRole("button", { name: /^Duplicar$/i }));

    // O jsdom não aplica `inert` na árvore de acessibilidade: confere o
    // atributo, que no navegador bloqueia clique e Tab.
    for (const name of [/Editar Pizza Margherita/i, /Remover Pizza Margherita/i]) {
      expect(screen.getByRole("button", { name }).closest("[inert]")).not.toBeNull();
    }
    // O botão de duplicar fica fora da parte inerte.
    expect(
      screen
        .getByRole("button", { name: /Duplicar Pizza Margherita/i })
        .closest("[inert]"),
    ).toBeNull();
  });

  it("Cancelar sai do modo sem duplicar", async () => {
    const user = userEvent.setup();
    render(<MenuManagementPage />);

    await user.click(screen.getByRole("button", { name: /^Duplicar$/i }));
    await user.click(screen.getByRole("button", { name: /^Cancelar$/i }));

    expect(
      screen.queryByRole("button", { name: /Duplicar Lasanha/i }),
    ).not.toBeInTheDocument();
    expect(menuHookState.handleDuplicateProduct).not.toHaveBeenCalled();
  });

  it("se a duplicação falha, continua no modo para tentar de novo", async () => {
    const user = userEvent.setup();
    menuHookState.handleDuplicateProduct = vi.fn().mockResolvedValue(null);
    render(<MenuManagementPage />);

    await user.click(screen.getByRole("button", { name: /^Duplicar$/i }));
    await user.click(
      screen.getByRole("button", { name: /Duplicar Lasanha/i }),
    );

    expect(
      screen.getByRole("button", { name: /Duplicar Lasanha/i }),
    ).toBeInTheDocument();
  });
});
