import { describe, expect, it } from "vitest";
import {
  padTime,
  timeCaretPosition,
  timeFromTypedDigits,
  typeTimeDigit,
  typeTimeDigits,
} from "./time-input";

describe("timeFromTypedDigits", () => {
  it("completa com zero à direita", () => {
    expect(timeFromTypedDigits("1")).toBe("10:00");
    expect(timeFromTypedDigits("12")).toBe("12:00");
    expect(timeFromTypedDigits("123")).toBe("12:30");
    expect(timeFromTypedDigits("1234")).toBe("12:34");
  });
});

describe("typeTimeDigit", () => {
  it("hora de 00 a 23", () => {
    expect(typeTimeDigit("", "2")).toBe("2");
    expect(typeTimeDigit("2", "3")).toBe("23");
    expect(typeTimeDigit("2", "4")).toBeNull();
    expect(typeTimeDigit("1", "9")).toBe("19");
    expect(typeTimeDigit("", "3")).toBe("03");
  });

  it("minuto de 00 a 59", () => {
    expect(typeTimeDigit("12", "5")).toBe("125");
    expect(typeTimeDigit("12", "6")).toBe("1206");
    expect(typeTimeDigit("125", "9")).toBe("1259");
  });

  it("não aceita mais de 4 dígitos nem o que não é número", () => {
    expect(typeTimeDigit("1234", "5")).toBeNull();
    expect(typeTimeDigit("1", ":")).toBeNull();
  });
});

describe("typeTimeDigits", () => {
  it("aplica em sequência pulando o que não entra", () => {
    expect(typeTimeDigits("", "18:30")).toBe("1830");
    expect(typeTimeDigits("", "18:75")).toBe("1807");
    expect(typeTimeDigits("", "29:99")).toBe("2");
  });
});

describe("timeCaretPosition", () => {
  it("pula o dois-pontos", () => {
    expect([0, 1, 2, 3, 4].map(timeCaretPosition)).toEqual([0, 1, 3, 4, 5]);
  });
});

describe("padTime", () => {
  it("completa a hora com zero e não mexe no resto", () => {
    expect(padTime("9:00")).toBe("09:00");
    expect(padTime("18:00")).toBe("18:00");
    expect(padTime("")).toBe("");
  });
});
