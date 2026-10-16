import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "./route";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * Cache-Control do proxy (LDMF-348).
 *
 * - GET sem auth: `private`. Com `public` o CDN da Vercel guardava a
 *   resposta e a tela ficava um salvamento atrás depois de editar.
 * - GET com auth e qualquer outro caso: `no-store`. A chave do cache do CDN
 *   ignora o cookie e o X-Auth-Required: uma resposta autenticada guardada
 *   poderia ser servida para outra pessoa.
 */

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });

function proxyRequest(
  method: string,
  { auth = false, cookie = true }: { auth?: boolean; cookie?: boolean } = {},
) {
  const headers = new Headers({ "content-type": "application/json" });
  if (auth) headers.set("x-auth-required", "1");
  if (cookie) headers.set("cookie", `${SESSION_COOKIE}=token-do-usuario`);
  return new NextRequest("http://localhost:3000/api/proxy/company/c1", {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify({ a: 1 }),
  });
}

const upstream = (status = 200) =>
  new Response(JSON.stringify({ id: "c1" }), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("proxy - Cache-Control", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("GET sem auth: private (só o navegador guarda) e sem token no upstream", async () => {
    vi.mocked(fetch).mockResolvedValue(upstream());

    const res = await GET(proxyRequest("GET"), params(["company", "c1"]));

    const cacheControl = res.headers.get("Cache-Control") ?? "";
    expect(cacheControl).toBe("private, max-age=20, stale-while-revalidate=100");
    expect(cacheControl).not.toContain("public");
    // É isso que torna o cache seguro: o cookie do usuário não vira token.
    const sentHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers;
    expect(sentHeaders.get("authorization")).toBeNull();
    expect(sentHeaders.get("cookie")).toBeNull();
  });

  it("GET com auth: no-store e token no upstream", async () => {
    vi.mocked(fetch).mockResolvedValue(upstream());

    const res = await GET(
      proxyRequest("GET", { auth: true }),
      params(["company", "staff"]),
    );

    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const sentHeaders = vi.mocked(fetch).mock.calls[0][1]?.headers as Headers;
    expect(sentHeaders.get("authorization")).toBe("Bearer token-do-usuario");
  });

  it("GET com auth sem sessão: no-store", async () => {
    vi.mocked(fetch).mockResolvedValue(upstream(401));

    const res = await GET(
      proxyRequest("GET", { auth: true, cookie: false }),
      params(["company", "staff"]),
    );

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET sem auth com erro do back: no-store", async () => {
    vi.mocked(fetch).mockResolvedValue(upstream(404));

    const res = await GET(proxyRequest("GET"), params(["company", "x"]));

    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("PATCH: no-store", async () => {
    vi.mocked(fetch).mockResolvedValue(upstream());

    const res = await PATCH(
      proxyRequest("PATCH", { auth: true }),
      params(["company", "c1"]),
    );

    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
