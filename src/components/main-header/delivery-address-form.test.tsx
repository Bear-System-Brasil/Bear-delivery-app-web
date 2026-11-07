import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

/**
 * Seletor de endereço da home (LDMF-260): usa o núcleo do perfil - CEP
 * opcional, Estado → Cidade → Bairro → Rua → Número travados em ordem, e o
 * pino. O que sai para o cookie é a posição do pino + endereço formatado +
 * etiqueta (Casa/Trabalho/Outro).
 */

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// SheetTitle exige um Dialog por volta; aqui só interessa o texto.
vi.mock("@/components/ui/sheet", () => ({
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/services/ibge", () => ({
  getStates: vi.fn(async () => [{ uf: "ES", name: "Espírito Santo" }]),
  getCities: vi.fn(async () => [{ ibgeCode: "3201407", name: "Castelo" }]),
}));

vi.mock("@/lib/nominatim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/nominatim")>();
  return {
    ...actual,
    nominatim: {
      searchAddress: vi.fn(async () => null),
      findStreet: vi.fn(async () => null),
    },
  };
});

vi.mock("@/services/neighborhoods", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/neighborhoods")>();
  return { ...actual, getNeighborhoods: vi.fn(actual.getNeighborhoods) };
});

// Leaflet não roda no jsdom: um botão faz o papel do toque no mapa.
const MAP_PIN = { lat: -20.6033, lng: -41.1847 };
vi.mock("@/components/address-map", () => ({
  AddressMap: ({ onSelect }: { onSelect: (c: typeof MAP_PIN) => void }) => (
    <button type="button" onClick={() => onSelect(MAP_PIN)}>
      marcar no mapa
    </button>
  ),
}));

const { getNeighborhoods } = await import("@/services/neighborhoods");
const realGetNeighborhoods = vi.mocked(getNeighborhoods).getMockImplementation();
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

function renderForm(onSave = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DeliveryAddressForm onSave={onSave} />
    </QueryClientProvider>,
  );
  return onSave;
}

/** Estado e cidade pelas listas do IBGE (simuladas). */
async function chooseCastelo() {
  await screen.findByRole("option", { name: "Espírito Santo" });
  await userEvent.selectOptions(screen.getByLabelText("Estado *"), "ES");
  await screen.findByRole("option", { name: "Castelo" });
  await userEvent.selectOptions(screen.getByLabelText("Cidade *"), "Castelo");
}

const saveButton = () => screen.getByRole("button", { name: "Salvar endereço" });

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

describe("DeliveryAddressForm (núcleo de endereço)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNeighborhoods).mockImplementation(realGetNeighborhoods!);
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("abre com CEP e Estado liberados e o resto travado", async () => {
    renderForm();

    expect(screen.getByLabelText("CEP")).toBeEnabled();
    expect(screen.getByLabelText("Estado *")).toBeEnabled();
    expect(screen.getByLabelText("Cidade *")).toBeDisabled();
    expect(screen.getByLabelText("Nome da rua *")).toBeDisabled();
    expect(screen.getByLabelText("Número *")).toBeDisabled();
    // Complemento e "padrão" não vão para o cookie: não aparecem.
    expect(screen.queryByLabelText("Complemento")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Definir como endereço padrão"),
    ).not.toBeInTheDocument();
  });

  it("bairro vira lista oficial em Castelo", async () => {
    renderForm();
    await chooseCastelo();

    const neighborhood = await screen.findByLabelText("Bairro *");
    await waitFor(() => expect(neighborhood.tagName).toBe("SELECT"));
    expect(
      screen.getByRole("option", { name: /Santo Andrezinho/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Outro" })).toBeInTheDocument();
  });

  it("salva sem CEP, com a posição do pino, endereço formatado e etiqueta", async () => {
    const onSave = renderForm();
    await chooseCastelo();
    await waitFor(() =>
      expect(screen.getByLabelText("Bairro *").tagName).toBe("SELECT"),
    );
    await userEvent.selectOptions(screen.getByLabelText("Bairro *"), "Centro");
    await userEvent.type(screen.getByLabelText("Nome da rua *"), "Av. Brasil");
    await userEvent.click(screen.getByLabelText("Sem número"));
    await userEvent.click(screen.getByRole("button", { name: "marcar no mapa" }));
    await userEvent.click(screen.getByRole("button", { name: "Trabalho" }));
    await userEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      lat: MAP_PIN.lat,
      lng: MAP_PIN.lng,
      city: "Castelo",
      address: "Avenida Brasil, s/n - Centro, Castelo - ES",
      label: "Trabalho",
    });
    // CEP vazio não consulta nada.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem pino não salva", async () => {
    // Cidade sem lista de bairros: nada posiciona o pino sozinho.
    vi.mocked(getNeighborhoods).mockResolvedValue(null);
    const onSave = renderForm();
    await chooseCastelo();
    await userEvent.type(screen.getByLabelText("Bairro *"), "Centro");
    await userEvent.type(screen.getByLabelText("Nome da rua *"), "Av. Brasil");
    await userEvent.type(screen.getByLabelText("Número *"), "10");
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Marque no mapa onde fica o endereço antes de salvar.",
      ),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("CEP incompleto não salva", async () => {
    vi.mocked(getNeighborhoods).mockResolvedValue(null);
    const onSave = renderForm();
    await userEvent.type(screen.getByLabelText("CEP"), "2936");
    await chooseCastelo();
    await userEvent.type(screen.getByLabelText("Bairro *"), "Centro");
    await userEvent.type(screen.getByLabelText("Nome da rua *"), "Av. Brasil");
    await userEvent.type(screen.getByLabelText("Número *"), "10");
    await userEvent.click(screen.getByRole("button", { name: "marcar no mapa" }));
    await userEvent.click(saveButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("CEP deve ter 8 dígitos"),
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("CEP da cidade inteira preenche estado e cidade e mostra o aviso", async () => {
    fetchMock.mockReturnValue(
      cepResponse({
        cep: "29360000",
        state: "ES",
        city: "Castelo",
        neighborhood: "",
        street: "",
        location: { coordinates: {} },
      }),
    );
    renderForm();
    await screen.findByRole("option", { name: "Espírito Santo" });

    await userEvent.type(screen.getByLabelText("CEP"), "29360000");

    expect(
      await screen.findByText(
        "Este CEP vale para a cidade inteira. Preencha bairro, rua e número abaixo.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Estado *")).toHaveValue("ES");
    await waitFor(() =>
      expect(screen.getByLabelText("Cidade *")).toHaveValue("Castelo"),
    );
  });
});
