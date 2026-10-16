import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { API_BASE_URL } from "@/lib/api-config";
import { SESSION_COOKIE } from "@/lib/session";

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const dummyToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEiLCJyb2xlIjoiY2xpZW50IiwiY29tcGFueUlkIjpudWxsLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMzYwMH0.signature";

  it("chama /user sem a propriedade cpf quando cpf for vazio ou omitido", async () => {
    // 1. upstream /user 201
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "u1",
          name: "Restaurante Teste",
          email: "rest@teste.com",
        }),
    } as Response);

    // 2. upstream /auth/login 200
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            token: dummyToken,
            user: {
              id: "u1",
              name: "Restaurante Teste",
              email: "rest@teste.com",
            },
          },
        }),
    } as Response);

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Restaurante Teste",
        email: "rest@teste.com",
        phone: "(11) 99999-9999",
        password: "Password1!",
        cpf: "",
      }),
    });

    const res = await POST(request);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // Verifica chamada para /user
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/user`,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"email":"rest@teste.com"'),
      }),
    );

    const userBody = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]?.body as string,
    );
    expect(userBody).not.toHaveProperty("cpf");
    expect(userBody.phone).toBe("11999999999");
    expect(userBody.termsVersion).toBe("2026-10-04");
    expect(userBody.privacyVersion).toBe("2026-10-05");
    expect(userBody.role).toBe("client");

    // Verifica chamada para /auth/login
    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/login`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "rest@teste.com",
          password: "Password1!",
        }),
      }),
    );

    // Cookie de sessão deve estar presente
    const setCookie = res.cookies.get(SESSION_COOKIE);
    expect(setCookie?.value).toBe(dummyToken);
  });

  it("envia cpf sanitizado quando informado", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "u2",
          name: "Cliente",
          email: "cli@teste.com",
        }),
    } as Response);

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            token: dummyToken,
            user: {
              id: "u2",
              name: "Cliente",
              email: "cli@teste.com",
            },
          },
        }),
    } as Response);

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cliente",
        email: "cli@teste.com",
        phone: "11988887777",
        password: "Password1!",
        cpf: "123.456.789-00",
      }),
    });

    const res = await POST(request);
    expect(res.status).toBe(200);

    const userBody = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]?.body as string,
    );
    expect(userBody.cpf).toBe("12345678900");
  });

  it("retorna erro e status do backend quando /user falha", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({
          message: ["O usuário já possui cadastro no sistema."],
        }),
    } as Response);

    const request = new Request("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Restaurante",
        email: "existente@teste.com",
        phone: "11999999999",
        password: "Password1!",
      }),
    });

    const res = await POST(request);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.success).toBe(false);
    expect(data.message).toBe("O usuário já possui cadastro no sistema.");
  });

  // A resposta traz dado do usuário e define o cookie de sessão: sai sempre
  // no-store (LDMF-348).
  describe("Cache-Control", () => {
    const registerRequest = () =>
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Cliente",
          email: "cliente@teste.com",
          phone: "11999999999",
          password: "Password1!",
        }),
      });

    const userCreated = {
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: "u1", name: "Cliente" }),
    } as Response;

    it("cadastro e login automático ok: no-store", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(userCreated);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: { token: dummyToken, user: { id: "u1", name: "Cliente" } },
          }),
      } as Response);

      const res = await POST(registerRequest());

      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("cadastro ok mas login automático falhou: no-store", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(userCreated);
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve(null),
      } as Response);

      const res = await POST(registerRequest());

      expect((await res.json()).success).toBe(true);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("cadastro recusado: no-store", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ message: "Já cadastrado" }),
      } as Response);

      const res = await POST(registerRequest());

      expect(res.status).toBe(409);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });
  });
});
