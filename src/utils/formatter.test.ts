import { describe, expect, it } from "vitest";
import {
  formatCep,
  formatCnpj,
  formatCPF,
  formatCpfDisplay,
  formatDate,
  formatPhone,
  formatPhoneDisplay,
  formatPhoneRegex,
  getCustomerDisplayName,
  BIRTH_DATE_MESSAGES,
  getBirthDateError,
  maskBirthDate,
  isCompleteDateFormat,
  isValidCep,
  isValidCnpj,
  isValidCpf,
  isValidPhone,
  onlyNumbers,
  toDateBackendFormat,
  toDateInputFormat,
} from "./formatter";

describe("formatCPF", () => {
  it("remove tudo que não é dígito", () => {
    expect(formatCPF("123.456.789-00")).toBe("12345678900");
  });
});

describe("formatCpfDisplay", () => {
  it("aplica a máscara de CPF progressivamente conforme a digitação", () => {
    expect(formatCpfDisplay("123")).toBe("123");
    expect(formatCpfDisplay("1234")).toBe("123.4");
    expect(formatCpfDisplay("123456")).toBe("123.456");
    expect(formatCpfDisplay("1234567")).toBe("123.456.7");
    expect(formatCpfDisplay("123456789")).toBe("123.456.789");
    expect(formatCpfDisplay("1234567890")).toBe("123.456.789-0");
    expect(formatCpfDisplay("12345678900")).toBe("123.456.789-00");
  });

  it("limita a 11 dígitos numéricos", () => {
    expect(formatCpfDisplay("12345678900999")).toBe("123.456.789-00");
  });
});

describe("isCompleteDateFormat (LDMF-301)", () => {
  it("reconhece datas completas em DD/MM/AAAA e AAAA-MM-DD", () => {
    expect(isCompleteDateFormat("15/10/2000")).toBe(true);
    expect(isCompleteDateFormat("2000-10-15")).toBe(true);
    expect(isCompleteDateFormat("15/10/20")).toBe(false);
    expect(isCompleteDateFormat("")).toBe(false);
    expect(isCompleteDateFormat(null)).toBe(false);
  });
});

describe("getBirthDateError (LDMF-303)", () => {
  // 16/10/2026 ao meio-dia em Brasília (UTC-3)
  const now = new Date("2026-10-16T15:00:00Z");

  it("aceita quem faz 18 anos exatamente hoje", () => {
    expect(getBirthDateError("16/10/2008", now)).toBeNull();
  });

  it("recusa quem tem 17 anos e 364 dias (faz 18 amanhã)", () => {
    expect(getBirthDateError("17/10/2008", now)).toBe(BIRTH_DATE_MESSAGES.underage);
  });

  it("usa o dia em Brasília: 23h59 de 16/10 ainda não é aniversário de quem nasceu em 17/10", () => {
    // 02:59 UTC de 17/10 = 23:59 de 16/10 em Brasília
    const lateNight = new Date("2026-10-17T02:59:00Z");
    expect(getBirthDateError("17/10/2008", lateNight)).toBe(BIRTH_DATE_MESSAGES.underage);
    expect(getBirthDateError("16/10/2008", lateNight)).toBeNull();
  });

  it("usa o dia em Brasília: à 00h de 17/10 quem nasceu em 17/10 já faz 18", () => {
    // 03:00 UTC de 17/10 = 00:00 de 17/10 em Brasília
    const midnight = new Date("2026-10-17T03:00:00Z");
    expect(getBirthDateError("17/10/2008", midnight)).toBeNull();
  });

  it("aceita adulto em DD/MM/AAAA e em AAAA-MM-DD", () => {
    expect(getBirthDateError("01/01/1990", now)).toBeNull();
    expect(getBirthDateError("1990-01-01", now)).toBeNull();
  });

  it("recusa data futura", () => {
    expect(getBirthDateError("17/10/2026", now)).toBe(BIRTH_DATE_MESSAGES.future);
    expect(getBirthDateError("01/01/2030", now)).toBe(BIRTH_DATE_MESSAGES.future);
  });

  it("recusa data que não existe", () => {
    expect(getBirthDateError("31/02/2000", now)).toBe(BIRTH_DATE_MESSAGES.invalid);
    expect(getBirthDateError("29/02/2001", now)).toBe(BIRTH_DATE_MESSAGES.invalid);
    expect(getBirthDateError("00/01/2000", now)).toBe(BIRTH_DATE_MESSAGES.invalid);
    expect(getBirthDateError("15/13/2000", now)).toBe(BIRTH_DATE_MESSAGES.invalid);
  });

  it("aceita até 120 anos e recusa mais de 120", () => {
    // 120 anos completos hoje
    expect(getBirthDateError("16/10/1906", now)).toBeNull();
    // 120 anos e 364 dias: ainda tem 120
    expect(getBirthDateError("17/10/1905", now)).toBeNull();
    // 121 anos completos hoje
    expect(getBirthDateError("16/10/1905", now)).toBe(BIRTH_DATE_MESSAGES.invalid);
    expect(getBirthDateError("01/01/1800", now)).toBe(BIRTH_DATE_MESSAGES.invalid);
  });

  it("pede a data completa quando vazia, nula ou pela metade", () => {
    expect(getBirthDateError("", now)).toBe(BIRTH_DATE_MESSAGES.incomplete);
    expect(getBirthDateError(null, now)).toBe(BIRTH_DATE_MESSAGES.incomplete);
    expect(getBirthDateError(undefined, now)).toBe(BIRTH_DATE_MESSAGES.incomplete);
    expect(getBirthDateError("15/10/20", now)).toBe(BIRTH_DATE_MESSAGES.incomplete);
    expect(getBirthDateError("data-invalida", now)).toBe(BIRTH_DATE_MESSAGES.incomplete);
  });
});

