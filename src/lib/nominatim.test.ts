import { describe, expect, it, vi } from "vitest";

import { createNominatimClient, isInCity } from "./nominatim";

const CASTELO = { city: "Castelo", state: "ES" };

const inCastelo = {
  lat: "-20.6",
  lon: "-41.2",
  address: { town: "Castelo", state: "Espírito Santo", "ISO3166-2-lvl4": "BR-ES" },
};

function respond(results: unknown[]) {
  return vi.fn(async (_input: RequestInfo | URL) => ({ ok: true, json: async () => results }) as Response);
}

/** Relógio controlado: `sleep` avança o tempo em vez de esperar. */
function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
  };
}

describe("isInCity", () => {
  it("aceita ponto do mesmo município e estado", () => {
    expect(isInCity(inCastelo.address, CASTELO)).toBe(true);
  });

  it("recusa outro município, mesmo com nome parecido", () => {
    expect(isInCity({ town: "Conceição do Castelo", "ISO3166-2-lvl4": "BR-ES" }, CASTELO)).toBe(false);
    expect(isInCity({ city: "Cachoeiro de Itapemirim", "ISO3166-2-lvl4": "BR-ES" }, CASTELO)).toBe(false);
  });

  it("recusa cidade de mesmo nome em outro estado", () => {
    expect(isInCity({ town: "Castelo", "ISO3166-2-lvl4": "BR-PI" }, CASTELO)).toBe(false);
  });

  it("sem código ISO, compara o nome do estado", () => {
    expect(isInCity({ municipality: "Castelo", state: "Espirito Santo" }, CASTELO)).toBe(true);
    expect(isInCity({ municipality: "Castelo", state: "Piauí" }, CASTELO)).toBe(false);
  });

  it("sem endereço, recusa", () => {
    expect(isInCity(undefined, CASTELO)).toBe(false);
  });
});

