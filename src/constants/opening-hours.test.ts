import {
  DayHours,
  getNextOpeningLabel,
  getTodayKey,
  parseOpeningHours,
  resolveRestaurantOpenStatus,
} from "./opening-hours";

describe("parseOpeningHours", () => {
  it("devolve null pra vazio ou formato desconhecido - quem chama usa o padrão", () => {
    expect(parseOpeningHours([])).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
    expect(parseOpeningHours([{ foo: "bar" }])).toBeNull();
  });

  it("lê dias em vários formatos e marca os ausentes como fechado", () => {
    const hours = parseOpeningHours([
      { day: "mon", openTime: "18:00", closeTime: "23:00" },
      { weekday: "Sábado", open: "19:00", close: "01:00", isOpen: true },
      { dayOfWeek: 0, open: "10:00", close: "16:00", isOpen: false },
    ]);

    expect(hours).toHaveLength(7);
    expect(hours?.[0]).toMatchObject({
      day: "mon",
      label: "Segunda",
      isOpen: true,
      openTime: "18:00",
      closeTime: "23:00",
    });
    expect(hours?.[5]).toMatchObject({ day: "sat", isOpen: true, openTime: "19:00" });
    // isOpen falso vindo da API vence os horários
    expect(hours?.[6]).toMatchObject({ day: "sun", isOpen: false });
    // terça não veio: fechado
    expect(hours?.[1]).toMatchObject({ day: "tue", isOpen: false, openTime: "" });
  });
});

describe("getTodayKey", () => {
  it("mapeia getDay() (domingo = 0) pra semana começando na segunda", () => {
    expect(getTodayKey(new Date(2026, 8, 20))).toBe("sun"); // 20/09/2026 é domingo
    expect(getTodayKey(new Date(2026, 8, 21))).toBe("mon");
    expect(getTodayKey(new Date(2026, 8, 26))).toBe("sat");
  });
});

describe("getNextOpeningLabel", () => {
  const baseHours: DayHours[] = [
    { day: "mon", label: "Segunda", isOpen: true, openTime: "18:00", closeTime: "23:00" },
    { day: "tue", label: "Terça", isOpen: true, openTime: "18:00", closeTime: "23:00" },
    { day: "wed", label: "Quarta", isOpen: false, openTime: "", closeTime: "" },
    { day: "thu", label: "Quinta", isOpen: true, openTime: "18:00", closeTime: "23:00", breakStart: "12:00", breakEnd: "14:00" },
    { day: "fri", label: "Sexta", isOpen: true, openTime: "18:00", closeTime: "23:30" },
    { day: "sat", label: "Sábado", isOpen: false, openTime: "", closeTime: "" },
    { day: "sun", label: "Domingo", isOpen: false, openTime: "", closeTime: "" },
  ];

  it("retorna null se não houver horários", () => {
    expect(getNextOpeningLabel([])).toBeNull();
    expect(getNextOpeningLabel(null)).toBeNull();
  });

  it("indica que abre hoje às 18:00 se for antes da abertura na segunda-feira", () => {
    // 21/09/2026 é segunda-feira. 15:30.
    const now = new Date(2026, 8, 21, 15, 30);
    expect(getNextOpeningLabel(baseHours, now)).toBe("Abre hoje às 18:00");
  });

  it("indica que abre amanhã às 18:00 se já passou do horário de segunda-feira", () => {
    // 21/09/2026 às 23:45 (fechado)
    const now = new Date(2026, 8, 21, 23, 45);
    expect(getNextOpeningLabel(baseHours, now)).toBe("Abre amanhã às 18:00");
  });

  it("pula dia fechado (quarta fechada) e avisa abertura na quinta", () => {
    // 22/09/2026 (terça) às 23:30 -> quarta fechada -> abre quinta às 18:00
    const now = new Date(2026, 8, 22, 23, 30);
    expect(getNextOpeningLabel(baseHours, now)).toBe("Abre quinta às 18:00");
  });
});

describe("resolveRestaurantOpenStatus", () => {
  it("trata loja sem horários e sem caixa como FECHADA (elimina selo Aberto prematuro)", () => {
    const status = resolveRestaurantOpenStatus({
      isOpen: true, // backend retornou true por padrão de BD
      linkedToCashRegister: false,
      days: [], // nenhum horário cadastrado
    });

    expect(status.isOpen).toBe(false);
    expect(status.hasNoSchedule).toBe(true);
    expect(status.reason).toContain("nenhum horário de funcionamento cadastrado");
  });

  it("permite loja aberta sem horário se estiver ligada ao caixa", () => {
    const status = resolveRestaurantOpenStatus({
      isOpen: true,
      linkedToCashRegister: true,
      days: [],
    });

    expect(status.isOpen).toBe(true);
    expect(status.hasNoSchedule).toBe(false);
  });

  it("retorna fechado com previsão de reabertura quando há grade cadastrada mas loja está fechada", () => {
    const status = resolveRestaurantOpenStatus(
      {
        isOpen: false,
        linkedToCashRegister: false,
        days: [
          { id: "1", companyId: "c1", day: 1, openTime: "18:00", closeTime: "23:00" },
        ],
      },
      null,
      new Date(2026, 8, 21, 14, 0), // segunda às 14h
    );

    expect(status.isOpen).toBe(false);
    expect(status.nextOpeningLabel).toBe("Abre hoje às 18:00");
    expect(status.reason).toContain("Abre hoje às 18:00");
  });

  it("cai no fallback de restaurant.isOpen se rota de horários for null", () => {
    expect(resolveRestaurantOpenStatus(null, { isOpen: false })).toEqual({
      isOpen: false,
      reason: "Restaurante fechado no momento.",
      nextOpeningLabel: null,
    });

    expect(resolveRestaurantOpenStatus(null, { isOpen: true })).toEqual({
      isOpen: true,
      nextOpeningLabel: null,
    });
  });
});
