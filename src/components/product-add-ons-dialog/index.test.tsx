import type { ProductAddOn } from "@/services/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductAddOnsDialog, ProductAddOnsPanel } from "./index";

const { confirmFn, createMutateAsync, updateMutateAsync, deleteMutateAsync } =
  vi.hoisted(() => ({
    confirmFn: vi.fn(),
    createMutateAsync: vi.fn(),
    updateMutateAsync: vi.fn(),
    deleteMutateAsync: vi.fn(),
  }));

let addOnsQuery: {
  data: ProductAddOn[];
  isLoading: boolean;
};

const createAddOn = { mutateAsync: createMutateAsync, isPending: false };
const updateAddOn = { mutateAsync: updateMutateAsync, isPending: false };
const deleteAddOn = { mutateAsync: deleteMutateAsync, isPending: false };

vi.mock("@/hooks", () => ({
  useProductAddOns: () => addOnsQuery,
  useCreateProductAddOn: () => createAddOn,
  useUpdateProductAddOn: () => updateAddOn,
  useDeleteProductAddOn: () => deleteAddOn,
}));

vi.mock("@/contexts/confirm-provider", () => ({
  useConfirm: () => ({ confirm: confirmFn }),
}));

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const mockAddOn = (overrides: Partial<ProductAddOn> = {}): ProductAddOn => ({
  id: "addon-1",
  name: "Bacon",
  priceModifier: 5,
  isAvailable: true,
  productId: "prod-1",
  created_at: "",
  updated_at: "",
  ...overrides,
});

describe("ProductAddOnsDialog / ProductAddOnsPanel", () => {
  beforeEach(() => {
    confirmFn.mockReset().mockResolvedValue(true);
    createMutateAsync.mockReset().mockResolvedValue({});
    updateMutateAsync.mockReset().mockResolvedValue({});
    deleteMutateAsync.mockReset().mockResolvedValue({});
    addOnsQuery = { data: [], isLoading: false };
  });

  describe("Modo Salvo (prato existente)", () => {
    it("exibe estado vazio quando não há complementos", () => {
      renderWithClient(
        <ProductAddOnsDialog
          productId="prod-1"
          productName="X-Salada"
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(
        screen.getByText("Nenhum complemento cadastrado"),
      ).toBeInTheDocument();
    });

    it("adiciona um novo complemento chamando a mutação", async () => {
      const user = userEvent.setup();
      renderWithClient(
        <ProductAddOnsDialog
          productId="prod-1"
          productName="X-Salada"
          open
          onOpenChange={vi.fn()}
        />,
      );

      await user.type(screen.getByPlaceholderText("Ex: Queijo Extra"), "Bacon");
      await user.type(screen.getByPlaceholderText("R$ 0,01"), "500");
      await user.click(screen.getByRole("button", { name: /Adicionar/ }));

      await waitFor(() =>
        expect(createMutateAsync).toHaveBeenCalledWith({
          productId: "prod-1",
          data: {
            name: "Bacon",
            priceModifier: 5,
            isAvailable: true,
          },
        }),
      );
    });

    it("edita um complemento existente chamando update", async () => {
      addOnsQuery = {
        data: [mockAddOn({ id: "addon-1", name: "Bacon", priceModifier: 5 })],
        isLoading: false,
      };

      const user = userEvent.setup();
      renderWithClient(
        <ProductAddOnsDialog
          productId="prod-1"
          productName="X-Salada"
          open
          onOpenChange={vi.fn()}
        />,
      );

      await user.click(screen.getByLabelText("Editar Bacon"));
      expect(screen.getByPlaceholderText("Ex: Queijo Extra")).toHaveValue(
        "Bacon",
      );

      await user.clear(screen.getByPlaceholderText("Ex: Queijo Extra"));
      await user.type(
        screen.getByPlaceholderText("Ex: Queijo Extra"),
        "Bacon Crocante",
      );
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      await waitFor(() =>
        expect(updateMutateAsync).toHaveBeenCalledWith({
          id: "addon-1",
          productId: "prod-1",
          data: {
            name: "Bacon Crocante",
            priceModifier: 5,
            isAvailable: true,
          },
        }),
      );
    });

    it("remove um complemento após confirmação", async () => {
      addOnsQuery = {
        data: [mockAddOn({ id: "addon-1", name: "Bacon" })],
        isLoading: false,
      };

      const user = userEvent.setup();
      renderWithClient(
        <ProductAddOnsDialog
          productId="prod-1"
          productName="X-Salada"
          open
          onOpenChange={vi.fn()}
        />,
      );

      await user.click(screen.getByLabelText("Remover Bacon"));
      expect(confirmFn).toHaveBeenCalled();
      await waitFor(() =>
        expect(deleteMutateAsync).toHaveBeenCalledWith({
          id: "addon-1",
          productId: "prod-1",
        }),
      );
    });
  });

  describe("Modo Rascunho (novo prato)", () => {
    it("adiciona complemento ao rascunho sem chamar mutação de API", async () => {
      const user = userEvent.setup();
      const onDraftChange = vi.fn();

      renderWithClient(
        <ProductAddOnsPanel
          isDraftMode
          draftAddOns={[]}
          onDraftAddOnsChange={onDraftChange}
        />,
      );

      await user.type(
        screen.getByPlaceholderText("Ex: Queijo Extra"),
        "Maionese da Casa",
      );
      await user.type(screen.getByPlaceholderText("R$ 0,01"), "350");
      await user.click(screen.getByRole("button", { name: /Adicionar/ }));

      expect(createMutateAsync).not.toHaveBeenCalled();
      expect(onDraftChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Maionese da Casa",
            priceModifier: 3.5,
            isAvailable: true,
          }),
        ]),
      );
    });

    it("edita complemento de rascunho", async () => {
      const user = userEvent.setup();
      const onDraftChange = vi.fn();
      const initial = [
        mockAddOn({ id: "draft-1", name: "Cheddar", priceModifier: 4 }),
      ];

      renderWithClient(
        <ProductAddOnsPanel
          isDraftMode
          draftAddOns={initial}
          onDraftAddOnsChange={onDraftChange}
        />,
      );

      await user.click(screen.getByLabelText("Editar Cheddar"));
      await user.clear(screen.getByPlaceholderText("Ex: Queijo Extra"));
      await user.type(
        screen.getByPlaceholderText("Ex: Queijo Extra"),
        "Cheddar Cremoso",
      );
      await user.click(screen.getByRole("button", { name: "Salvar" }));

      expect(onDraftChange).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: "draft-1",
            name: "Cheddar Cremoso",
            priceModifier: 4,
          }),
        ]),
      );
    });

    it("remove complemento de rascunho após confirmação", async () => {
      const user = userEvent.setup();
      const onDraftChange = vi.fn();
      const initial = [
        mockAddOn({ id: "draft-1", name: "Cheddar" }),
        mockAddOn({ id: "draft-2", name: "Bacon" }),
      ];

      renderWithClient(
        <ProductAddOnsPanel
          isDraftMode
          draftAddOns={initial}
          onDraftAddOnsChange={onDraftChange}
        />,
      );

      await user.click(screen.getByLabelText("Remover Cheddar"));
      expect(confirmFn).toHaveBeenCalled();
      expect(onDraftChange).toHaveBeenCalledWith([initial[1]]);
    });
  });
});

