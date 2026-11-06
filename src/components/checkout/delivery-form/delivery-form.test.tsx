import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryInfo } from "@/hooks/use-checkout-process";
import { useAddressEditor } from "@/hooks/use-address-editor";
import type { CheckoutFieldErrors } from "@/lib/checkout-validation";
import { DeliveryForm } from "./index";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/components/address-map", () => ({
  AddressMap: () => <div data-testid="mapa" />,
}));
vi.mock("@/services/ibge", () => ({
  getStates: vi.fn(async () => [{ uf: "ES", name: "Espírito Santo" }]),
  getCities: vi.fn(async () => [{ ibgeCode: "3201407", name: "Castelo" }]),
}));
vi.mock("@/lib/nominatim", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/nominatim")>()),
  nominatim: { searchAddress: vi.fn(async () => null) },
}));

// Resposta real da BrasilAPI (medida em 17/10) para Castelo, CEP único:
// sem rua e sem bairro.
const CEP_CASTELO = {
  cep: "29360000",
  state: "ES",
  city: "Castelo",
  neighborhood: null,
  street: null,
  location: {
    type: "Point",
    coordinates: { longitude: "-41.18472", latitude: "-20.60361" },
  },
};

const INFO: DeliveryInfo = {
  name: "Cliente",
  phone: "11999999999",
  cpf: "",
  zipCode: "",
  street: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  complement: "",
  reference: "",
};

const noop = () => {};

/** Formulário com o núcleo de endereço de verdade (LDMF-260). */
function Harness({
  orderType = "delivery",
  addressMode = "new",
  userAddresses = [],
  fieldErrors,
  hasCpf = true,
}: {
  orderType?: "delivery" | "pickup";
  addressMode?: "select" | "new";
  userAddresses?: { id: string }[];
  fieldErrors?: CheckoutFieldErrors;
  hasCpf?: boolean;
}) {
  const addressEditor = useAddressEditor({
    enabled: orderType === "delivery" && addressMode === "new",
  });

  return (
    <DeliveryForm
      handleInputChange={noop}
      applyCoords={noop}
      setSelectedAddressId={noop}
      setAddressMode={noop}
      handleAddressSelect={noop}
      setSaveAddress={noop}
      addressMode={addressMode}
      deliveryInfo={INFO}
      loadingAddresses={false}
      saveAddress
      userAddresses={userAddresses as never}
      selectedAddressId={userAddresses[0]?.id ?? null}
      orderType={orderType}
      setOrderType={noop}
      restaurant={null}
      hasCpf={hasCpf}
      fieldErrors={fieldErrors}
      addressEditor={addressEditor}
    />
  );
}

function renderForm(props: Parameters<typeof Harness>[0] = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

const mockCep = (payload: object) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response);

describe("DeliveryForm - endereço novo pelo núcleo (LDMF-260)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra os campos do núcleo em ordem e travados, com complemento e referência", () => {
    renderForm();

    expect(screen.getByLabelText("CEP *")).toBeEnabled();
    expect(screen.getByLabelText("Estado *")).toBeEnabled();
    expect(screen.getByLabelText("Cidade *")).toBeDisabled();
    expect(screen.getByLabelText("Rua *")).toBeDisabled();
    expect(screen.getByLabelText("Complemento")).toBeInTheDocument();
    expect(screen.getByLabelText("Referência")).toBeInTheDocument();
    // "Salvar para pedidos futuros" continua; a caixa de padrão do perfil não.
    expect(
      screen.getByLabelText("Salvar este endereço para pedidos futuros"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Definir como endereço padrão"),
    ).not.toBeInTheDocument();
  });

  it("CEP único de Castelo preenche estado e cidade e mostra o aviso do núcleo", async () => {
    const user = userEvent.setup();
    mockCep(CEP_CASTELO);
    renderForm();
    await screen.findByRole("option", { name: "Espírito Santo" });

    await user.type(screen.getByLabelText("CEP *"), "29360000");

    expect(
      await screen.findByText(
        "Este CEP vale para a cidade inteira. Preencha bairro, rua e número abaixo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Estado *")).toHaveValue("ES");
    await waitFor(() =>
      expect(screen.getByLabelText("Cidade *")).toHaveValue("Castelo"),
    );
    // Bairro vira a lista oficial de Castelo.
    await waitFor(() =>
      expect(screen.getByLabelText("Bairro *").tagName).toBe("SELECT"),
    );
  });
});

describe("DeliveryForm - campos faltando", () => {
  it("destaca o campo de contato e mostra a mensagem nele", () => {
    renderForm({ fieldErrors: { phone: "Informe seu telefone." } });

    const phone = screen.getByLabelText("Telefone");
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription("Informe seu telefone.");
    expect(screen.getByLabelText("Nome completo")).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  it("endereço salvo incompleto avisa o que falta", () => {
    renderForm({
      addressMode: "select",
      userAddresses: [{ id: "addr-1" }],
      fieldErrors: { number: "Informe o número." },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este endereço está incompleto (falta Número).",
    );
  });

  it("retirada não mostra endereço nem cobra os campos dele", () => {
    renderForm({ orderType: "pickup" });

    expect(screen.queryByLabelText("Rua *")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("DeliveryForm - CPF da conta (LDMF-362)", () => {
  const VALIDATED = "CPF já validado na sua conta. Pode prosseguir com o pedido.";

  it("conta com CPF não vê o campo e vê a mensagem de CPF validado", () => {
    renderForm({ hasCpf: true });

    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
    expect(screen.getByText(VALIDATED)).toBeInTheDocument();
  });

  it("conta sem CPF vê o campo e não vê a mensagem", () => {
    renderForm({ hasCpf: false });

    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
    expect(screen.queryByText(VALIDATED)).not.toBeInTheDocument();
  });
});
