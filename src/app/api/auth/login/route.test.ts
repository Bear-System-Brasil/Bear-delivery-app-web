import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

/**
 * A resposta traz dado do usuário e define o cookie de sessão: sai sempre
 * no-store, no sucesso e no erro (LDMF-348).
 */

const jwt = (payload: object) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.x`;

const request = () =>
  new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "a@b.com", password: "Senha1!" }),
  });

describe("POST /api/auth/login - Cache-Control", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sucesso: no-store", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: {
            token: jwt({ sub: "u1", role: "client", companyId: null }),
            user: { id: "u1", name: "Cliente" },
          },
        }),
    } as Response);

    const res = await POST(request());

    expect((await res.json()).success).toBe(true);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("erro do back: no-store", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: "Credenciais inválidas" }),
    } as Response);

    const res = await POST(request());

    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
