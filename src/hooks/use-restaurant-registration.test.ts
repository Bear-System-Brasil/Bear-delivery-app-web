import { act, renderHook } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useRestaurantRegistration } from "./use-restaurant-registration";

const { router } = vi.hoisted(() => ({ router: { push: vi.fn() } }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      register: vi.fn(),
      logout: vi.fn(),
      companies: { create: vi.fn() },
    },
  };
});

const api = vi.mocked(apiService, true);

const valid = {
  tradeName: "Bear Burger",
  legalName: "Bear Burger Ltda",
  cnpj: "12.345.678/0001-90",
  email: "Loja@Bear.com",
  phone: "(41) 99999-0000",
  password: "Senha@123",
  confirmPassword: "Senha@123",
  description: "",
  birthDate: "01/01/1990",
};

type Hook = ReturnType<typeof renderHook<ReturnType<typeof useRestaurantRegistration>, unknown>>["result"];

function type(result: Hook, fields: Partial<typeof valid>) {
  for (const [field, value] of Object.entries(fields)) {
    act(() => result.current.handleInputChange(field as keyof typeof valid, value));
  }
}

const event = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent;

async function submit(result: Hook) {
  const e = event();
  await act(async () => {
    await result.current.handleSubmit(e);
  });
  return e;
}

