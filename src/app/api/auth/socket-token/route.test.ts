import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Esta rota devolve o JWT cru. Se um cache guardasse a resposta, o token de
 * um usuário poderia ser servido para outro: toda saída é no-store
 * (LDMF-348).
 */

const getSessionToken = vi.fn();

vi.mock("@/lib/session", () => ({ getSessionToken }));

const { GET } = await import("./route");

const jwt = (payload: object) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.x`;

describe("GET /api/auth/socket-token - Cache-Control", () => {
  beforeEach(() => {
    getSessionToken.mockReset();
  });

  it("logado: devolve o token com no-store", async () => {
    const token = jwt({
      sub: "u1",
      role: "owner",
      companyId: "c1",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    getSessionToken.mockResolvedValue(token);

    const res = await GET();

    expect(await res.json()).toEqual({ token });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("sem sessão: 401 com no-store", async () => {
    getSessionToken.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
