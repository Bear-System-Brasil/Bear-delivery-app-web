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
  nextBirthDateValue,
  daysInMonth,
  isLeapYear,
  birthDateParts,
  birthDatePickerYears,
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

describe("nextBirthDateValue: dígito impossível não entra (LDMF-303)", () => {
  // Digita caractere a caractere, como no teclado, e devolve o valor final
  const typeChars = (chars: string, start = "") => {
    let value = start;
    for (const ch of chars) value = nextBirthDateValue(value, value + ch);
    return value;
  };

  it("dia: 1º dígito só de 0 a 3", () => {
    for (const d of "456789") expect(typeChars(d)).toBe("");
    for (const d of "0123") expect(typeChars(d)).toBe(d);
  });

  it("dia: depois do 3, só 0 ou 1", () => {
    expect(typeChars("32")).toBe("3");
    expect(typeChars("39")).toBe("3");
    expect(typeChars("30")).toBe("30");
    expect(typeChars("31")).toBe("31");
  });

  it('dia: "00" não entra', () => {
    expect(typeChars("00")).toBe("0");
    expect(typeChars("01")).toBe("01");
  });

  it("mês: 1º dígito só 0 ou 1", () => {
    for (const d of "23456789") expect(typeChars(`15${d}`)).toBe("15");
    expect(typeChars("150")).toBe("15/0");
    expect(typeChars("151")).toBe("15/1");
  });

  it("mês: depois do 1, só 0, 1 ou 2", () => {
    expect(typeChars("1513")).toBe("15/1");
    expect(typeChars("1519")).toBe("15/1");
    expect(typeChars("1512")).toBe("15/12");
  });

  it('mês: "00" não entra', () => {
    expect(typeChars("1500")).toBe("15/0");
  });

  it("ano: começa só com 1 ou 2", () => {
    for (const d of "03456789") expect(typeChars(`1510${d}`)).toBe("15/10");
    expect(typeChars("15101")).toBe("15/10/1");
    expect(typeChars("15102")).toBe("15/10/2");
  });

  it("mês que não combina com o dia já digitado não entra", () => {
    // 31 só em meses de 31 dias
    for (const m of ["04", "06", "09", "11", "02"]) {
      expect(typeChars(`31${m}`)).toBe(`31/${m[0]}`);
    }
    for (const m of ["01", "03", "05", "07", "08", "10", "12"]) {
      expect(typeChars(`31${m}`)).toBe(`31/${m}`);
    }
    // 30 e 31 nunca em fevereiro
    expect(typeChars("3002")).toBe("30/0");
    // 29/02 entra: o ano ainda pode ser bissexto
    expect(typeChars("2902")).toBe("29/02");
  });

  it("29/02 em ano comum: os dígitos entram e o aviso aparece quando o ano fecha", () => {
    const now = new Date("2026-10-16T15:00:00Z");
    const comum = typeChars("29022001");
    expect(comum).toBe("29/02/2001");
    expect(getBirthDateError(comum, now)).toBe(BIRTH_DATE_MESSAGES.invalid);

    const bissexto = typeChars("29022000");
    expect(bissexto).toBe("29/02/2000");
    expect(getBirthDateError(bissexto, now)).toBeNull();
  });

  it("menor de 18 e data futura entram: são aviso, não bloqueio", () => {
    const now = new Date("2026-10-16T15:00:00Z");
    expect(typeChars("01012015")).toBe("01/01/2015");
    expect(getBirthDateError("01/01/2015", now)).toBe(BIRTH_DATE_MESSAGES.underage);
    expect(typeChars("01012030")).toBe("01/01/2030");
    expect(getBirthDateError("01/01/2030", now)).toBe(BIRTH_DATE_MESSAGES.future);
  });

  it("apagar sempre passa", () => {
    expect(nextBirthDateValue("15/10/2000", "15/10/200")).toBe("15/10/200");
    expect(nextBirthDateValue("15/1", "15/")).toBe("15");
    // apagar o dia deixando um mês que não combina não trava o campo
    expect(nextBirthDateValue("31/01", "3/01")).toBe("30/1");
  });

  it("trocar um dígito por outro impossível não entra", () => {
    // seleciona o 1 de "15" e digita 9 no lugar do 1: "95/10/2000"
    expect(nextBirthDateValue("15/10/2000", "95/10/2000")).toBe("15/10/2000");
    // trocar o dia para 31 com mês 04 já digitado
    expect(nextBirthDateValue("30/04/2000", "31/04/2000")).toBe("30/04/2000");
  });
});

describe("nextBirthDateValue: colar (LDMF-303)", () => {
  it("aproveita só os números", () => {
    expect(nextBirthDateValue("", "Nascido em 15.10.2000")).toBe("15/10/2000");
    expect(nextBirthDateValue("", "15-10-2000")).toBe("15/10/2000");
  });

  it("se não fecha, entra assim mesmo e o aviso aparece na hora, sem travar", () => {
    const now = new Date("2026-10-16T15:00:00Z");
    const colado = nextBirthDateValue("", "31/04/2000");
    expect(colado).toBe("31/04/2000");
    expect(getBirthDateError(colado, now)).toBe(BIRTH_DATE_MESSAGES.invalid);

    // incompleto, mas já impossível: aviso de inválida, não de incompleta
    const parcial = nextBirthDateValue("", "99/1");
    expect(parcial).toBe("99/1");
    expect(getBirthDateError(parcial, now)).toBe(BIRTH_DATE_MESSAGES.invalid);

    // dá para apagar e corrigir depois
    expect(nextBirthDateValue(colado, "31/04/200")).toBe("31/04/200");
  });
});

describe("dias por mês e seletor (LDMF-303)", () => {
  it("daysInMonth considera ano bissexto em fevereiro", () => {
    expect(daysInMonth(2, 2000)).toBe(29);
    expect(daysInMonth(2, 2004)).toBe(29);
    expect(daysInMonth(2, 1900)).toBe(28);
    expect(daysInMonth(2, 2001)).toBe(28);
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4, 2001)).toBe(30);
    expect(daysInMonth(1, 2001)).toBe(31);
    expect(daysInMonth(12, 2001)).toBe(31);
  });

  it("isLeapYear segue a regra dos 100 e 400 anos", () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
  });

  it("birthDateParts lê só as partes completas", () => {
    expect(birthDateParts("")).toEqual({ day: null, month: null, year: null });
    expect(birthDateParts("15/1")).toEqual({ day: 15, month: null, year: null });
    expect(birthDateParts("15/10/20")).toEqual({ day: 15, month: 10, year: null });
    expect(birthDateParts("15/10/2000")).toEqual({ day: 15, month: 10, year: 2000 });
    expect(birthDateParts("99/99/2000")).toEqual({ day: null, month: null, year: 2000 });
  });

  it("anos do seletor: de 18 a 120 anos atrás, começando em hoje menos 18", () => {
    const years = birthDatePickerYears(new Date("2026-10-16T15:00:00Z"));
    expect(years[0]).toBe(2008);
    expect(years[years.length - 1]).toBe(1906);
    expect(years).toHaveLength(103);
  });

  it("anos do seletor usam o ano em Brasília na virada do ano", () => {
    // 02:00 UTC de 01/01/2027 ainda é 31/12/2026 em Brasília
    expect(birthDatePickerYears(new Date("2027-01-01T02:00:00Z"))[0]).toBe(2008);
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