describe("useRestaurantRegistration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    api.register.mockResolvedValue({ success: true, data: { data: { user: { id: "u1" } } } } as never);
    api.companies.create.mockResolvedValue({ success: true, data: { id: "c1" } } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("formulário", () => {
    it("e-mail em minúsculas", () => {
      const { result } = renderHook(() => useRestaurantRegistration());

      type(result, { email: "Loja@Bear.COM" });

      expect(result.current.registerData.email).toBe("loja@bear.com");
    });

    it("senha exige tamanho, maiúscula, minúscula, número e símbolo", () => {
      const { result } = renderHook(() => useRestaurantRegistration());

      type(result, { password: "abc" });

      expect(result.current.passwordErrors).toEqual([
        "mínimo 6 caracteres",
        "1 letra maiúscula",
        "1 número",
        "1 símbolo",
      ]);
    });

    it("confere a confirmação nos dois sentidos", () => {
      const { result } = renderHook(() => useRestaurantRegistration());

      type(result, { password: "Senha@123", confirmPassword: "Senha@124" });
      expect(result.current.passwordMatch).toBe(false);

      type(result, { password: "Senha@124" });
      expect(result.current.passwordMatch).toBe(true);
    });

    it("só é válido com os obrigatórios, senha forte e confirmação igual", () => {
      const { result } = renderHook(() => useRestaurantRegistration());

      type(result, { ...valid, legalName: "" });
      expect(result.current.isFormValid).toBeFalsy();

      type(result, { legalName: "Bear Burger Ltda" });
      expect(result.current.isFormValid).toBeTruthy();

      type(result, { confirmPassword: "Outra@123" });
      expect(result.current.isFormValid).toBeFalsy();
    });

    it("descrição é opcional", () => {
      const { result } = renderHook(() => useRestaurantRegistration());

      type(result, { ...valid, description: "" });

      expect(result.current.isFormValid).toBeTruthy();
    });

    it("não é válido sem data de nascimento (LDMF-422)", () => {
      const { result } = renderHook(() => useRestaurantRegistration());

      type(result, { ...valid, birthDate: "" });
      expect(result.current.isFormValid).toBeFalsy();

      type(result, { birthDate: "01/01/1990" });
      expect(result.current.isFormValid).toBeTruthy();
    });
  });

  describe("envio", () => {
    it("cria a conta sem role e depois a empresa, com CNPJ e telefone só com dígitos", async () => {
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      const e = await submit(result);

      expect(e.preventDefault).toHaveBeenCalled();
      expect(api.register).toHaveBeenCalledWith({
        name: "Bear Burger",
        email: "loja@bear.com",
        phone: "41999990000",
        password: "Senha@123",
        birthDate: "01/01/1990",
      });
      expect(api.companies.create).toHaveBeenCalledWith({
        tradeName: "Bear Burger",
        legalName: "Bear Burger Ltda",
        description: "Bear Burger",
        actionRadius: "10",
        cnpj: "12345678000190",
        email: "loja@bear.com",
        phone: "41999990000",
      });
      expect(api.register.mock.invocationCallOrder[0]).toBeLessThan(
        api.companies.create.mock.invocationCallOrder[0],
      );
    });

    it("descrição preenchida vai no lugar do nome", async () => {
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { ...valid, description: "Hambúrguer artesanal" });

      await submit(result);

      expect(api.companies.create.mock.calls[0][0].description).toBe("Hambúrguer artesanal");
    });

    it("sucesso avisa e leva ao login depois de 2s", async () => {
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      await submit(result);

      expect(result.current.submitMessage?.type).toBe("success");
      act(() => vi.advanceTimersByTime(1999));
      expect(router.push).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(router.push).toHaveBeenCalledWith("/?openAuth=true");
      expect(result.current.isLoading).toBe(false);
    });

    it("senha fraca bloqueia sem chamar a API", async () => {
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { ...valid, password: "fraca", confirmPassword: "fraca" });

      await submit(result);

      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: "Por favor, atenda todos os requisitos de senha.",
      });
      expect(api.register).not.toHaveBeenCalled();
    });

    it("confirmação diferente bloqueia sem chamar a API", async () => {
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { ...valid, confirmPassword: "Outra@123" });

      await submit(result);

      expect(result.current.submitMessage?.text).toBe("As senhas não coincidem.");
      expect(api.register).not.toHaveBeenCalled();
    });

    it("sem data de nascimento bloqueia sem chamar a API (LDMF-422)", async () => {
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { ...valid, birthDate: "" });

      await submit(result);

      expect(result.current.submitMessage?.type).toBe("error");
      expect(api.register).not.toHaveBeenCalled();
    });

    it("menor de 18 bloqueia sem chamar a API (LDMF-422)", async () => {
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { ...valid, birthDate: "01/01/2015" });

      await submit(result);

      expect(result.current.submitMessage?.type).toBe("error");
      expect(api.register).not.toHaveBeenCalled();
    });

    it("manda a data de nascimento do dono no cadastro (LDMF-422)", async () => {
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      await submit(result);

      expect(api.register.mock.calls[0][0]).toMatchObject({
        birthDate: "01/01/1990",
      });
    });

    it("conta recusada não tenta criar a empresa", async () => {
      api.register.mockResolvedValue({ success: false, message: "Senha muito curta" } as never);
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      await submit(result);

      expect(api.companies.create).not.toHaveBeenCalled();
      expect(result.current.submitMessage).toEqual({ type: "error", text: "Senha muito curta" });
    });

    it.each([
      ["User already exists", "Este email, CNPJ ou telefone já está cadastrado no sistema."],
      ["duplicate key violates unique constraint", "Este email, CNPJ ou telefone já está cadastrado no sistema."],
      ["cnpj must be a valid CNPJ", /^CNPJ inválido\. Verifique o número digitado\.$/],
      // Erro que não é de CNPJ chega como o backend mandou.
      ["Invalid phone number", /^Invalid phone number$/],
      ["email is invalid", /^email is invalid$/],
    ])("traduz '%s'", async (message, text) => {
      api.register.mockResolvedValue({ success: false, message } as never);
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      await submit(result);

      expect(result.current.submitMessage?.text).toMatch(text);
    });

    it("lista de mensagens usa a primeira", async () => {
      api.register.mockResolvedValue({
        success: false,
        message: ["email must be an email", "phone should not be empty"],
      } as never);
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      await submit(result);

      expect(result.current.submitMessage?.text).toBe("email must be an email");
    });

    it("sem mensagem, usa o texto padrão", async () => {
      api.register.mockResolvedValue({ success: false } as never);
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      await submit(result);

      expect(result.current.submitMessage?.text).toBe("Erro ao cadastrar restaurante. Tente novamente.");
    });

    it("conta criada e empresa recusada avisa e leva ao login depois de 3s", async () => {
      api.companies.create.mockResolvedValue({ success: false, message: "Razão social obrigatória" } as never);
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      await submit(result);

      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: "Conta criada, mas houve um erro ao cadastrar a empresa: Razão social obrigatória. Faça login e tente novamente pelo painel.",
      });
      act(() => vi.advanceTimersByTime(2999));
      expect(router.push).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(router.push).toHaveBeenCalledWith("/?openAuth=true");
    });

    it("exceção de rede mostra a mensagem da exceção", async () => {
      api.register.mockRejectedValue(new Error("Failed to fetch"));
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, valid);

      await submit(result);

      expect(result.current.submitMessage).toEqual({ type: "error", text: "Failed to fetch" });
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("conta já logada (LDMF-295)", () => {
    const initialAuth = useAuthStore.getState();

    const loginAs = (role: string) =>
      act(() =>
        useAuthStore.setState({
          isAuthenticated: true,
          user: {
            id: "u1",
            name: "Kauan",
            email: "Kauan@Bear.com",
            phone: "27999990000",
            role,
          } as never,
        }),
      );

    afterEach(() => {
      useAuthStore.setState(initialAuth, true);
    });

    it("preenche e-mail e telefone com os da conta", () => {
      loginAs("client");
      const { result } = renderHook(() => useRestaurantRegistration());

      expect(result.current.isLoggedIn).toBe(true);
      expect(result.current.registerData.email).toBe("kauan@bear.com");
      expect(result.current.registerData.phone).toBe("27999990000");
    });

    it("válido sem senha", () => {
      loginAs("client");
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { tradeName: valid.tradeName, legalName: valid.legalName, cnpj: valid.cnpj });

      expect(result.current.isFormValid).toBe(true);
    });

    it("cria só a empresa, sem criar outra conta, e pede login de novo", async () => {
      loginAs("client");
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { tradeName: valid.tradeName, legalName: valid.legalName, cnpj: valid.cnpj });

      await submit(result);

      expect(api.register).not.toHaveBeenCalled();
      expect(api.companies.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cnpj: "12345678000190",
          email: "kauan@bear.com",
          phone: "27999990000",
        }),
      );
      // Token não é renovado pelo POST /company: sai e manda pro login.
      expect(api.logout).toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      act(() => vi.advanceTimersByTime(2000));
      expect(router.push).toHaveBeenCalledWith("/?openAuth=true");
    });

    it("empresa recusada mostra o erro e não sai da conta", async () => {
      loginAs("client");
      api.companies.create.mockResolvedValue({ success: false, message: "CNPJ inválido" } as never);
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { tradeName: valid.tradeName, legalName: valid.legalName, cnpj: valid.cnpj });

      await submit(result);

      expect(result.current.submitMessage).toEqual({
        type: "error",
        text: "CNPJ inválido. Verifique o número digitado.",
      });
      expect(api.logout).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it("conta que já é staff ou dono não cadastra por aqui", async () => {
      loginAs("owner");
      const { result } = renderHook(() => useRestaurantRegistration());
      type(result, { tradeName: valid.tradeName, legalName: valid.legalName, cnpj: valid.cnpj });

      expect(result.current.canRegisterOnAccount).toBe(false);
      expect(result.current.isFormValid).toBe(false);

      await submit(result);
      expect(api.companies.create).not.toHaveBeenCalled();
    });
  });
});
