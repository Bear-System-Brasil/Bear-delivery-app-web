import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { SESSION_COOKIE } from "@/lib/session";

const R2_URL =
  "https://pub-e75b88e293b14bb3978db5a6fe91a9bd.r2.dev/like-delivery/product/foto.png";

function downloadRequest(url: string | null, { cookie = true } = {}) {
  const search = url === null ? "" : `?url=${encodeURIComponent(url)}`;
  const headers = new Headers();
  if (cookie) headers.set("cookie", `${SESSION_COOKIE}=token-do-usuario`);
  return new NextRequest(
    `http://localhost:3000/api/product-image/download${search}`,
    { headers },
  );
}

const imageResponse = (
  body = "bytes-da-foto",
  headers: Record<string, string> = { "content-type": "image/png" },
  status = 200,
) => new Response(body, { status, headers });

describe("download da foto do prato (LDMF-489)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("devolve a foto de host permitido com o mesmo content-type", async () => {
    vi.mocked(fetch).mockResolvedValue(imageResponse());

    const res = await GET(downloadRequest(R2_URL));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("bytes-da-foto");
    // Redirecionamento não é seguido: não deixa sair dos hosts permitidos.
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      redirect: "error",
    });
  });

  it("sem sessão responde 401 e não baixa nada", async () => {
    const res = await GET(downloadRequest(R2_URL, { cookie: false }));

    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["sem url", null],
    ["url inválida", "nao-e-url"],
    ["host fora da lista", "https://exemplo.com/foto.png"],
    [
      "http em vez de https",
      "http://pub-e75b88e293b14bb3978db5a6fe91a9bd.r2.dev/foto.png",
    ],
  ])("recusa %s com 400", async (_caso, url) => {
    const res = await GET(downloadRequest(url));

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("erro do armazenamento vira 502", async () => {
    vi.mocked(fetch).mockResolvedValue(imageResponse("", {}, 404));

    const res = await GET(downloadRequest(R2_URL));

    expect(res.status).toBe(502);
  });

  it("recusa arquivo que não é imagem", async () => {
    vi.mocked(fetch).mockResolvedValue(
      imageResponse("<html>", { "content-type": "text/html" }),
    );

    const res = await GET(downloadRequest(R2_URL));

    expect(res.status).toBe(502);
  });

  it("recusa foto acima de 10 MB pelo content-length", async () => {
    vi.mocked(fetch).mockResolvedValue(
      imageResponse("x", {
        "content-type": "image/jpeg",
        "content-length": String(11 * 1024 * 1024),
      }),
    );

    const res = await GET(downloadRequest(R2_URL));

    expect(res.status).toBe(413);
  });

  it("falha de rede vira 502", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));

    const res = await GET(downloadRequest(R2_URL));

    expect(res.status).toBe(502);
  });
});
