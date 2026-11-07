import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAddressFields } from "@/hooks/use-address-fields";
import { useAddressForm } from "@/hooks/use-form-validation";

import { DeliveryForm } from "./index";

vi.mock("@/components/address-map", () => ({
  AddressMap: () => <div data-testid="mapa" />,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const IBGE: Record<string, unknown> = {
  "/estados?orderBy=nome": [
    { id: 32, sigla: "ES", nome: "Espírito Santo" },
    { id: 31, sigla: "MG", nome: "Minas Gerais" },
  ],
  "/estados/ES/municipios?orderBy=nome": [
    { id: 3200201, nome: "Alegre" },
    { id: 3201407, nome: "Castelo" },
  ],
  "/estados/MG/municipios?orderBy=nome": [{ id: 3106200, nome: "Belo Horizonte" }],
};

const onPreviousFieldChange = vi.fn();
const handleAddAddress = vi.fn();

type Extra = {
  isSearchingAddress?: boolean;
  addressNotFound?: boolean;
  showReference?: boolean;
  showDefaultOption?: boolean;
  defaultOptionLockedHint?: string | null;
  streetSuggestion?: { road: string; place: string } | null;
  isLoadingNeighborhoods?: boolean;
  applyCoords?: (coords: { lat: number; lng: number } | null, source: string) => void;
  /** Endereço salvo aberto para edição (só para o teste). */
  initialStreet?: string;
  onAcceptStreetSuggestion?: () => void;
  onDismissStreetSuggestion?: () => void;
  placeLabel?: string;
  zipCodeHint?: string | null;
  isLoadingCep?: boolean;
};

function Harness({ initialStreet, ...extra }: Extra) {
  const form = useAddressForm(
    initialStreet
      ? { state: "ES", city: "Castelo", neighborhood: "Centro", street: initialStreet }
      : undefined,
  );
  const fields = useAddressFields({ form, enabled: true, onPreviousFieldChange });
  const city = form.watch("city");

  return (
    <>
      <output data-testid="valor-bairro">{form.watch("neighborhood")}</output>
      <DeliveryForm
        handleCloseAddressModal={vi.fn()}
        handleAddAddress={handleAddAddress}
        applyCoords={vi.fn()}
        addressForm={form}
        addressCoords={null}
        isSavingAddress={false}
        isLoadingCep={false}
        neighborhoodOptions={
          city === "Castelo"
            ? [
                { value: "Centro", label: "Centro" },
                { value: "Castelo III", label: "Castelo III (Pombal, Ivo Martins)" },
              ]
            : null
        }
        stateOptions={fields.stateOptions}
        cityOptions={fields.cityOptions}
        isLoadingCities={fields.isLoadingCities}
        citiesError={fields.citiesError}
        fieldLocks={fields.locks}
        onStateChange={fields.changeState}
        onCityChange={fields.changeCity}
        onNeighborhoodChange={fields.changeNeighborhood}
        isOtherNeighborhood={fields.otherNeighborhood}
        onSelectOtherNeighborhood={fields.selectOtherNeighborhood}
        onOtherNeighborhoodChange={fields.changeOtherNeighborhood}
        {...extra}
      />
    </>
  );
}

function renderForm(extra: Extra = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness {...extra} />
    </QueryClientProvider>,
  );
}

const field = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;

async function pickState(uf: string) {
  await waitFor(() => expect(screen.getByRole("option", { name: "Espírito Santo" })).toBeTruthy());
  fireEvent.change(field(/Estado/), { target: { value: uf } });
}

async function pickCity(name: string) {
  await waitFor(() => expect(screen.getByRole("option", { name })).toBeTruthy());
  fireEvent.change(field(/Cidade/), { target: { value: name } });
}

async function fillUntilNumber() {
  await pickState("ES");
  await pickCity("Castelo");
  fireEvent.change(field(/Bairro/), { target: { value: "Centro" } });
  fireEvent.change(field(/Nome da rua/), { target: { value: "Rua Principal" } });
  fireEvent.change(field(/Número/), { target: { value: "45" } });
  await waitFor(() => expect(field(/Complemento/).disabled).toBe(false));
}

describe("DeliveryForm: ordem e trava dos campos", () => {
  beforeEach(() => {
    onPreviousFieldChange.mockClear();
    handleAddAddress.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => IBGE[url.replace("https://servicodados.ibge.gov.br/api/v1/localidades", "")] ?? [],
      })),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("campos na ordem CEP → Estado → Cidade → Bairro → Rua → Número → Complemento → Mapa", () => {
    renderForm();

    const order = [/CEP/, /Estado/, /Cidade/, /Bairro/, /Nome da rua/, /Número/, /Complemento/].map(
      (label) => field(label),
    );
    const mapa = screen.getByTestId("mapa");

    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(
      order[order.length - 1].compareDocumentPosition(mapa) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("CEP e Estado abrem liberados; o resto fica travado", () => {
    renderForm();

    expect(field(/CEP/).disabled).toBe(false);
    expect(field(/Estado/).disabled).toBe(false);
    for (const label of [/Cidade/, /Bairro/, /Nome da rua/, /Número/, /Complemento/]) {
      expect(field(label).disabled).toBe(true);
    }
  });

  it("estado e cidade vêm do IBGE e cada campo libera o seguinte", async () => {
    renderForm();

    await pickState("ES");
    expect(field(/Cidade/).disabled).toBe(false);
    expect(field(/Bairro/).disabled).toBe(true);

    await pickCity("Castelo");
    expect(field(/Bairro/).disabled).toBe(false);
    expect(field(/Bairro/).tagName).toBe("SELECT");
    expect(field(/Nome da rua/).disabled).toBe(true);

    fireEvent.change(field(/Bairro/), { target: { value: "Centro" } });
    expect(field(/Nome da rua/).disabled).toBe(false);
    expect(field(/Número/).disabled).toBe(true);

    fireEvent.change(field(/Nome da rua/), { target: { value: "Rua Principal" } });
    await waitFor(() => expect(field(/Número/).disabled).toBe(false));
    expect(field(/Complemento/).disabled).toBe(true);

    fireEvent.change(field(/Número/), { target: { value: "45" } });
    await waitFor(() => expect(field(/Complemento/).disabled).toBe(false));
  });

  it("opção mostra os outros nomes entre parênteses e salva só o nome oficial", async () => {
    renderForm();
    await pickState("ES");
    await pickCity("Castelo");

    const option = screen.getByRole("option", { name: "Castelo III (Pombal, Ivo Martins)" });
    expect(option).toHaveValue("Castelo III");

    fireEvent.change(field(/Bairro/), { target: { value: "Castelo III" } });

    expect(screen.getByTestId("valor-bairro")).toHaveTextContent(/^Castelo III$/);
  });

  it("trocar a cidade limpa bairro, rua e número e avisa para limpar o pino", async () => {
    renderForm();
    await fillUntilNumber();
    onPreviousFieldChange.mockClear();

    await pickCity("Alegre");

    expect(field(/Cidade/).value).toBe("Alegre");
    expect(field(/Bairro/).value).toBe("");
    expect(field(/Nome da rua/).value).toBe("");
    expect(field(/Número/).value).toBe("");
    expect(field(/Nome da rua/).disabled).toBe(true);
    expect(onPreviousFieldChange).toHaveBeenCalledTimes(1);
  });

  it("trocar o estado limpa também a cidade", async () => {
    renderForm();
    await fillUntilNumber();
    onPreviousFieldChange.mockClear();

    fireEvent.change(field(/Estado/), { target: { value: "MG" } });

    expect(field(/Cidade/).value).toBe("");
    expect(field(/Bairro/).value).toBe("");
    expect(field(/Bairro/).disabled).toBe(true);
    expect(onPreviousFieldChange).toHaveBeenCalledTimes(1);
  });

  it("trocar o bairro limpa rua e número", async () => {
    renderForm();
    await fillUntilNumber();
    onPreviousFieldChange.mockClear();

    fireEvent.change(field(/Bairro/), { target: { value: "Castelo III" } });

    expect(field(/Nome da rua/).value).toBe("");
    expect(field(/Número/).value).toBe("");
    expect(onPreviousFieldChange).toHaveBeenCalledTimes(1);
  });

  it("escolher o mesmo valor de novo não limpa nada", async () => {
    renderForm();
    await fillUntilNumber();
    onPreviousFieldChange.mockClear();

    fireEvent.change(field(/Cidade/), { target: { value: "Castelo" } });

    expect(field(/Nome da rua/).value).toBe("Principal");
    expect(onPreviousFieldChange).not.toHaveBeenCalled();
  });

  it("sem resposta do IBGE, estados vêm da lista fixa e a cidade vira campo livre", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => [] })));
    renderForm();

    // O hook tenta o IBGE de novo uma vez antes de desistir.
    await waitFor(() => expect(screen.getByRole("option", { name: "Espírito Santo" })).toBeTruthy(), {
      timeout: 4000,
    });
    fireEvent.change(field(/Estado/), { target: { value: "ES" } });

    await waitFor(() => expect(field(/Cidade/).tagName).toBe("INPUT"), { timeout: 4000 });
    expect(field(/Cidade/).disabled).toBe(false);
  });

  it("mostra 'Buscando endereço...' durante a busca", () => {
    renderForm({ isSearchingAddress: true });

    expect(screen.getByRole("status")).toHaveTextContent("Buscando endereço...");
  });

  it("avisa quando o endereço não foi encontrado no mapa", () => {
    renderForm({ addressNotFound: true });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não encontramos esse endereço no mapa. Arraste o pino até a sua casa.",
    );
  });

  it("sem busca e sem aviso, nenhuma das mensagens aparece", () => {
    renderForm();

    expect(screen.queryByText("Buscando endereço...")).toBeNull();
    expect(screen.queryByText(/Não encontramos esse endereço/)).toBeNull();
  });

  describe("opção Outro", () => {
    async function chooseOther() {
      await pickState("ES");
      await pickCity("Castelo");
      fireEvent.change(field(/Bairro/), { target: { value: "__outro__" } });
    }

    it("é a última opção da lista de bairros", async () => {
      renderForm();
      await pickState("ES");
      await pickCity("Castelo");

      const options = Array.from((field(/Bairro/) as unknown as HTMLSelectElement).options);
      expect(options.at(-1)?.textContent).toBe("Outro");
    });

    it("pede o nome do bairro em campo obrigatório e libera a rua só depois", async () => {
      renderForm();
      await chooseOther();

      const other = field(/Qual é o seu bairro/);
      expect(other.required).toBe(true);
      expect(other.value).toBe("");
      expect(field(/Nome da rua/).disabled).toBe(true);
      expect(onPreviousFieldChange).toHaveBeenCalled();

      fireEvent.change(other, { target: { value: "Boa Fé" } });

      expect(screen.getByTestId("valor-bairro")).toHaveTextContent(/^Boa Fé$/);
      expect(field(/Nome da rua/).disabled).toBe(false);
      expect((field(/Bairro/) as unknown as HTMLSelectElement).value).toBe("__outro__");
    });

    it("sem o nome, o envio é barrado: campo obrigatório e validação do bairro", async () => {
      renderForm();
      await chooseOther();

      // No navegador, o campo obrigatório vazio impede o envio.
      expect(field(/Qual é o seu bairro/).validity.valueMissing).toBe(true);

      // Mesmo se o envio passar direto, a validação do formulário barra.
      fireEvent.submit(screen.getByRole("button", { name: "Salvar Endereço" }).closest("form")!);

      await waitFor(() => expect(screen.getByText("Bairro é obrigatório")).toBeTruthy());
    });

    it("trocar de Outro para um bairro da lista limpa o campo de texto", async () => {
      renderForm();
      await chooseOther();
      fireEvent.change(field(/Qual é o seu bairro/), { target: { value: "Boa Fé" } });

      fireEvent.change(field(/Bairro/), { target: { value: "Centro" } });

      expect(screen.queryByLabelText(/Qual é o seu bairro/)).toBeNull();
      expect(screen.getByTestId("valor-bairro")).toHaveTextContent(/^Centro$/);

      fireEvent.change(field(/Bairro/), { target: { value: "__outro__" } });
      expect(field(/Qual é o seu bairro/).value).toBe("");
    });
  });

  describe("campo Número", () => {
    const submit = () =>
      fireEvent.submit(screen.getByRole("button", { name: "Salvar Endereço" }).closest("form")!);

    async function fillUntilStreet() {
      fireEvent.change(field(/CEP/), { target: { value: "29360000" } });
      await pickState("ES");
      await pickCity("Castelo");
      fireEvent.change(field(/Bairro/), { target: { value: "Centro" } });
      fireEvent.change(field(/Nome da rua/), { target: { value: "Rua Principal" } });
    }

    it("recusa texto sem dígito (vtech) com a mensagem do Sem número", async () => {
      renderForm();
      await fillUntilStreet();
      fireEvent.change(field(/Número/), { target: { value: "vtech" } });

      submit();

      await waitFor(() =>
        expect(screen.getByText("Informe o número da casa ou marque Sem número")).toBeTruthy(),
      );
      expect(handleAddAddress).not.toHaveBeenCalled();
    });

    it.each(["12", "12A", "12-B"])("aceita %s", async (value) => {
      renderForm();
      await fillUntilStreet();
      fireEvent.change(field(/Número/), { target: { value } });

      submit();

      await waitFor(() => expect(handleAddAddress).toHaveBeenCalledTimes(1));
      expect(handleAddAddress.mock.calls[0][0]).toMatchObject({ number: value });
      expect(screen.queryByText("Informe o número da casa ou marque Sem número")).toBeNull();
    });

    it("Sem número trava o campo e salva S/N; desmarcar libera vazio", async () => {
      renderForm();
      await fillUntilStreet();
      fireEvent.change(field(/Número/), { target: { value: "45" } });

      fireEvent.click(screen.getByLabelText("Sem número"));

      expect(field(/Número/).disabled).toBe(true);
      expect(field(/Número/).value).toBe("S/N");
      await waitFor(() => expect(field(/Complemento/).disabled).toBe(false));

      submit();

      await waitFor(() => expect(handleAddAddress).toHaveBeenCalledTimes(1));
      expect(handleAddAddress.mock.calls[0][0]).toMatchObject({ number: "S/N" });

      fireEvent.click(screen.getByLabelText("Sem número"));

      expect(field(/Número/).disabled).toBe(false);
      expect(field(/Número/).value).toBe("");
    });

    it("Sem número fica travado até a rua ser preenchida", async () => {
      renderForm();
      await pickState("ES");
      await pickCity("Castelo");

      expect((screen.getByLabelText("Sem número") as HTMLInputElement).disabled).toBe(true);
    });
  });

  describe("opções do endereço da loja (LDMF-263)", () => {
    it("por padrão (cliente): caixa de padrão, sem Referência, texto fala em casa", () => {
      renderForm({ addressNotFound: true });

      expect(screen.getByLabelText("Definir como endereço padrão")).toBeTruthy();
      expect(screen.queryByLabelText("Referência")).toBeNull();
      expect(screen.getByText(/Confira se o pino está na sua casa/)).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("até a sua casa");
    });

    it("caixa de padrão travada mostra o motivo (LDMF-262)", () => {
      renderForm({ defaultOptionLockedHint: "Este fica como padrão." });

      const checkbox = screen.getByLabelText("Definir como endereço padrão") as HTMLInputElement;
      expect(checkbox.disabled).toBe(true);
      expect(screen.getByText("Este fica como padrão.")).toBeTruthy();
    });

    it("loja: sem caixa de padrão, com Referência e texto falando em loja", () => {
      renderForm({
        showReference: true,
        showDefaultOption: false,
        placeLabel: "sua loja",
        addressNotFound: true,
      });

      expect(screen.queryByLabelText("Definir como endereço padrão")).toBeNull();
      expect(screen.getByText(/Confira se o pino está na sua loja/)).toBeTruthy();
      expect(screen.getByRole("alert").textContent).toContain("até a sua loja");
    });

    it("Referência fica travada como o Complemento e sai no envio", async () => {
      renderForm({ showReference: true });

      expect(field(/Referência/).disabled).toBe(true);
      await fillUntilNumber();
      expect(field(/Referência/).disabled).toBe(false);

      fireEvent.change(field(/Referência/), { target: { value: "Ao lado da praça" } });
      fireEvent.change(field(/CEP/), { target: { value: "29360000" } });
      fireEvent.submit(field(/Nome da rua/).closest("form")!);

      await waitFor(() => expect(handleAddAddress).toHaveBeenCalledTimes(1));
      expect(handleAddAddress.mock.calls[0][0]).toMatchObject({
        reference: "Ao lado da praça",
      });
    });
  });

  it("cidade trocada: a lista antiga sai e fica Carregando até a nova chegar", async () => {
    renderForm({ isLoadingNeighborhoods: true });
    await pickState("ES");
    await pickCity("Castelo");

    // Castelo tem opções no Harness, mas a lista ainda está chegando.
    expect(field(/Bairro/).disabled).toBe(true);
    expect(screen.queryByRole("option", { name: "Centro" })).toBeNull();
    expect(screen.getByRole("option", { name: "Carregando bairros..." })).toBeTruthy();
  });

  it("sem cidade, o bairro é uma lista travada que diz o que falta", () => {
    renderForm();

    const bairro = field(/Bairro/);
    expect(bairro.tagName).toBe("SELECT");
    expect(bairro.disabled).toBe(true);
    expect(screen.getByRole("option", { name: "Escolha a cidade primeiro" })).toBeTruthy();
  });

  it("lista de bairros chegando: mostra Carregando, não um campo livre", async () => {
    renderForm({ isLoadingNeighborhoods: true });
    await pickState("ES");
    await pickCity("Castelo");

    const bairro = field(/Bairro/);
    expect(bairro.tagName).toBe("SELECT");
    expect(bairro.disabled).toBe(true);
    expect(screen.getByRole("option", { name: "Carregando bairros..." })).toBeTruthy();
  });

  describe("tipo de logradouro (LDMF-282)", () => {
    async function submitStreet() {
      fireEvent.change(field(/Número/), { target: { value: "45" } });
      fireEvent.change(field(/CEP/), { target: { value: "29360000" } });
      fireEvent.submit(field(/Nome da rua/).closest("form")!);
      await waitFor(() => expect(handleAddAddress).toHaveBeenCalledTimes(1));
      return handleAddAddress.mock.calls[0][0].street;
    }

    async function untilStreet() {
      await pickState("ES");
      await pickCity("Castelo");
      fireEvent.change(field(/Bairro/), { target: { value: "Centro" } });
    }

    it("vem com Rua e salva o logradouro completo", async () => {
      renderForm();
      await untilStreet();

      expect(field(/Tipo/).value).toBe("Rua");
      fireEvent.change(field(/Nome da rua/), { target: { value: "Sete de Setembro" } });

      expect(await submitStreet()).toBe("Rua Sete de Setembro");
    });

    it("trocar o tipo troca o começo do logradouro", async () => {
      renderForm();
      await untilStreet();

      fireEvent.change(field(/Nome da rua/), { target: { value: "Sete de Setembro" } });
      fireEvent.change(field(/Tipo/), { target: { value: "Avenida" } });

      expect(field(/Nome da rua/).value).toBe("Sete de Setembro");
      expect(await submitStreet()).toBe("Avenida Sete de Setembro");
    });

    it("tipo digitado no nome não repete: vai para o seletor", async () => {
      renderForm();
      await untilStreet();

      fireEvent.change(field(/Nome da rua/), { target: { value: "Rua Sete de Setembro" } });
      expect(field(/Nome da rua/).value).toBe("Sete de Setembro");

      fireEvent.change(field(/Nome da rua/), { target: { value: "Av. " } });
      expect(field(/Tipo/).value).toBe("Avenida");
      fireEvent.change(field(/Nome da rua/), { target: { value: "Brasil" } });

      expect(await submitStreet()).toBe("Avenida Brasil");
    });

    it("endereço salvo sem tipo pede o tipo e não ganha Rua escondido", async () => {
      renderForm({ initialStreet: "MACHADO DE ASSIS" });
      await waitFor(() => expect(field(/Nome da rua/).disabled).toBe(false));

      expect(field(/Tipo/).value).toBe("");
      expect(screen.getByText(/Escolha o tipo da rua/)).toBeTruthy();
      expect(field(/Nome da rua/).value).toBe("MACHADO DE ASSIS");

      fireEvent.change(field(/Tipo/), { target: { value: "Rua" } });
      expect(screen.queryByText(/Escolha o tipo da rua/)).toBeNull();
      expect(await submitStreet()).toBe("Rua MACHADO DE ASSIS");
    });

    it("nome achado com outro tipo pede confirmação", async () => {
      const onAccept = vi.fn();
      const onDismiss = vi.fn();
      renderForm({
        streetSuggestion: { road: "Avenida Nossa Senhora da Penha", place: "Centro, Castelo - ES" },
        onAcceptStreetSuggestion: onAccept,
        onDismissStreetSuggestion: onDismiss,
      });

      expect(screen.getByText("Avenida Nossa Senhora da Penha")).toBeTruthy();
      // Só o nome da rua pode ser de qualquer lugar: mostra onde fica.
      expect(screen.getByRole("status").textContent).toContain(
        "Avenida Nossa Senhora da Penha, em Centro, Castelo - ES. É essa?",
      );
      fireEvent.click(screen.getByRole("button", { name: "Sim, usar esse nome" }));
      fireEvent.click(screen.getByRole("button", { name: "Manter o que digitei" }));

      expect(onAccept).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("pergunta e busca aparecem junto do campo da rua, antes do mapa", () => {
      const { rerender } = renderForm({ isSearchingAddress: true });
      const mapLabel = screen.getByText("Localização no mapa");
      const searching = screen.getByText("Procurando sua rua no mapa...");
      expect(
        searching.compareDocumentPosition(mapLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      rerender(
        <QueryClientProvider client={new QueryClient()}>
          <Harness streetSuggestion={{ road: "Avenida Brasil", place: "Castelo - ES" }} />
        </QueryClientProvider>,
      );
      const question = screen.getByText(/É essa\?/);
      expect(
        question.compareDocumentPosition(screen.getByText("Localização no mapa")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.queryByText("Procurando sua rua no mapa...")).toBeNull();
    });
  });

  it("abrir o modal não põe o foco (nem o teclado do celular) no CEP", async () => {
    renderForm();
    await screen.findByRole("dialog");

    expect(document.activeElement).not.toBe(field(/CEP/));
  });

  describe("Usar minha localização (perfil e loja)", () => {
    afterEach(() => {
      Object.defineProperty(navigator, "geolocation", { value: undefined, configurable: true });
    });

    it("põe o pino onde o aparelho está, como gesto do cliente", async () => {
      const applyCoords = vi.fn();
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (ok: PositionCallback) =>
            ok({ coords: { latitude: -20.6, longitude: -41.2 } } as GeolocationPosition),
        },
      });
      renderForm({ applyCoords });

      fireEvent.click(screen.getByRole("button", { name: "Usar minha localização" }));

      expect(applyCoords).toHaveBeenCalledWith({ lat: -20.6, lng: -41.2 }, "manual");
    });

    it("sem permissão, explica e pede para arrastar o pino", async () => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) =>
            fail({ code: 1 } as GeolocationPositionError),
        },
      });
      renderForm();

      fireEvent.click(screen.getByRole("button", { name: "Usar minha localização" }));

      expect(await screen.findByText(/Não conseguimos sua localização/)).toBeTruthy();
    });
  });

  describe("aviso do CEP", () => {
    it("sem aviso, mostra a dica de sempre", () => {
      renderForm();

      expect(screen.getByText(/Digite o CEP e os campos serão preenchidos/)).toBeTruthy();
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("com aviso, mostra o aviso no lugar da dica", () => {
      renderForm({ zipCodeHint: "Este CEP vale para a cidade inteira. Preencha bairro, rua e número abaixo." });

      expect(screen.getByRole("status").textContent).toBe(
        "Este CEP vale para a cidade inteira. Preencha bairro, rua e número abaixo.",
      );
      expect(screen.queryByText(/Digite o CEP e os campos serão preenchidos/)).toBeNull();
    });

    it("enquanto busca, diz que está buscando", () => {
      renderForm({ isLoadingCep: true });

      expect(screen.getByText("Buscando CEP...")).toBeTruthy();
    });
  });
});
