import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/hooks", () => ({
  useMenuManagement: () => menuHookState,
  useProductVariations: () => variationsState,
  useProductAddOns: () => addOnsState,
}));

vi.mock("@/contexts/confirm-provider", () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock("next/image", () => ({
  default: (props: any) => <img {...props} />,
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

