import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Baixa a foto de um prato pelo servidor, para a duplicação de prato
 * (LDMF-489) reenviar a mesma foto na cópia.
 *
 * O navegador não consegue baixar direto: R2 e S3 não devolvem
 * Access-Control-Allow-Origin (medido com curl) e o connect-src da CSP não
 * libera esses hosts. Pelo servidor a requisição é da mesma origem.
 *
 * Só aceita os hosts de imagem declarados em images.remotePatterns, em
 * https e sem seguir redirecionamento, para a rota não virar um proxy
 * aberto. Exige sessão: só quem está logado no painel usa a duplicação.
 */
const ALLOWED_HOST_S3 = "like-delivery.s3.us-east-2.amazonaws.com";
const ALLOWED_HOST_R2 = "pub-e75b88e293b14bb3978db5a6fe91a9bd.r2.dev";

/** Teto de tamanho da foto baixada (10 MB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function errorResponse(status: number, message: string) {
  return NextResponse.json(
    { message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    return errorResponse(401, "Sessão expirada");
  }

  const rawUrl = request.nextUrl.searchParams.get("url");
  let target: URL;
  try {
    target = new URL(rawUrl ?? "");
  } catch {
    return errorResponse(400, "Endereço da foto inválido");
  }

  let safeOrigin: string;
  if (target.hostname === ALLOWED_HOST_S3) {
    safeOrigin = `https://${ALLOWED_HOST_S3}`;
  } else if (target.hostname === ALLOWED_HOST_R2) {
    safeOrigin = `https://${ALLOWED_HOST_R2}`;
  } else {
    return errorResponse(400, "Endereço da foto não permitido");
  }

  if (target.protocol !== "https:") {
    return errorResponse(400, "Endereço da foto não permitido");
  }

  // Monta a URL de destino fixando explicitamente a origem a partir de literais
  // permitidos, prevenindo Server-Side Request Forgery (SSRF).
  const safeUrl = `${safeOrigin}${target.pathname}${target.search}`;

  let upstream: Response;
  try {
    upstream = await fetch(safeUrl, { cache: "no-store", redirect: "error" });
  } catch {
    return errorResponse(502, "Não foi possível baixar a foto");
  }

  if (!upstream.ok) {
    return errorResponse(502, `Erro ${upstream.status} ao baixar a foto`);
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return errorResponse(502, "O arquivo baixado não é uma imagem");
  }

  const declaredLength = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    return errorResponse(413, "Foto grande demais para copiar");
  }

  const body = await upstream.arrayBuffer();
  if (body.byteLength > MAX_IMAGE_BYTES) {
    return errorResponse(413, "Foto grande demais para copiar");
  }

  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
  });
}
