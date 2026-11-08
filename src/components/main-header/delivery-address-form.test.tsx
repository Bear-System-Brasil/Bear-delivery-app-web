import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Formulário "Seu endereço" do header. Trava o combinado com o mock: o CEP
 * preenche o que der sem apagar o que o cliente já digitou, "Sem número"
 * dispensa o número, e o que sai pro cookie é coordenada + endereço
 * formatado + etiqueta (Casa/Trabalho/Outro).
 */

const geocodeAddress = vi.fn();

vi.mock("@/lib/geocode", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/geocode")>("@/lib/geocode");
  return {
    ...actual,
    geocodeAddress: (...args: unknown[]) => geocodeAddress(...args),
  };
});

// SheetTitle exige um Dialog por volta; aqui só interessa o texto.
vi.mock("@/components/ui/sheet", () => ({
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

const { DeliveryAddressForm, formatDeliveryAddress } = await import(
  "./delivery-address-form"
);

const fetchMock = vi.fn();

function cepResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe("formatDeliveryAddress", () => {
  it("monta rua, número, bairro e cidade - UF", () => {
    expect(
      formatDeliveryAddress(
        {
          street: "R. Machado de Assis",
          number: "304",
          neighborhood: "Santo Andrezinho",
          city: "Castelo",
          state: "ES",
        },
        false,
      ),
    ).toBe("R. Machado de Assis, 304 - Santo Andrezinho, Castelo - ES");
  });

  it("usa s/n e pula o bairro vazio", () => {
    expect(
      formatDeliveryAddress(
        {
          street: "Av. Brasil",
          number: "",
          neighborhood: "",
          city: "Castelo",
          state: "ES",
        },
        true,
      ),
    ).toBe("Av. Brasil, s/n - Castelo - ES");
  });
});

describe("DeliveryAddressForm", () => {
  beforeEach(() => {
    geocodeAddress.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preenche cidade, UF, rua e bairro pelo CEP sem apagar o que já foi digitado", async () => {
    fetchMock.mockReturnValue(
      cepResponse({
        street: "Rua do CEP",
        neighborhood: "Centro",
        city: "Castelo",
        state: "ES",
        location: { coordinates: {} },
      }),
    );
    render(<DeliveryAddressForm onSave={vi.fn()} />);

    await userEvent.type(
      screen.getByLabelText("Rua / avenida"),
      "R. Machado de Assis",
    );
    await userEvent.type(screen.getByLabelText("CEP"), "29360000");

    expect(screen.getByLabelText("CEP")).toHaveValue("29360-000");
    await waitFor(() =>
      expect(screen.getByLabelText("Cidade")).toHaveValue("Castelo"),
    );
    expect(screen.getByLabelText("Estado")).toHaveValue("ES");
    expect(screen.getByLabelText("Bairro")).toHaveValue("Centro");
    // a rua digitada antes do CEP fica
    expect(screen.getByLabelText("Rua / avenida")).toHaveValue(
      "R. Machado de Assis",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://brasilapi.com.br/api/cep/v2/29360000",
    );
  });

  it("avisa quando o CEP não existe e deixa seguir pela rua", async () => {
    fetchMock.mockReturnValue(cepResponse({ message: "not found" }, 404));
    render(<DeliveryAddressForm onSave={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("CEP"), "00000000");

    expect(
      await screen.findByText("CEP não encontrado. Preencha a rua abaixo."),
    ).toBeInTheDocument();
  });

  it("não salva sem rua, número, cidade e UF", async () => {
    const onSave = vi.fn();
    render(<DeliveryAddressForm onSave={onSave} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Salvar endereço" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Preencha os campos destacados.",
    );
    expect(screen.getByLabelText("Rua / avenida")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(geocodeAddress).not.toHaveBeenCalled();
  });

  it("salva coordenada, endereço formatado e etiqueta; 'Sem número' dispensa o número", async () => {
    geocodeAddress.mockResolvedValue({ lat: -20.6, lng: -41.2 });
    const onSave = vi.fn();
    render(<DeliveryAddressForm onSave={onSave} />);

    await userEvent.type(screen.getByLabelText("Rua / avenida"), "Av. Brasil");
    await userEvent.click(screen.getByLabelText("Sem número"));
    await userEvent.type(screen.getByLabelText("Bairro"), "Centro");
    await userEvent.type(screen.getByLabelText("Cidade"), "Castelo");
    await userEvent.type(screen.getByLabelText("Estado"), "es");
    await userEvent.click(screen.getByRole("button", { name: "Trabalho" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar endereço" }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(geocodeAddress).toHaveBeenCalledWith(
      expect.objectContaining({ street: "Av. Brasil", number: "", city: "Castelo" }),
    );
    expect(onSave).toHaveBeenCalledWith({
      lat: -20.6,
      lng: -41.2,
      city: "Castelo",
      address: "Av. Brasil, s/n - Centro, Castelo - ES",
      label: "Trabalho",
    });
  });

  it("explica quando o endereço não é encontrado no mapa", async () => {
    geocodeAddress.mockResolvedValue(null);
    const onSave = vi.fn();
    render(<DeliveryAddressForm onSave={onSave} />);

    await userEvent.type(screen.getByLabelText("Rua / avenida"), "Rua X");
    await userEvent.type(screen.getByLabelText("Número"), "1");
    await userEvent.type(screen.getByLabelText("Cidade"), "Castelo");
    await userEvent.type(screen.getByLabelText("Estado"), "ES");
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar endereço" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não encontramos esse endereço no mapa",
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});
