import type { OpeningHoursResponse } from "@/services/api";
import {
  DayHours,
  getNextOpeningLabel,
  getStoreClock,
  getTodayKey,
  isOpenBySchedule,
  parseOpeningHours,
  resolveRestaurantOpenStatus,
  toDayHours,
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

describe("isOpenBySchedule e status pela grade (LDMF-469)", () => {
  // Quarta, 04/11/2026. São Paulo é UTC-3: 15:00Z = 12:00 em SP.
  const at = (spTime: string) =>
    new Date(`2026-11-04T${spTime}:00-03:00`);
  const wed = (patch: Partial<DayHours> = {}): DayHours[] =>
    toDayHours([
      {
        day: 3,
        openTime: "11:00",
        closeTime: "23:00",
        ...patch,
      },
    ]);

  it("aberto dentro do horário, com as duas pontas incluídas (igual ao back)", () => {
    expect(isOpenBySchedule(wed(), at("12:00"))).toBe(true);
    expect(isOpenBySchedule(wed(), at("11:00"))).toBe(true);
    expect(isOpenBySchedule(wed(), at("23:00"))).toBe(true);
  });

  it("fechado antes de abrir e depois de fechar", () => {
    expect(isOpenBySchedule(wed(), at("10:59"))).toBe(false);
    expect(isOpenBySchedule(wed(), at("23:01"))).toBe(false);
  });

  it("fechado na pausa, com as duas pontas incluídas (igual ao back)", () => {
    const hours = wed({ breakStart: "14:00", breakEnd: "15:00" } as Partial<DayHours>);
    expect(isOpenBySchedule(hours, at("13:59"))).toBe(true);
    expect(isOpenBySchedule(hours, at("14:00"))).toBe(false);
    expect(isOpenBySchedule(hours, at("15:00"))).toBe(false);
    expect(isOpenBySchedule(hours, at("15:01"))).toBe(true);
  });

  it("no minuto do fim da pausa o rótulo ainda é \"Abre hoje\", não amanhã", () => {
    const hours = wed({ breakStart: "14:00", breakEnd: "15:00" } as Partial<DayHours>);
    expect(getNextOpeningLabel(hours, at("14:59"))).toBe("Abre hoje às 15:00");
    expect(getNextOpeningLabel(hours, at("15:00"))).toBe("Abre hoje às 15:00");
  });

  it("dia sem horário cadastrado é fechado", () => {
    const thursdayOnly = toDayHours([{ day: 4, openTime: "00:00", closeTime: "23:59" }]);
    expect(isOpenBySchedule(thursdayOnly, at("12:00"))).toBe(false);
  });

  it("usa o relógio de São Paulo, não o do aparelho", () => {
    // 02:30Z de quinta = 23:30 de quarta em SP: fechado (fecha 23:00), e
    // o dia certo é quarta, não quinta.
    expect(getStoreClock(new Date("2026-11-05T02:30:00Z"))).toEqual({
      dayNumber: 3,
      minute: 23 * 60 + 30,
    });
    expect(isOpenBySchedule(wed(), new Date("2026-11-05T02:30:00Z"))).toBe(false);
  });

  it("o status ignora o isOpen guardado no back e segue a grade", () => {
    const response = {
      isOpen: true, // guardado, desatualizado
      linkedToCashRegister: false,
      days: [{ day: 3, openTime: "11:00", closeTime: "23:00", breakStart: "11:52", breakEnd: "23:52" }],
    } as unknown as OpeningHoursResponse;
    const status = resolveRestaurantOpenStatus(response, null, at("12:00"));
    expect(status.isOpen).toBe(false);
    expect(status.reason).toContain("Restaurante fechado");
  });

  it("loja ligada ao caixa continua seguindo o isOpen do back", () => {
    const response = {
      isOpen: true,
      linkedToCashRegister: true,
      days: [],
    } as unknown as OpeningHoursResponse;
    expect(resolveRestaurantOpenStatus(response, null, at("03:00")).isOpen).toBe(true);
    expect(
      resolveRestaurantOpenStatus({ ...response, isOpen: false }, null, at("12:00")).isOpen,
    ).toBe(false);
  });
});
