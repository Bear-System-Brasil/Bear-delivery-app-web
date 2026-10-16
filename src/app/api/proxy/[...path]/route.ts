import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Headers que não devem ser repassados ao NestJS. */
const STRIPPED = new Set([
  "host",
  "connection",
  "content-length",
  "cookie",
  "accept-encoding",
  "authorization",
  "x-auth-required",
]);

/**
 * Sinal explícito do client: só injeta o Bearer se a chamada pediu auth.
 * SEM isso, todo request de um usuário logado vira autenticado - inclusive
 * chamadas pensadas pra ficar anônimas (ex: GET /company, que o NestJS
 * responde diferente se vier com token: tenta resolver pelo endereço do
 * usuário em vez do lat/lng da query, e quebra pra quem não tem endereço
 * salvo).
 */
async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = `${API_BASE_URL}/${path.join("/")}${request.nextUrl.search}`;

  const wantsAuth = request.headers.get("x-auth-required") === "1";
  const token = wantsAuth
    ? request.cookies.get(SESSION_COOKIE)?.value
    : undefined;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) headers.set(key, value);
  });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const upstream = await fetch(url, {
    method: request.method,
    headers,
    // arrayBuffer preserva multipart/form-data com o boundary original
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);

  // GET sem token (wantsAuth=false, logo nada de Authorization foi enviado
  // upstream) não pode conter dado pessoal/específico de usuário - seguro
  // pro browser guardar por alguns segundos. Some caso o wantsAuth mude
  // de resposta pra resposta, corta o risco de vazar dado autenticado.
  //
  // `private`, não `public` (LDMF-348): com `public` o CDN da Vercel
  // guardava a resposta, e um PATCH não limpa esse cache. Com o
  // stale-while-revalidate, a tela ficava um salvamento atrás por até ~2 min
  // para todo mundo. O browser descarta a própria entrada depois de um
  // PATCH/POST na mesma URL, então só ele guardar não tem esse problema.
  if (request.method === "GET" && !wantsAuth && upstream.ok) {
    responseHeaders.set(
      "Cache-Control",
      "private, max-age=20, stale-while-revalidate=100",
    );
  } else {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