describe("maskBirthDate (LDMF-303)", () => {
  it("aplica a máscara desde o primeiro dígito, com as barras entrando sozinhas", () => {
    let value = "";
    const steps: string[] = [];
    for (const digit of "15102000") {
      value = maskBirthDate(value + digit);
      steps.push(value);
    }
    expect(steps).toEqual([
      "1",
      "15",
      "15/1",
      "15/10",
      "15/10/2",
      "15/10/20",
      "15/10/200",
      "15/10/2000",
    ]);
  });

  it("ignora o que não é dígito e limita a 8 dígitos", () => {
    expect(maskBirthDate("15-10-2000")).toBe("15/10/2000");
    expect(maskBirthDate("ab15c")).toBe("15");
    expect(maskBirthDate("151020001234")).toBe("15/10/2000");
  });

  it("apagar a barra apaga junto o separador, sem travar o campo", () => {
    // "15/1" com backspace vira "15/" e a máscara devolve "15"
    expect(maskBirthDate("15/")).toBe("15");
    expect(maskBirthDate("15/10/")).toBe("15/10");
    expect(maskBirthDate("")).toBe("");
  });
});

describe("formatPhone", () => {
  it("remove caracteres não numéricos", () => {
    expect(formatPhone("(11) 98765-4321")).toBe("11987654321");
  });

  it("remove o prefixo +55 quando o número tem DDI", () => {
    expect(formatPhone("+55 11 98765-4321")).toBe("11987654321");
  });

  it("não mexe em número sem DDI, mesmo começando com 55 (DDD)", () => {
    expect(formatPhone("55987654321")).toBe("55987654321");
  });
});

describe("formatCnpj", () => {
  it("aplica a máscara 00.000.000/0000-00", () => {
    expect(formatCnpj("12345678000199")).toBe("12.345.678/0001-99");
  });

  it("trunca entrada maior que 14 dígitos", () => {
    expect(formatCnpj("123456780001999999")).toBe("12.345.678/0001-99");
  });
});

describe("formatPhoneDisplay", () => {
  it("aplica a máscara (00) 00000-0000", () => {
    expect(formatPhoneDisplay("11987654321")).toBe("(11) 98765-4321");
  });
});

describe("formatCep", () => {
  it("aplica a máscara 00000-000", () => {
    expect(formatCep("01310100")).toBe("01310-100");
  });
});

