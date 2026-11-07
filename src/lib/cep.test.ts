import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CepNotFoundError, fetchCepAddress, findCepByStreet } from "./cep";

/**
 * CEP com API principal e reserva (LDMF-260): BrasilAPI v2 e ViaCEP.
 * Respostas medidas em 03/11/2026 com o CEP de Castelo (29360-000).
 */

const BRASILAPI_CASTELO = {
  cep: "29360000",
  state: "ES",
  city: "Castelo",
  neighborhood: null,
  street: null,
  ibge: { city: "3201407", state: "32" },
  location: {
    type: "Point",
    coordinates: { longitude: "-41.18472", latitude: "-20.60361" },
  },
};

const VIACEP_SE = {
  cep: "01001-000",
  logradouro: "Praça da Sé",
  bairro: "Sé",
  localidade: "São Paulo",
  uf: "SP",
  ibge: "3550308",
};

const json = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

/** Responde por host: brasilapi e viacep. */
function stubApis({
  brasilapi,
  viacep,
}: {
  brasilapi: Response | Error;
  viacep: Response | Error;
}) {
  const fetchMock = vi.fn(async (url: string) => {
    const answer = url.includes("brasilapi") ? brasilapi : viacep;
    if (answer instanceof Error) throw answer;
    return answer;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const hosts = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([url]) => new URL(String(url)).hostname);

describe("fetchCepAddress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("usa a BrasilAPI quando ela responde: endereço, código IBGE e coordenada", async () => {
    const fetchMock = stubApis({
      brasilapi: json(BRASILAPI_CASTELO),
      viacep: new Error("não deveria ser chamada"),
    });

    await expect(fetchCepAddress("29360-000")).resolves.toEqual({
      zipCode: "29360000",
      street: "",
      neighborhood: "",
      city: "Castelo",
      state: "ES",
      ibgeCode: "3201407",
      coords: { lat: -20.60361, lng: -41.18472 },
    });
    expect(hosts(fetchMock)).toEqual(["brasilapi.com.br"]);
  });

  it.each([
    ["fora do ar", new TypeError("Failed to fetch")],
    ["com erro 500", json({}, 500)],
  ])("BrasilAPI %s: usa a ViaCEP (sem coordenada)", async (_, brasilapi) => {
    const fetchMock = stubApis({ brasilapi, viacep: json(VIACEP_SE) });

    await expect(fetchCepAddress("01001000")).resolves.toEqual({
      zipCode: "01001000",
      street: "Praça da Sé",
      neighborhood: "Sé",
      city: "São Paulo",
      state: "SP",
      ibgeCode: "3550308",
      coords: null,
    });
    expect(hosts(fetchMock)).toEqual(["brasilapi.com.br", "viacep.com.br"]);
  });

  it("404 da BrasilAPI ainda passa pela ViaCEP (o 404 dela pode ser falha dos serviços)", async () => {
    stubApis({ brasilapi: json({}, 404), viacep: json(VIACEP_SE) });

    await expect(fetchCepAddress("01001000")).resolves.toMatchObject({
      city: "São Paulo",
    });
  });

  it("CEP inexistente nas duas: CepNotFoundError", async () => {
    stubApis({ brasilapi: json({}, 404), viacep: json({ erro: "true" }) });

    await expect(fetchCepAddress("00000001")).rejects.toBeInstanceOf(
      CepNotFoundError,
    );
  });

  it("BrasilAPI diz que não existe e a ViaCEP caiu: CepNotFoundError", async () => {
    stubApis({ brasilapi: json({}, 404), viacep: new TypeError("Failed") });

    await expect(fetchCepAddress("00000001")).rejects.toBeInstanceOf(
      CepNotFoundError,
    );
  });

  it("as duas fora do ar: erro de consulta (não é 'CEP não encontrado')", async () => {
    stubApis({
      brasilapi: new TypeError("Failed"),
      viacep: json({}, 503),
    });

    const error = await fetchCepAddress("29360000").catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CepNotFoundError);
  });

  it("CEP incompleto não consulta nada", async () => {
    const fetchMock = stubApis({ brasilapi: json({}), viacep: json({}) });

    await expect(fetchCepAddress("2936")).rejects.toThrow("CEP incompleto");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("findCepByStreet (CEP pela rua)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const viaCep = (body: unknown, ok = true) =>
    Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });

  it("cidade de CEP único: devolve o CEP da cidade", async () => {
    fetchMock.mockReturnValue(viaCep([{ cep: "29500-000", bairro: "" }]));

    expect(
      await findCepByStreet({ state: "es", city: "Alegre", street: "Rua Sete de Setembro" }),
    ).toBe("29500000");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://viacep.com.br/ws/ES/Alegre/Rua%20Sete%20de%20Setembro/json/",
    );
  });

  it("vários CEPs na rua: vale o do bairro escolhido", async () => {
    fetchMock.mockReturnValue(
      viaCep([
        { cep: "30130-905", bairro: "Centro" },
        { cep: "30140-071", bairro: "Funcionários" },
      ]),
    );

    expect(
      await findCepByStreet({
        state: "MG",
        city: "Belo Horizonte",
        street: "Avenida Afonso Pena",
        neighborhood: "funcionarios",
      }),
    ).toBe("30140071");
  });

  it("sem resultado com o tipo, tenta só com o nome", async () => {
    fetchMock
      .mockReturnValueOnce(viaCep([]))
      .mockReturnValueOnce(viaCep([{ cep: "01310-100", bairro: "Bela Vista" }]));

    expect(
      await findCepByStreet({ state: "SP", city: "São Paulo", street: "Rua Paulista" }),
    ).toBe("01310100");
    expect(fetchMock.mock.calls[1][0]).toBe("https://viacep.com.br/ws/SP/S%C3%A3o%20Paulo/Paulista/json/");
  });

  it("não acha ou a consulta falha: null", async () => {
    fetchMock.mockReturnValue(viaCep({ erro: true }));
    expect(await findCepByStreet({ state: "ES", city: "Castelo", street: "Rua X Y Z" })).toBeNull();

    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await findCepByStreet({ state: "ES", city: "Castelo", street: "Rua X Y Z" })).toBeNull();
  });

  it("sem UF válida, cidade ou rua curta, nem consulta", async () => {
    expect(await findCepByStreet({ state: "", city: "Castelo", street: "Rua A" })).toBeNull();
    expect(await findCepByStreet({ state: "ES", city: "Castelo", street: "Ab" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
