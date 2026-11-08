import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryInfo } from "@/hooks";
import type { CheckoutFieldErrors } from "@/lib/checkout-validation";
import { DeliveryForm } from "./index";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/address-map", () => ({
  AddressMap: () => <div data-testid="mapa" />,
}));

// Respostas reais da BrasilAPI (medidas em 17/10) para as duas cidades do
// lançamento, ambas de CEP único: sem rua e sem bairro.
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

const CEP_ALEGRE = {
  cep: "29500000",
  state: "ES",
  city: "Alegre",
  neighborhood: null,
  street: null,
  location: {
    type: "Point",
    coordinates: { longitude: "-41.53306", latitude: "-20.76361" },
  },
};

const CEP_COM_RUA = {
  cep: "01001000",
  state: "SP",
  city: "São Paulo",
  neighborhood: "Sé",
  street: "Praça da Sé",
  location: { type: "Point", coordinates: {} },
};

const EMPTY: DeliveryInfo = {
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

/** Formulário com estado de verdade, para a busca do CEP mexer nos campos. */
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
  const [info, setInfo] = useState<DeliveryInfo>(EMPTY);

  return (
    <DeliveryForm
      handleInputChange={(field, value) =>
        setInfo((prev) => ({ ...prev, [field]: String(value) }))
      }
      applyCoords={noop}
      setSelectedAddressId={noop}
      setAddressMode={noop}
      handleAddressSelect={noop}
      setSaveAddress={noop}
      addressMode={addressMode}
      deliveryInfo={info}
      addressCoords={null}
      loadingAddresses={false}
      saveAddress
      userAddresses={userAddresses as never}
      selectedAddressId={userAddresses[0]?.id ?? null}
      orderType={orderType}
      setOrderType={noop}
      restaurant={null}
      hasCpf={hasCpf}
      fieldErrors={fieldErrors}
    />
  );
}

const mockCep = (payload: object) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response);

describe("DeliveryForm - busca do CEP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["Castelo", CEP_CASTELO, "Rua Jocarly Garcia", "São Miguel"],
    ["Alegre", CEP_ALEGRE, "Rua Monsenhor Pavesi", "Centro"],
  ])(
    "CEP único de %s preenche cidade e estado e não apaga o que foi digitado",
    async (city, payload, street, neighborhood) => {
      const user = userEvent.setup();
      mockCep(payload);
      render(<Harness />);

      await user.type(screen.getByLabelText("Rua"), street);
      await user.type(screen.getByLabelText("Numero"), "100");
      await user.type(screen.getByLabelText("Bairro"), neighborhood);
      await user.type(screen.getByLabelText("CEP"), payload.cep);

      await waitFor(() =>
        expect(screen.getByLabelText("Cidade")).toHaveValue(city),
      );
      expect(screen.getByLabelText("Estado")).toHaveValue("ES");
      expect(screen.getByLabelText("Rua")).toHaveValue(street);
      expect(screen.getByLabelText("Numero")).toHaveValue("100");
      expect(screen.getByLabelText("Bairro")).toHaveValue(neighborhood);
      expect(
        screen.getByText(
          "Este CEP vale para a cidade inteira. Preencha rua, número e bairro abaixo.",
        ),
      ).toBeInTheDocument();
    },
  );

  it("CEP único antes de digitar deixa rua e bairro vazios e editáveis", async () => {
    const user = userEvent.setup();
    mockCep(CEP_CASTELO);
    render(<Harness />);

    await user.type(screen.getByLabelText("CEP"), "29360000");
    await waitFor(() =>
      expect(screen.getByLabelText("Cidade")).toHaveValue("Castelo"),
    );

    expect(screen.getByLabelText("Rua")).toHaveValue("");
    expect(screen.getByLabelText("Rua")).toBeEnabled();
    expect(screen.getByLabelText("Bairro")).toBeEnabled();

    await user.type(screen.getByLabelText("Rua"), "Rua Daniel Zanuncio");
    await user.type(screen.getByLabelText("Bairro"), "Pouso Alto");
    expect(screen.getByLabelText("Rua")).toHaveValue("Rua Daniel Zanuncio");
    expect(screen.getByLabelText("Bairro")).toHaveValue("Pouso Alto");
  });

  it("CEP com rua continua preenchendo rua e bairro", async () => {
    const user = userEvent.setup();
    mockCep(CEP_COM_RUA);
    render(<Harness />);

    await user.type(screen.getByLabelText("CEP"), "01001000");

    await waitFor(() =>
      expect(screen.getByLabelText("Rua")).toHaveValue("Praça da Sé"),
    );
    expect(screen.getByLabelText("Bairro")).toHaveValue("Sé");
    expect(
      screen.getByText("Digite o CEP e os campos serao preenchidos."),
    ).toBeInTheDocument();
  });
});

describe("DeliveryForm - campos faltando", () => {
  it("destaca o campo e mostra a mensagem nele", () => {
    render(
      <Harness
        fieldErrors={{
          number: "Informe o número.",
          phone: "Informe seu telefone.",
        }}
      />,
    );

    const number = screen.getByLabelText("Numero");
    expect(number).toHaveAttribute("aria-invalid", "true");
    expect(number).toHaveAccessibleDescription("Informe o número.");
    expect(screen.getByLabelText("Telefone")).toHaveAccessibleDescription(
      "Informe seu telefone.",
    );
    expect(screen.getByLabelText("Rua")).not.toHaveAttribute("aria-invalid");
  });

  it("endereço salvo incompleto avisa o que falta", () => {
    render(
      <Harness
        addressMode="select"
        userAddresses={[{ id: "addr-1" }]}
        fieldErrors={{ number: "Informe o número." }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Este endereço está incompleto (falta Número).",
    );
  });

  it("retirada não mostra endereço nem cobra os campos dele", () => {
    render(<Harness orderType="pickup" />);

    expect(screen.queryByLabelText("Rua")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("DeliveryForm - CPF da conta (LDMF-362)", () => {
  const VALIDATED = "CPF já validado na sua conta. Pode prosseguir com o pedido.";

  it("conta com CPF não vê o campo e vê a mensagem de CPF validado", () => {
    render(<Harness hasCpf />);

    expect(screen.queryByLabelText("CPF")).not.toBeInTheDocument();
    expect(screen.getByText(VALIDATED)).toBeInTheDocument();
  });

  it("conta sem CPF vê o campo e não vê a mensagem", () => {
    render(<Harness hasCpf={false} />);

    expect(screen.getByLabelText("CPF")).toBeInTheDocument();
    expect(screen.queryByText(VALIDATED)).not.toBeInTheDocument();
  });
});
