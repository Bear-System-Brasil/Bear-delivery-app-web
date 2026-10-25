import { describe, expect, it } from "vitest";
import {
  EMPTY_WEEK_HOURS,
  findOpeningHoursError,
  getPersistedDays,
  toDayHours,
  toOpeningHoursDays,
  type DayHours,
} from "./opening-hours";

/** Segunda-feira: `day` 1, porque o contrato usa domingo = 0. */
const segunda = {
  id: "h-1",
  companyId: "c-1",
  day: 1,
  openTime: "18:00",
  closeTime: "23:00",
};

const domingo = { ...segunda, id: "h-7", day: 0, closeTime: "22:00" };

function dia(patch: Partial<DayHours>): DayHours {
  return {
    day: "mon",
    label: "Segunda",
    isOpen: true,
    openTime: "18:00",
    closeTime: "23:00",
    ...patch,
  };
}

describe("toDayHours", () => {
  it("mapeia day 0 para domingo e 1 para segunda", () => {
    const semana = toDayHours({ days: [segunda, domingo] });

    expect(semana.find((d) => d.day === "mon")?.openTime).toBe("18:00");
    expect(semana.find((d) => d.day === "sun")?.closeTime).toBe("22:00");
  });

  it("devolve sempre os sete dias, de segunda a domingo", () => {
    const semana = toDayHours({ days: [segunda] });

    expect(semana).toHaveLength(7);
    expect(semana.map((d) => d.day)).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
      "sun",
    ]);
  });

  it("trata dia ausente como fechado - é o que o contrato permite dizer", () => {
    const terca = toDayHours({ days: [segunda] }).find((d) => d.day === "tue");

    expect(terca?.isOpen).toBe(false);
    expect(terca?.openTime).toBe("");
  });

  it("aceita array cru além do envelope", () => {
    expect(toDayHours([segunda]).find((d) => d.day === "mon")?.isOpen).toBe(
      true,
    );
  });

  it("devolve a semana fechada quando a resposta não serve", () => {
    expect(toDayHours(undefined).every((d) => !d.isOpen)).toBe(true);
    expect(toDayHours(null)).toHaveLength(7);
    expect(toDayHours({ days: "nao-e-array" })).toHaveLength(7);
  });

  it("lê o intervalo só quando as duas pontas vêm", () => {
    const comIntervalo = toDayHours({
      days: [{ ...segunda, breakStart: "14:00", breakEnd: "16:00" }],
    })[0];
    const pelaMetade = toDayHours({
      days: [{ ...segunda, breakStart: "14:00" }],
    })[0];

    expect(comIntervalo.breakStart).toBe("14:00");
    expect(comIntervalo.breakEnd).toBe("16:00");
    expect(pelaMetade.breakStart).toBe("");
  });

  it("ignora horário fora de HH:mm", () => {
    const quebrado = toDayHours({
      days: [{ ...segunda, openTime: "abacaxi" }],
    })[0];

    expect(quebrado.isOpen).toBe(false);
    expect(quebrado.openTime).toBe("");
  });
});

describe("EMPTY_WEEK_HOURS", () => {
  it("tem os sete dias em branco, de segunda a domingo", () => {
    expect(EMPTY_WEEK_HOURS).toHaveLength(7);
    expect(EMPTY_WEEK_HOURS.map((d) => d.day)).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
      "sat",
      "sun",
    ]);
    expect(EMPTY_WEEK_HOURS.every((d) => !d.isOpen)).toBe(true);
    expect(EMPTY_WEEK_HOURS.every((d) => d.openTime === "")).toBe(true);
  });

  it("mantém o rótulo de cada dia, que a tela usa para marcar", () => {
    expect(EMPTY_WEEK_HOURS[0].label).toBe("Segunda");
    expect(EMPTY_WEEK_HOURS[6].label).toBe("Domingo");
  });
});

describe("getPersistedDays", () => {
  it("lista só os dias que o servidor devolveu abertos", () => {
    const servidor = toDayHours({ days: [segunda, domingo] });

    expect(getPersistedDays(servidor).sort()).toEqual(["mon", "sun"]);
  });

  it("não trava nada quando não há nada salvo", () => {
    expect(getPersistedDays(EMPTY_WEEK_HOURS)).toEqual([]);
  });

  it("não trava nada quando o GET falhou e não veio dado", () => {
    // Sem isso o dono não conseguiria desmarcar um dia que ele mesmo marcou
    // depois de uma falha de carregamento.
    expect(getPersistedDays(undefined)).toEqual([]);
  });
});

describe("toOpeningHoursDays", () => {
  it("converte a chave do dia de volta para o número do contrato", () => {
    const payload = toOpeningHoursDays([dia({ day: "sun", label: "Domingo" })]);

    expect(payload[0].day).toBe(0);
  });

  it("não manda id nem companyId, que o whitelist do backend rejeita", () => {
    expect(Object.keys(toOpeningHoursDays([dia({})])[0]).sort()).toEqual([
      "closeTime",
      "day",
      "openTime",
    ]);
  });

  it("deixa de fora o dia fechado - e é por isso que ele não é apagado", () => {
    expect(toOpeningHoursDays([dia({ isOpen: false })])).toEqual([]);
  });

  it("só inclui o intervalo quando tem as duas pontas", () => {
    const completo = toOpeningHoursDays([
      dia({ breakStart: "14:00", breakEnd: "16:00" }),
    ])[0];
    const metade = toOpeningHoursDays([dia({ breakStart: "14:00" })])[0];

    expect(completo.breakStart).toBe("14:00");
    expect(metade.breakStart).toBeUndefined();
  });
});

describe("findOpeningHoursError", () => {
  it("passa quando a grade está completa", () => {
    expect(findOpeningHoursError([dia({})])).toBeNull();
  });

  it("não cobra horário de dia fechado", () => {
    expect(
      findOpeningHoursError([
        dia({}),
        dia({ day: "sun", label: "Domingo", isOpen: false, openTime: "" }),
      ]),
    ).toBeNull();
  });

  it("barra a semana em branco, que salvaria sem mudar nada", () => {
    expect(findOpeningHoursError(EMPTY_WEEK_HOURS)).toContain(
      "pelo menos um dia",
    );
  });

  it("acusa dia aberto sem horário, que seria descartado em silêncio", () => {
    expect(findOpeningHoursError([dia({ closeTime: "" })])).toContain(
      "Segunda",
    );
  });

  it("barra fechamento às 00:00 e indica 23:59 (LDMF-351)", () => {
    expect(findOpeningHoursError([dia({ closeTime: "00:00" })])).toContain(
      "23:59",
    );
    expect(findOpeningHoursError([dia({ closeTime: "23:59" })])).toBeNull();
    // Abrir às 00:00 continua valendo.
    expect(findOpeningHoursError([dia({ openTime: "00:00" })])).toBeNull();
  });

  it("acusa intervalo pela metade", () => {
    expect(findOpeningHoursError([dia({ breakStart: "14:00" })])).toContain(
      "intervalo",
    );
  });
});
