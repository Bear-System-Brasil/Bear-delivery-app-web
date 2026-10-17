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

// Resposta real da BrasilAPI para 13930000 (Serra Negra, CEP único da
// cidade), medida em 17/10: sem rua e sem bairro.
const CEP_SEM_RUA = {
  cep: "13930000",
  state: "SP",
  city: "Serra Negra",
  neighborhood: null,
  street: null,
  location: {
    type: "Point",
    coordinates: { longitude: "-46.70056", latitude: "-22.61222" },
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
}: {
  orderType?: "delivery" | "pickup";
  addressMode?: "select" | "new";
  userAddresses?: { id: string }[];
  fieldErrors?: CheckoutFieldErrors;
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
      hasCpf
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

  it("CEP sem rua não apaga rua e bairro já digitados e avisa", async () => {
    const user = userEvent.setup();
    mockCep(CEP_SEM_RUA);
    render(<Harness />);

    await user.type(screen.getByLabelText("Rua"), "Rua Coronel Pedro Penteado");
    await user.type(screen.getByLabelText("Bairro"), "Centro");
    await user.type(screen.getByLabelText("CEP"), "13930000");

    await waitFor(() =>
      expect(screen.getByLabelText("Cidade")).toHaveValue("Serra Negra"),
    );
    expect(screen.getByLabelText("Estado")).toHaveValue("SP");
    expect(screen.getByLabelText("Rua")).toHaveValue(
      "Rua Coronel Pedro Penteado",
    );
    expect(screen.getByLabelText("Bairro")).toHaveValue("Centro");
    expect(screen.getByLabelText("Rua")).toBeEnabled();
    expect(
      screen.getByText(
        "Este CEP não traz a rua ou o bairro. Preencha esses campos abaixo.",
      ),
    ).toBeInTheDocument();
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
