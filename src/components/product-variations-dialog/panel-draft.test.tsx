import type { ProductVariation } from "@/services/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductVariationsPanel } from "./index";

const { confirmFn, toastInfo, toastError } = vi.hoisted(() => ({
  confirmFn: vi.fn(),
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/confirm-provider", () => ({
  useConfirm: () => ({ confirm: confirmFn }),
}));

vi.mock("sonner", () => ({
  toast: { info: toastInfo, error: toastError, success: vi.fn() },
}));

const mockVariation = (
  overrides: Partial<ProductVariation> = {},
): ProductVariation => ({
  id: "draft-var-1",
  name: "Grande",
  priceModifier: 10,
  isAvailable: true,
  stockQuantity: 5,
  productId: "",
  created_at: "",
  updated_at: "",
  ...overrides,
});

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { name, cents, stock }: { name: string; cents: string; stock: string },
) {
  await user.type(screen.getByPlaceholderText("Ex: Grande"), name);
  await user.type(screen.getByPlaceholderText("R$ 0,01"), cents);
  await user.type(screen.getByPlaceholderText("—"), stock);
}

describe("ProductVariationsPanel - Modo Rascunho (novo prato)", () => {
  beforeEach(() => {
    confirmFn.mockReset().mockResolvedValue(true);
    toastInfo.mockReset();
    toastError.mockReset();
  });

  it("exibe aviso e desabilita campos se o preço base não foi preenchido", () => {
    renderWithClient(
      <ProductVariationsPanel
        salePrice={0}
        isDraftMode
        draftVariations={[]}
        onDraftVariationsChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Para cadastrar tamanhos, preencha primeiro o preço de venda/i),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ex: Grande")).toBeDisabled();
    expect(screen.getByPlaceholderText("R$ 0,01")).toBeDisabled();
    expect(screen.getByPlaceholderText("—")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Adicionar/ })).toBeDisabled();
  });

  it("cria o tamanho base automático (Pequeno) ao adicionar o primeiro tamanho mais caro", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();

    renderWithClient(
      <ProductVariationsPanel
        salePrice={30}
        isDraftMode
        draftVariations={[]}
        onDraftVariationsChange={onDraftChange}
      />,
    );

    await fillForm(user, { name: "Grande", cents: "4000", stock: "7" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    expect(onDraftChange).toHaveBeenCalledTimes(1);
    const addedList = onDraftChange.mock.calls[0][0] as ProductVariation[];
    expect(addedList).toHaveLength(2);
    // Primeiro item é o base automático
    expect(addedList[0]).toMatchObject({
      name: "Pequeno",
      priceModifier: 0,
      stockQuantity: 7,
      isAvailable: true,
    });
    // Segundo item é o digitado pelo restaurante
    expect(addedList[1]).toMatchObject({
      name: "Grande",
      priceModifier: 10,
      stockQuantity: 7,
      isAvailable: true,
    });
    expect(toastInfo).toHaveBeenCalledWith(
      expect.stringContaining('"Pequeno"'),
    );
  });

  it('chama o base de "Pequeno (base)" quando o primeiro tamanho se chama "Pequeno"', async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();

    renderWithClient(
      <ProductVariationsPanel
        salePrice={30}
        isDraftMode
        draftVariations={[]}
        onDraftVariationsChange={onDraftChange}
      />,
    );

    await fillForm(user, { name: "Pequeno", cents: "3500", stock: "3" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    expect(onDraftChange).toHaveBeenCalledTimes(1);
    const addedList = onDraftChange.mock.calls[0][0] as ProductVariation[];
    expect(addedList[0]).toMatchObject({
      name: "Pequeno (base)",
      priceModifier: 0,
    });
  });

  it("não cria o base automático se o primeiro tamanho já é o preço base", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();

    renderWithClient(
      <ProductVariationsPanel
        salePrice={30}
        isDraftMode
        draftVariations={[]}
        onDraftVariationsChange={onDraftChange}
      />,
    );

    await fillForm(user, { name: "Individual", cents: "3000", stock: "10" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    expect(onDraftChange).toHaveBeenCalledTimes(1);
    const addedList = onDraftChange.mock.calls[0][0] as ProductVariation[];
    expect(addedList).toHaveLength(1);
    expect(addedList[0]).toMatchObject({
      name: "Individual",
      priceModifier: 0,
    });
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("edita um tamanho existente no rascunho", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const initialList = [
      mockVariation({ id: "var-1", name: "Médio", priceModifier: 5, stockQuantity: 4 }),
    ];

    renderWithClient(
      <ProductVariationsPanel
        salePrice={30}
        isDraftMode
        draftVariations={initialList}
        onDraftVariationsChange={onDraftChange}
      />,
    );

    await user.click(screen.getByLabelText("Editar Médio"));
    expect(screen.getByPlaceholderText("Ex: Grande")).toHaveValue("Médio");

    await user.clear(screen.getByPlaceholderText("Ex: Grande"));
    await user.type(screen.getByPlaceholderText("Ex: Grande"), "Médio Especial");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onDraftChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "var-1", name: "Médio Especial" }),
      ]),
    );
  });

  it("remove um tamanho do rascunho após confirmação", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const initialList = [
      mockVariation({ id: "var-1", name: "Pequeno", priceModifier: 0 }),
      mockVariation({ id: "var-2", name: "Grande", priceModifier: 10 }),
    ];

    renderWithClient(
      <ProductVariationsPanel
        salePrice={30}
        isDraftMode
        draftVariations={initialList}
        onDraftVariationsChange={onDraftChange}
      />,
    );

    await user.click(screen.getByLabelText("Remover Grande"));
    expect(confirmFn).toHaveBeenCalled();
    expect(onDraftChange).toHaveBeenCalledWith([initialList[0]]);
  });

  it("permite criar tamanho base pelo alerta quando o rascunho não tem tamanho com preço base", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn();
    const initialList = [
      mockVariation({ id: "var-1", name: "Grande", priceModifier: 10, stockQuantity: 8 }),
    ];

    renderWithClient(
      <ProductVariationsPanel
        salePrice={30}
        isDraftMode
        draftVariations={initialList}
        onDraftVariationsChange={onDraftChange}
      />,
    );

    expect(screen.getByText(/Nenhum tamanho tem o preço base/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Criar tamanho base" }));

    expect(onDraftChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "Pequeno", priceModifier: 0, stockQuantity: 8 }),
      ]),
    );
    expect(toastInfo).toHaveBeenCalledWith(expect.stringContaining('"Pequeno"'));
  });
});
