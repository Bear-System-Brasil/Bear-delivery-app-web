import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A sessão devolve dado do usuário. Sem Cache-Control explícito a Vercel
 * manda `public`, e a chave do cache do CDN ignora o cookie: toda saída tem
 * que ser no-store (LDMF-348).
 */

const getSessionToken = vi.fn();

vi.mock("@/lib/session", () => ({ getSessionToken }));

const { GET } = await import("./route");

const jwt = (payload: object) =>
  `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.x`;

const VALID = jwt({
  sub: "u1",
  role: "owner",
  companyId: "c1",
  exp: Math.floor(Date.now() / 1000) + 3600,
});
const EXPIRED = jwt({ sub: "u1", role: "owner", companyId: "c1", exp: 1 });

describe("GET /api/auth/session - Cache-Control", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    getSessionToken.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logado: devolve o usuário com no-store", async () => {
    getSessionToken.mockResolvedValue(VALID);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "u1", name: "Dono", password: "hash" }),
    } as Response);

    const res = await GET();
    const body = await res.json();

    expect(body.authenticated).toBe(true);
    expect(body.user.id).toBe("u1");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    ["sem cookie", null],
    ["token expirado", EXPIRED],
  ])("%s: no-store", async (_caso, token) => {
    getSessionToken.mockResolvedValue(token);

    const res = await GET();

    expect((await res.json()).authenticated).toBe(false);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("back recusou o token: no-store", async () => {
    getSessionToken.mockResolvedValue(VALID);
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);

    const res = await GET();

    expect((await res.json()).authenticated).toBe(false);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