describe("onlyNumbers", () => {
  it("mantém somente dígitos", () => {
    expect(onlyNumbers("R$ 1.234,56")).toBe("123456");
  });
});

describe("isValidCpf / isValidCnpj / isValidPhone / isValidCep", () => {
  it("valida pelo total de dígitos esperado", () => {
    expect(isValidCpf("123.456.789-00")).toBe(true);
    expect(isValidCpf("123")).toBe(false);

    expect(isValidCnpj("12.345.678/0001-99")).toBe(true);
    expect(isValidCnpj("123")).toBe(false);

    expect(isValidPhone("(11) 98765-4321")).toBe(true);
    expect(isValidPhone("123")).toBe(false);

    expect(isValidCep("01310-100")).toBe(true);
    expect(isValidCep("123")).toBe(false);
  });
});

describe("formatPhoneRegex", () => {
  it("formata um celular de 11 dígitos como (00) 0 0000-0000", () => {
    expect(formatPhoneRegex("11987654321")).toBe("(11) 9 8765-4321");
  });

  it("mantém a string original quando não bate com 11 dígitos", () => {
    expect(formatPhoneRegex("1198765432")).toBe("1198765432");
  });
});

describe("getCustomerDisplayName", () => {
  it("usa o nome do cliente quando presente", () => {
    expect(getCustomerDisplayName({ name: "Maria" })).toBe("Maria");
  });

  it("cai para 'Cliente' quando não há relação ou nome vazio", () => {
    expect(getCustomerDisplayName(null)).toBe("Cliente");
    expect(getCustomerDisplayName(undefined)).toBe("Cliente");
    expect(getCustomerDisplayName({ name: "   " })).toBe("Cliente");
  });
});

describe("toDateInputFormat", () => {
  it("converte uma data ISO para YYYY-MM-DD em UTC", () => {
    expect(toDateInputFormat("2024-03-15T10:00:00.000Z")).toBe("2024-03-15");
  });

  it("converte data DD/MM/YYYY para YYYY-MM-DD", () => {
    expect(toDateInputFormat("15/05/1990")).toBe("1990-05-15");
  });

  it("converte data YYYY-MM-DD para YYYY-MM-DD", () => {
    expect(toDateInputFormat("1990-05-15")).toBe("1990-05-15");
  });

  it("retorna string vazia para entrada vazia ou inválida", () => {
    expect(toDateInputFormat("")).toBe("");
    expect(toDateInputFormat("não-é-uma-data")).toBe("");
  });
});

describe("toDateBackendFormat", () => {
  it("converte YYYY-MM-DD para DD/MM/YYYY para envio ao backend", () => {
    expect(toDateBackendFormat("1990-05-15")).toBe("15/05/1990");
  });

  it("mantém DD/MM/YYYY já formatado", () => {
    expect(toDateBackendFormat("15/05/1990")).toBe("15/05/1990");
  });

  it("converte ISO para DD/MM/YYYY", () => {
    expect(toDateBackendFormat("1990-05-15T00:00:00.000Z")).toBe("15/05/1990");
  });

  it("retorna undefined para entrada vazia ou inválida", () => {
    expect(toDateBackendFormat("")).toBeUndefined();
    expect(toDateBackendFormat(null)).toBeUndefined();
    expect(toDateBackendFormat(undefined)).toBeUndefined();
    expect(toDateBackendFormat("invalido")).toBeUndefined();
  });
});

describe("formatDate", () => {
  it("formata ISO para DD/MM/YYYY", () => {
    expect(formatDate("1990-05-15T00:00:00.000Z")).toBe("15/05/1990");
  });

  it("formata DD/MM/YYYY mantendo o formato correto", () => {
    expect(formatDate("15/05/1990")).toBe("15/05/1990");
  });

  it("formata YYYY-MM-DD para DD/MM/YYYY", () => {
    expect(formatDate("1990-05-15")).toBe("15/05/1990");
  });

  it("retorna string vazia para entrada vazia ou inválida em vez de 'Invalid Date'", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate("invalido")).toBe("");
  });
});
