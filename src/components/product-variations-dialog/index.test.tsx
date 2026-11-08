import { UNLIMITED_STOCK } from "@/lib/unlimited-stock";
import type { ProductVariation } from "@/services/api";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ao criar o primeiro tamanho de um prato, o preço base vira um tamanho
 * junto (LDMF-271) - senão o cliente só consegue pedir os tamanhos mais
 * caros e o prato some do preço base.
 */

const createMutateAsync = vi.fn();
const toastInfo = vi.fn();
const toastError = vi.fn();

// Lido a cada render pelo mock do hook. As referências ficam estáveis entre
// renders (mock com identidade nova a cada chamada causa laço de render).
let variationsQuery: {
  data: ProductVariation[];
  isLoading: boolean;
  isSuccess: boolean;
  isFetching: boolean;
};

const createVariation = { mutateAsync: createMutateAsync, isPending: false };
const updateVariation = { mutateAsync: vi.fn(), isPending: false };
const deleteVariation = { mutateAsync: vi.fn(), isPending: false };

vi.mock("@/hooks", () => ({
  useProductVariations: () => variationsQuery,
  useCreateProductVariation: () => createVariation,
  useUpdateProductVariation: () => updateVariation,
  useDeleteProductVariation: () => deleteVariation,
}));

vi.mock("@/contexts/confirm-provider", () => ({
  useConfirm: () => ({ confirm: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { info: toastInfo, error: toastError, success: vi.fn() },
}));

const { ProductVariationsDialog } = await import("./index");

const settled = (data: ProductVariation[]) => ({
  data,
  isLoading: false,
  isSuccess: true,
  isFetching: false,
});

const variation = (
  overrides: Partial<ProductVariation> = {},
): ProductVariation => ({
  id: "var-1",
  name: "Grande",
  priceModifier: 10,
  isAvailable: true,
  stockQuantity: 5,
  productId: "prod-1",
  created_at: "",
  updated_at: "",
  ...overrides,
});

function renderDialog() {
  return render(
    <ProductVariationsDialog
      productId="prod-1"
      productName="Pizza"
      salePrice={30}
      companyId="comp-1"
      open
      onOpenChange={vi.fn()}
    />,
  );
}

/** Preenche o form: preço em centavos, como o input espera ser digitado. */
async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  { name, cents, stock }: { name: string; cents: string; stock: string },
) {
  await user.type(screen.getByPlaceholderText("Ex: Grande"), name);
  await user.type(screen.getByPlaceholderText("R$ 0,01"), cents);
  await user.type(screen.getByPlaceholderText("—"), stock);
}

describe("ProductVariationsDialog - tamanho base automático", () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    createMutateAsync.mockResolvedValue({});
    toastInfo.mockReset();
    toastError.mockReset();
    variationsQuery = settled([]);
  });

  it("cria o Pequeno com o preço base antes do primeiro tamanho", async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillForm(user, { name: "Grande", cents: "4000", stock: "7" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(2));
    expect(createMutateAsync).toHaveBeenNthCalledWith(1, {
      productId: "prod-1",
      data: {
        name: "Pequeno",
        priceModifier: 0,
        stockQuantity: 7,
        isAvailable: true,
      },
    });
    expect(createMutateAsync).toHaveBeenNthCalledWith(2, {
      productId: "prod-1",
      data: {
        name: "Grande",
        priceModifier: 10,
        stockQuantity: 7,
        isAvailable: true,
      },
    });
    expect(toastInfo).toHaveBeenCalledWith(
      expect.stringContaining('"Pequeno"'),
    );
  });

  it("não cria o base quando o primeiro tamanho já tem o preço base", async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillForm(user, { name: "Broto", cents: "3000", stock: "4" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({
      productId: "prod-1",
      data: expect.objectContaining({ name: "Broto", priceModifier: 0 }),
    });
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it('chama o base de "Pequeno (base)" quando o primeiro já se chama Pequeno', async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillForm(user, { name: "pequeno", cents: "3500", stock: "3" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(2));
    expect(createMutateAsync).toHaveBeenNthCalledWith(1, {
      productId: "prod-1",
      data: expect.objectContaining({
        name: "Pequeno (base)",
        priceModifier: 0,
      }),
    });
  });

  it("não cria o base quando o prato já tem tamanhos", async () => {
    variationsQuery = settled([variation()]);
    const user = userEvent.setup();
    renderDialog();

    await fillForm(user, { name: "Família", cents: "5000", stock: "2" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({
      productId: "prod-1",
      data: expect.objectContaining({ name: "Família", priceModifier: 20 }),
    });
  });

  it("mantém o base e avisa quando o segundo POST falha", async () => {
    createMutateAsync
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();
    renderDialog();

    await fillForm(user, { name: "Grande", cents: "4000", stock: "7" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError).toHaveBeenCalledWith(
      expect.stringContaining('"Grande" não'),
    );
    // Nada de DELETE desfazendo o base, e o form segue preenchido pra
    // tentar de novo.
    expect(deleteVariation.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Ex: Grande")).toHaveValue("Grande");
  });

  it("não cria o segundo tamanho quando o base falha", async () => {
    createMutateAsync.mockRejectedValueOnce(new Error("falhou"));
    const user = userEvent.setup();
    renderDialog();

    await fillForm(user, { name: "Grande", cents: "4000", stock: "7" });
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("trava o Adicionar enquanto a lista de tamanhos é refeita", async () => {
    variationsQuery = { ...settled([]), isFetching: true };
    const user = userEvent.setup();
    renderDialog();

    await fillForm(user, { name: "Grande", cents: "4000", stock: "7" });

    expect(screen.getByRole("button", { name: /Adicionar/ })).toBeDisabled();
  });

  it("marca o tamanho com o preço base na lista", () => {
    variationsQuery = settled([
      variation({ id: "var-base", name: "Broto", priceModifier: 0 }),
      variation(),
    ]);
    renderDialog();

    expect(screen.getAllByText("PREÇO BASE")).toHaveLength(1);
  });
});

describe("ProductVariationsDialog - prato sem tamanho base", () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    createMutateAsync.mockResolvedValue({});
    toastInfo.mockReset();
  });

  it("cria o Pequeno com o estoque do tamanho vendável mais barato", async () => {
    variationsQuery = settled([
      variation({ id: "var-g", name: "Grande", priceModifier: 10, stockQuantity: 9 }),
      variation({ id: "var-m", name: "Médio", priceModifier: 5, stockQuantity: 0 }),
      variation({ id: "var-f", name: "Família", priceModifier: 20, stockQuantity: 2 }),
    ]);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Criar tamanho base" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    // Médio é o mais barato, mas está sem estoque - o vendável mais barato
    // é o Grande.
    expect(createMutateAsync).toHaveBeenCalledWith({
      productId: "prod-1",
      data: {
        name: "Pequeno",
        priceModifier: 0,
        stockQuantity: 9,
        isAvailable: true,
      },
    });
    expect(toastInfo).toHaveBeenCalled();
  });

  it('usa "Pequeno (base)" quando já existe um Pequeno mais caro', async () => {
    variationsQuery = settled([
      variation({ id: "var-p", name: "Pequeno", priceModifier: 3 }),
    ]);
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Criar tamanho base" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({
      productId: "prod-1",
      data: expect.objectContaining({ name: "Pequeno (base)", priceModifier: 0 }),
    });
  });

  it("não mostra o botão quando o base existe e é vendável", () => {
    variationsQuery = settled([
      variation({ id: "var-base", name: "Broto", priceModifier: 0 }),
      variation(),
    ]);
    renderDialog();

    expect(
      screen.queryByRole("button", { name: "Criar tamanho base" }),
    ).not.toBeInTheDocument();
  });

  it("não mostra o botão em prato sem nenhum tamanho", () => {
    variationsQuery = settled([]);
    renderDialog();

    expect(
      screen.queryByRole("button", { name: "Criar tamanho base" }),
    ).not.toBeInTheDocument();
  });

  it("aponta pra edição quando o base existe sem estoque, em vez de duplicar", async () => {
    variationsQuery = settled([
      variation({ id: "var-base", name: "Broto", priceModifier: 0, stockQuantity: 0 }),
      variation(),
    ]);
    const user = userEvent.setup();
    renderDialog();

    expect(
      screen.queryByRole("button", { name: "Criar tamanho base" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/indisponível ou sem estoque/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByPlaceholderText("Ex: Grande")).toHaveValue("Broto");
  });
});

describe("ProductVariationsDialog - tamanho sem controle de estoque", () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    createMutateAsync.mockResolvedValue({});
    variationsQuery = settled([
      variation({ id: "var-base", name: "Pequeno", priceModifier: 0 }),
    ]);
  });

  it("envia o número irreal ao marcar 'Não controlo estoque'", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByPlaceholderText("Ex: Grande"), "Grande");
    await user.type(screen.getByPlaceholderText("R$ 0,01"), "4000");
    await user.click(screen.getByLabelText("Não controlo estoque"));

    expect(screen.queryByPlaceholderText("—")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Adicionar/ }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({
      productId: "prod-1",
      data: {
        name: "Grande",
        priceModifier: 10,
        stockQuantity: UNLIMITED_STOCK,
        isAvailable: true,
      },
    });
  });

  it("desmarcar volta o campo vazio para preencher", async () => {
    const user = userEvent.setup();
    renderDialog();

    const toggle = screen.getByLabelText("Não controlo estoque");
    await user.click(toggle);
    await user.click(toggle);

    expect(screen.getByPlaceholderText("—")).toHaveValue("");
  });

  it("não mostra a quantidade irreal na lista", () => {
    variationsQuery = settled([
      variation({
        id: "var-base",
        name: "Pequeno",
        priceModifier: 0,
        stockQuantity: UNLIMITED_STOCK - 3,
      }),
    ]);
    renderDialog();

    expect(screen.getByText(/sem controle de estoque/)).toBeInTheDocument();
    expect(screen.queryByText(/em estoque/)).not.toBeInTheDocument();
  });
});
