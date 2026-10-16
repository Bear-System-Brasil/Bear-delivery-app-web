import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  addressSchema,
  loginSchema,
  profileSchema,
  useLoginForm,
  useProfileForm,
} from "./use-form-validation";
import { BIRTH_DATE_MESSAGES } from "@/utils";

describe("profileSchema", () => {
  it("aceita um perfil válido com CPF", () => {
    const result = profileSchema.safeParse({
      name: "Maria",
      email: "maria@example.com",
      cpf: "12345678900",
      phone: "11987654321",
    });
    expect(result.success).toBe(true);
  });

  it("aceita um perfil sem CPF ou com CPF vazio", () => {
    expect(
      profileSchema.safeParse({
        name: "Maria",
        email: "maria@example.com",
        phone: "11987654321",
      }).success,
    ).toBe(true);

    expect(
      profileSchema.safeParse({
        name: "Maria",
        email: "maria@example.com",
        cpf: "",
        phone: "11987654321",
      }).success,
    ).toBe(true);
  });

  it("aceita CPF formatado com pontuação", () => {
    const result = profileSchema.safeParse({
      name: "Maria",
      email: "maria@example.com",
      cpf: "123.456.789-00",
      phone: "11987654321",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita CPF com menos de 11 dígitos quando preenchido", () => {
    const result = profileSchema.safeParse({
      name: "Maria",
      email: "maria@example.com",
      cpf: "123456",
      phone: "11987654321",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome muito curto e e-mail inválido", () => {
    const result = profileSchema.safeParse({
      name: "M",
      email: "não-é-email",
      cpf: "12345678900",
      phone: "11987654321",
    });
    expect(result.success).toBe(false);
  });
});

describe("profileSchema - data de nascimento (LDMF-303)", () => {
  const base = { name: "Maria", email: "maria@example.com", phone: "11987654321" };
  const birthDateError = (birthDate?: string) => {
    const result = profileSchema.safeParse({ ...base, birthDate });
    return result.success
      ? null
      : result.error.issues.find((i) => i.path[0] === "birthDate")?.message ?? null;
  };

  it("usa a mesma regra do cadastro", () => {
    expect(birthDateError("01/01/1990")).toBeNull();
    expect(birthDateError(`01/01/${new Date().getFullYear() - 10}`)).toBe(
      BIRTH_DATE_MESSAGES.underage,
    );
    expect(birthDateError("31/02/2000")).toBe(BIRTH_DATE_MESSAGES.invalid);
    expect(birthDateError(`01/01/${new Date().getFullYear() + 1}`)).toBe(
      BIRTH_DATE_MESSAGES.future,
    );
    expect(birthDateError("01/01/1800")).toBe(BIRTH_DATE_MESSAGES.invalid);
  });

  it("vazia continua aceita (o perfil não manda birthDate)", () => {
    expect(birthDateError("")).toBeNull();
    expect(birthDateError(undefined)).toBeNull();
  });
});

describe("addressSchema", () => {
  it("exige os campos obrigatórios de endereço", () => {
    const result = addressSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("aceita um endereço completo", () => {
    const result = addressSchema.safeParse({
      street: "Rua das Flores",
      number: "123",
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zipCode: "01310100",
    });
    expect(result.success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("exige senha com pelo menos 6 caracteres", () => {
    const result = loginSchema.safeParse({ phone: "11987654321", password: "123" });
    expect(result.success).toBe(false);
  });

  it("aceita telefone e senha válidos", () => {
    const result = loginSchema.safeParse({ phone: "11987654321", password: "123456" });
    expect(result.success).toBe(true);
  });
});

// O `formState` do react-hook-form é um Proxy que só passa a acompanhar um
// campo (e a receber as atualizações internas dele) depois que esse campo é
// lido pelo menos uma vez - sem essa leitura "primária", `errors` nunca sai
// de `{}` mesmo depois do `trigger()` resolver. Não é peculiaridade de
// teste: é assim que a lib evita re-render de campo que ninguém observa.
function primeErrorsTracking(formState: { errors: unknown }) {
  void formState.errors;
}

describe("useProfileForm", () => {
  it("expõe erros de validação depois do trigger quando os valores são inválidos", async () => {
    const { result } = renderHook(() =>
      useProfileForm({ name: "M", email: "invalido", cpf: "123", phone: "123" }),
    );
    primeErrorsTracking(result.current.formState);

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.formState.errors.name).toBeDefined();
    expect(result.current.formState.errors.email).toBeDefined();
  });

  it("não gera erros quando os valores padrão já são válidos", async () => {
    const { result } = renderHook(() =>
      useProfileForm({
        name: "Maria",
        email: "maria@example.com",
        cpf: "12345678900",
        phone: "11987654321",
      }),
    );
    primeErrorsTracking(result.current.formState);

    await act(async () => {
      await result.current.trigger();
    });

    expect(Object.keys(result.current.formState.errors)).toHaveLength(0);
  });
});

describe("useLoginForm", () => {
  it("valida telefone e senha juntos", async () => {
    const { result } = renderHook(() => useLoginForm({ phone: "123", password: "123" }));
    primeErrorsTracking(result.current.formState);

    await act(async () => {
      await result.current.trigger();
    });

    expect(result.current.formState.errors.phone).toBeDefined();
    expect(result.current.formState.errors.password).toBeDefined();
  });
});