describe("createNominatimClient", () => {
  it("busca rua e número codificados, sem o bairro", async () => {
    const fetchFn = respond([inCastelo]);
    const client = createNominatimClient({ fetchFn, ...fakeClock() });

    await client.searchAddress({ ...CASTELO, street: "Rua A & B #2", number: "45" });

    const url = new URL(fetchFn.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("street")).toBe("45 Rua A & B #2");
    expect(url.searchParams.get("city")).toBe("Castelo");
    expect(url.searchParams.get("state")).toBe("Espírito Santo");
    expect(url.searchParams.get("country")).toBe("Brasil");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("devolve a coordenada quando o ponto cai na cidade", async () => {
    const client = createNominatimClient({ fetchFn: respond([inCastelo]), ...fakeClock() });

    expect(await client.searchAddress({ ...CASTELO, street: "Rua A", number: "1" })).toEqual({
      lat: -20.6,
      lng: -41.2,
    });
  });

  it("descarta ponto fora da cidade", async () => {
    const fora = { ...inCastelo, address: { city: "Vitória", "ISO3166-2-lvl4": "BR-ES" } };
    const client = createNominatimClient({ fetchFn: respond([fora]), ...fakeClock() });

    expect(await client.searchAddress({ ...CASTELO, street: "Rua A", number: "1" })).toBeNull();
  });

  it("sem resultado ou com erro, devolve null", async () => {
    const vazio = createNominatimClient({ fetchFn: respond([]), ...fakeClock() });
    const quebrado = createNominatimClient({
      fetchFn: vi.fn(async () => ({ ok: false, status: 429 }) as Response),
      ...fakeClock(),
    });

    expect(await vazio.searchCity(CASTELO)).toBeNull();
    expect(await quebrado.searchCity(CASTELO)).toBeNull();
  });

  it("mesma busca usa o cache e não chama o Nominatim de novo", async () => {
    const fetchFn = respond([inCastelo]);
    const client = createNominatimClient({ fetchFn, ...fakeClock() });

    await client.searchAddress({ ...CASTELO, street: "Rua A", number: "1" });
    await client.searchAddress({ ...CASTELO, street: "Rua A", number: "1" });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("erro de rede não fica no cache", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => [inCastelo] });
    const client = createNominatimClient({ fetchFn, ...fakeClock() });

    expect(await client.searchCity(CASTELO)).toBeNull();
    expect(await client.searchCity(CASTELO)).toEqual({ lat: -20.6, lng: -41.2 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("espera 1 segundo entre duas buscas diferentes", async () => {
    const clock = fakeClock();
    const fetchFn = respond([inCastelo]);
    const client = createNominatimClient({ fetchFn, ...clock });

    await Promise.all([
      client.searchAddress({ ...CASTELO, street: "Rua A", number: "1" }),
      client.searchAddress({ ...CASTELO, street: "Rua B", number: "2" }),
      client.searchCity(CASTELO),
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(clock.sleeps).toEqual([1000, 1000]);
  });
});

describe("findStreet: tentativas de rua (LDMF-282)", () => {
  /** Responde por chamada: a fila do Nominatim mantém a ordem. */
  function sequence(...answers: unknown[][]) {
    const fetchFn = vi.fn();
    for (const answer of answers) {
      fetchFn.mockResolvedValueOnce({ ok: true, json: async () => answer });
    }
    fetchFn.mockResolvedValue({ ok: true, json: async () => [] });
    return fetchFn;
  }

  const streetOf = (fetchFn: ReturnType<typeof vi.fn>, call: number) =>
    new URL(fetchFn.mock.calls[call][0] as string).searchParams.get("street");

  const avenida = {
    ...inCastelo,
    address: { ...inCastelo.address, road: "Avenida Nossa Senhora da Penha" },
  };

  it("acha de primeira com tipo e número e não pede confirmação", async () => {
    const fetchFn = sequence([inCastelo]);
    const client = createNominatimClient({ fetchFn, ...fakeClock() });

    const match = await client.findStreet({
      ...CASTELO,
      street: "Rua Machado de Assis",
      number: "304",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(streetOf(fetchFn, 0)).toBe("304 Rua Machado de Assis");
    expect(match).toMatchObject({ coords: { lat: -20.6, lng: -41.2 }, withoutChosenType: false });
  });

  it("tenta sem número, depois sem o tipo, e devolve o nome da via achada", async () => {
    const fetchFn = sequence([], [], [avenida]);
    const client = createNominatimClient({ fetchFn, ...fakeClock() });

    const match = await client.findStreet({
      ...CASTELO,
      street: "Rua Nossa Senhora da Penha",
      number: "120",
    });

    expect([0, 1, 2].map((call) => streetOf(fetchFn, call))).toEqual([
      "120 Rua Nossa Senhora da Penha",
      "Rua Nossa Senhora da Penha",
      "120 Nossa Senhora da Penha",
    ]);
    expect(match).toEqual({
      coords: { lat: -20.6, lng: -41.2 },
      road: "Avenida Nossa Senhora da Penha",
      area: null,
      withoutChosenType: true,
    });
  });

  it("devolve o bairro da via (suburb, neighbourhood ou quarter)", async () => {
    const comBairro = {
      ...inCastelo,
      address: { ...inCastelo.address, road: "Rua A", neighbourhood: "Santo Andrezinho" },
    };
    const client = createNominatimClient({ fetchFn: sequence([comBairro]), ...fakeClock() });

    const match = await client.findStreet({ ...CASTELO, street: "Rua A", number: "1" });

    expect(match?.area).toBe("Santo Andrezinho");
  });

  it("no máximo 4 chamadas, e nenhuma acha: null", async () => {
    const fetchFn = sequence();
    const client = createNominatimClient({ fetchFn, ...fakeClock() });

    expect(
      await client.findStreet({ ...CASTELO, street: "Rua Inexistente", number: "1" }),
    ).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("sem número: só duas tentativas (com e sem o tipo)", async () => {
    const fetchFn = sequence();
    const client = createNominatimClient({ fetchFn, ...fakeClock() });

    await client.findStreet({ ...CASTELO, street: "Rua Inexistente", number: "" });

    expect([0, 1].map((call) => streetOf(fetchFn, call))).toEqual([
      "Rua Inexistente",
      "Inexistente",
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("busca cancelada não faz as tentativas seguintes", async () => {
    const fetchFn = sequence();
    const client = createNominatimClient({ fetchFn, ...fakeClock() });
    let cancelled = false;
    fetchFn.mockImplementationOnce(async () => {
      cancelled = true;
      return { ok: true, json: async () => [] };
    });

    await client.findStreet(
      { ...CASTELO, street: "Rua A", number: "1" },
      () => cancelled,
    );

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
