import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService, PaymentMethod } from "./api";

/**
 * `apiRequest` (o único ponto que fala HTTP nesse arquivo) não é exportado -
 * de propósito, é implementação interna. Testamos o comportamento dele
 * através de métodos públicos que são passthrough direto pra ele
 * (`getAllProducts`, `updateUser`, `orderItems.addProductToCart`...),
 * mockando só o `fetch` global - a fronteira real com a rede.
 */

function jsonResponse(body: unknown, init: Partial<Response> & { status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? "",
    headers: { get: () => "application/json" },
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function noContentResponse(status = 204) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    json: () => Promise.resolve(undefined),
  } as unknown as Response;
}

describe("apiService (via apiRequest)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("em sucesso, devolve success:true com data e status", async () => {
    const products = [{ id: "p1", name: "Pizza" }];
    vi.mocked(fetch).mockResolvedValue(jsonResponse(products));

    const result = await apiService.getAllProducts();

    expect(result).toEqual({ success: true, data: products, status: 200 });
    expect(fetch).toHaveBeenCalledWith(
      "/api/proxy/product",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("adiciona o header X-Auth-Required só quando o endpoint exige autenticação", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await apiService.getAllProducts(); // requiresAuth = false
    const [, publicConfig] = vi.mocked(fetch).mock.calls[0];
    expect((publicConfig?.headers as Record<string, string>)["X-Auth-Required"]).toBeUndefined();

    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
    await apiService.updateUser({ name: "Nova" } as never); // requiresAuth = true
    const [, authedConfig] = vi.mocked(fetch).mock.calls[0];
    expect((authedConfig?.headers as Record<string, string>)["X-Auth-Required"]).toBe("1");
  });

  it("prefixa o endpoint com /api/proxy", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse([]));
    await apiService.getAllCategories();
    expect(fetch).toHaveBeenCalledWith("/api/proxy/categories", expect.anything());
  });

  describe("401 em rota que exige autenticação", () => {
    it("dispara 'auth:unauthorized' e devolve a mensagem de sessão expirada", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: "unauthorized" }, { status: 401 }));
      const listener = vi.fn();
      window.addEventListener("auth:unauthorized", listener);

      const result = await apiService.updateUser({ name: "X" } as never);

      expect(result).toEqual({
        success: false,
        message: "Sessão expirada. Faça login novamente.",
        status: 401,
      });
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener("auth:unauthorized", listener);
    });
  });

  it("401 em rota pública (sem requiresAuth) não dispara o evento nem o texto de sessão - segue o fluxo normal de erro", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: "Not allowed here" }, { status: 401, statusText: "Unauthorized" }),
    );
    const listener = vi.fn();
    window.addEventListener("auth:unauthorized", listener);

    const result = await apiService.getAllProducts();

    expect(result.success).toBe(false);
    expect(result.message).toBe("Not allowed here");
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener("auth:unauthorized", listener);
  });

  describe("erros de data de nascimento pelo code (LDMF-303)", () => {
    it("repassa o code do corpo de erro e mostra message[0]", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(
          {
            message: ["Data de nascimento inválida, usuário menor de idade."],
            code: "UNDERAGE",
            statusCode: 400,
          },
          { status: 400 },
        ),
      );
      const result = await apiService.createUser({
        name: "Ana",
        email: "ana@example.com",
        phone: "41999990000",
        password: "Senha@1",
        birthDate: "16/10/2010",
        role: "client",
      } as never);

      expect(result.code).toBe("UNDERAGE");
      expect(getBirthDateApiError(result)).toBe(
        "Data de nascimento inválida, usuário menor de idade.",
      );
    });

    it("sem code no corpo, o resultado não traz code", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: ["x"] }, { status: 400 }));
      const result = await apiService.getAllProducts();
      expect(result.code).toBeUndefined();
    });

    it("getBirthDateApiError ignora outros codes e erro sem code", () => {
      expect(getBirthDateApiError({ code: "CPF_REQUIRED", message: "CPF obrigatório" })).toBeNull();
      expect(getBirthDateApiError({ message: "Erro qualquer" })).toBeNull();
    });

    it("getBirthDateApiError nunca devolve JSON cru: cai na mensagem local", () => {
      expect(
        getBirthDateApiError({ code: "INVALID_BIRTH_DATE", message: '{"field":"birthDate"}' }),
      ).toBe(BIRTH_DATE_MESSAGES.invalid);
      expect(getBirthDateApiError({ code: "UNDERAGE", message: "" })).toBe(
        BIRTH_DATE_MESSAGES.underage,
      );
      expect(getBirthDateApiError({ code: "UNDERAGE" })).toBe(BIRTH_DATE_MESSAGES.underage);
    });
  });

  describe("formato da data de nascimento enviada ao back (contrato LDMF-302)", () => {
    it("o perfil manda birthDate em DD/MM/YYYY", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.updateUser({ name: "Ana", birthDate: "15/05/1990" });
      const [, config] = vi.mocked(fetch).mock.calls[0];
      expect(JSON.parse(String(config?.body))).toMatchObject({ birthDate: "15/05/1990" });
    });

    it("o perfil converte AAAA-MM-DD para DD/MM/YYYY antes de enviar", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.updateUser({ name: "Ana", birthDate: "1990-05-15" });
      const [, config] = vi.mocked(fetch).mock.calls[0];
      expect(JSON.parse(String(config?.body))).toMatchObject({ birthDate: "15/05/1990" });
    });
  });

  describe("extração de mensagem de erro", () => {
    it("usa message string quando presente", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: "CPF inválido" }, { status: 400 }));
      const result = await apiService.getAllProducts();
      expect(result.message).toBe("CPF inválido");
    });

    it("usa o primeiro elemento quando message é array de strings", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ message: ["nome é obrigatório", "email é obrigatório"] }, { status: 400 }),
      );
      const result = await apiService.getAllProducts();
      expect(result.message).toBe("nome é obrigatório");
    });

    it("serializa em JSON quando o primeiro elemento do array não é string", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ message: [{ field: "cpf", issue: "invalid" }] }, { status: 400 }),
      );
      const result = await apiService.getAllProducts();
      expect(result.message).toBe(JSON.stringify({ field: "cpf", issue: "invalid" }));
    });

    it("cai para o campo 'error' (string) quando não há 'message' utilizável", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: "Conflito" }, { status: 409 }));
      const result = await apiService.getAllProducts();
      expect(result.message).toBe("Conflito");
    });

    it("cai para o campo 'error' (array) quando não há 'message' utilizável", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ error: ["primeiro erro", "segundo erro"] }, { status: 409 }),
      );
      const result = await apiService.getAllProducts();
      expect(result.message).toBe("primeiro erro");
    });

    it("serializa message quando ele é um objeto (não string, não array)", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ message: { code: "X1" } }, { status: 400 }),
      );
      const result = await apiService.getAllProducts();
      expect(result.message).toBe(JSON.stringify({ code: "X1" }));
    });

    it("ignora message string vazia/só espaço e cai no fallback genérico", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ message: "   " }, { status: 500, statusText: "Internal Server Error" }),
      );
      const result = await apiService.getAllProducts();
      expect(result.message).toBe("Erro 500: Internal Server Error");
    });

    it("sem corpo de erro (204/sem conteúdo) usa 'Erro {status}: {statusText}'", async () => {
      vi.mocked(fetch).mockResolvedValue(noContentResponse(500));
      const result = await apiService.getAllProducts();
      expect(result).toEqual({ success: false, message: "Erro 500: " });
    });
  });

  it("204 No Content bem-sucedido devolve success:true com data null", async () => {
    vi.mocked(fetch).mockResolvedValue(noContentResponse(204));
    const result = await apiService.getAllProducts();
    expect(result).toEqual({ success: true, data: null, status: 204 });
  });

  it("resposta sem content-type JSON (bem-sucedida) também vira data:null, sem tentar parsear", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      headers: { get: () => "text/plain" },
      json: () => Promise.reject(new Error("não deveria ser chamado")),
    } as unknown as Response);

    const result = await apiService.getAllProducts();
    expect(result).toEqual({ success: true, data: null, status: 200 });
  });

  it("JSON malformado (content-type diz JSON, mas o parse falha) devolve erro descritivo", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "",
      headers: { get: () => "application/json" },
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response);

    const result = await apiService.getAllProducts();
    expect(result).toEqual({
      success: false,
      message: "Erro ao processar resposta do servidor (Status 200)",
    });
  });

  it("falha de rede (fetch rejeita) devolve a mensagem genérica de conexão", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await apiService.getAllProducts();
    expect(result).toEqual({
      success: false,
      message: "Erro de conexão. Verifique sua internet.",
    });
  });

  it("AbortError não é convertido em {success:false} - é repropagado pro caller", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    vi.mocked(fetch).mockRejectedValue(abortError);

    await expect(
      apiService.orderItems.removeProductFromCart("cust-1", "order-1", "prod-1", 1),
    ).rejects.toBe(abortError);
  });

  describe("orderItems.addProductToCart - montagem do corpo da requisição", () => {
    async function captureBody(
      extras?: Parameters<typeof apiService.orderItems.addProductToCart>[4],
    ) {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "order-1" }));
      await apiService.orderItems.addProductToCart(
        "order-1",
        "product-1",
        "customer-1",
        2,
        extras,
      );
      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      return JSON.parse(config!.body as string);
    }

    it("sem extras, o corpo só tem orderId/productId/quantity", async () => {
      const body = await captureBody();
      expect(body).toEqual({ orderId: "order-1", productId: "product-1", quantity: 2 });
    });

    it("inclui addOns só quando a lista não é vazia", async () => {
      expect(await captureBody({ addOns: [] })).not.toHaveProperty("addOns");
      expect(
        await captureBody({ addOns: [{ productAddOnsId: "a1", quantity: 1 }] }),
      ).toHaveProperty("addOns", [{ productAddOnsId: "a1", quantity: 1 }]);
    });

    it("inclui variations só quando a lista não é vazia", async () => {
      expect(await captureBody({ variations: [] })).not.toHaveProperty("variations");
      expect(
        await captureBody({ variations: [{ productVariationId: "v1" }] }),
      ).toHaveProperty("variations", [{ productVariationId: "v1" }]);
    });
  });

  describe("createUser e updateUser - sanitização de CPF e defaults", () => {
    it("createUser omite cpf quando vazio e injeta versões padrão de termos e privacidade", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.createUser({
        name: "Test",
        email: "test@example.com",
        phone: "11999999999",
        password: "Pass",
        birthDate: "01/01/2000",
        cpf: "",
      });

      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      const body = JSON.parse(config!.body as string);
      expect(body).not.toHaveProperty("cpf");
      expect(body.termsVersion).toBe("2026-10-04");
      expect(body.privacyVersion).toBe("2026-10-05");
    });

    it("createUser envia cpf formatado só com dígitos quando preenchido", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.createUser({
        name: "Test",
        email: "test@example.com",
        phone: "11999999999",
        password: "Pass",
        birthDate: "01/01/2000",
        cpf: "123.456.789-00",
      });

      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      const body = JSON.parse(config!.body as string);
      expect(body.cpf).toBe("12345678900");
    });

    it("updateUser omite cpf quando vazio ou indefinido", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.updateUser({
        name: "Test",
        email: "test@example.com",
        phone: "11999999999",
        birthDate: "01/01/2000",
        role: "client",
        status: "active",
        cpf: "",
      });

      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      const body = JSON.parse(config!.body as string);
      expect(body).not.toHaveProperty("cpf");
    });

    it("updateUser omite id e email do payload mesmo que sejam passados", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.updateUser({
        id: "user-1",
        name: "Test",
        email: "test@example.com",
      } as never);

      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      const body = JSON.parse(config!.body as string);
      expect(body).not.toHaveProperty("id");
      expect(body).not.toHaveProperty("email");
    });

    it("updateUser sanitiza phone removendo caracteres não numéricos", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.updateUser({
        name: "Test",
        phone: "(11) 98765-4321",
      });

      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      const body = JSON.parse(config!.body as string);
      expect(body.phone).toBe("11987654321");
    });

    it("updateUser normaliza birthDate de YYYY-MM-DD para DD/MM/YYYY", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.updateUser({
        name: "Test",
        birthDate: "1990-05-15",
      });

      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      const body = JSON.parse(config!.body as string);
      expect(body.birthDate).toBe("15/05/1990");
    });

    it("updateUser omite birthDate quando vazio ou indefinido", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1" }));
      await apiService.updateUser({
        name: "Test",
        birthDate: "",
      });

      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      const body = JSON.parse(config!.body as string);
      expect(body).not.toHaveProperty("birthDate");
    });

    it("updateCpf envia PATCH /auth/cpf com apenas dígitos e autenticação", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "u1", cpf: "12345678900" }));
      const result = await apiService.updateCpf("123.456.789-00");

      expect(result.success).toBe(true);
      const [url, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      expect(url).toBe("/api/proxy/auth/cpf");
      expect(config?.method).toBe("PATCH");
      expect((config?.headers as Record<string, string>)["X-Auth-Required"]).toBe("1");
      const body = JSON.parse(config!.body as string);
      expect(body).toEqual({ cpf: "12345678900" });
    });

    it("updateCpf faz fallback para PUT /user caso PATCH /auth/cpf retorne 404", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, { status: 404 }))
        .mockResolvedValueOnce(jsonResponse({ id: "u1", cpf: "12345678900" }));

      const result = await apiService.updateCpf("123.456.789-00");

      expect(result.success).toBe(true);
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
      const [url1, config1] = vi.mocked(fetch).mock.calls[0];
      expect(url1).toBe("/api/proxy/auth/cpf");
      expect(config1?.method).toBe("PATCH");

      const [url2, config2] = vi.mocked(fetch).mock.calls[1];
      expect(url2).toBe("/api/proxy/user");
      expect(config2?.method).toBe("PUT");
      const body2 = JSON.parse(config2!.body as string);
      expect(body2.cpf).toBe("12345678900");
    });
  });

  describe("companies.create", () => {
    it("inclui actionRadius padrão de '10' e não envia campos vazios no FormData", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "c1" }));
      await apiService.companies.create({
        tradeName: "Empresa",
        legalName: "Empresa LTDA",
        description: "",
        cnpj: "12345678000190",
        email: "empresa@teste.com",
        phone: "11999999999",
      });

      const [, config] = vi.mocked(fetch).mock.calls.at(-1)!;
      const formData = config!.body as FormData;
      expect(formData.get("actionRadius")).toBe("10");
      expect(formData.get("tradeName")).toBe("Empresa");
      expect(formData.get("description")).toBeNull();
    });
  });

  describe("companies.removeStaff", () => {
    it("chama DELETE /company/staff/:userId com autenticação obrigatória", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ id: "user-123", removed: true }),
      );

      const result = await apiService.companies.removeStaff("user-123");

      expect(result).toEqual({
        success: true,
        data: { id: "user-123", removed: true },
        status: 200,
      });

      expect(fetch).toHaveBeenCalledWith(
        "/api/proxy/company/staff/user-123",
        expect.objectContaining({
          method: "DELETE",
          headers: expect.objectContaining({
            "X-Auth-Required": "1",
          }),
        }),
      );
    });

    it("passa query param ?companyId= quando informado", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ id: "user-123", removed: true }),
      );

      await apiService.companies.removeStaff("user-123", "comp-999");

      expect(fetch).toHaveBeenCalledWith(
        "/api/proxy/company/staff/user-123?companyId=comp-999",
        expect.objectContaining({
          method: "DELETE",
        }),
      );
    });
  });

  describe("companies.updateAcceptedPaymentMethods (LDMF-251)", () => {
    it("manda a lista como array em JSON no PATCH /company/:id, autenticado", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: "comp-1" }));

      await apiService.companies.updateAcceptedPaymentMethods("comp-1", [
        PaymentMethod.PIX,
        PaymentMethod.CASH,
      ]);

      const [url, config] = vi.mocked(fetch).mock.calls[0];
      expect(url).toBe("/api/proxy/company/comp-1");
      expect(config?.method).toBe("PATCH");
      expect(
        (config?.headers as Record<string, string>)["X-Auth-Required"],
      ).toBe("1");
      // Array de verdade, não "PIX,CASH" como texto.
      expect(JSON.parse(config?.body as string)).toEqual({
        acceptedPaymentMethods: ["PIX", "CASH"],
      });
    });
  });
});
