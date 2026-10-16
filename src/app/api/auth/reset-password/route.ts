import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";
import { decodeJwt } from "@/lib/jwt";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { noStore } from "@/lib/no-store";

export const dynamic = "force-dynamic";

/**
 * POST /auth/reset-password devolve um token novo - o usuário fica
 * autenticado automaticamente após trocar a senha, sem precisar chamar
 * /login de novo. Por isso passa pelo BFF (como login/register), não pelo
 * proxy genérico: só aqui o token vira cookie httpOnly de sessão.
 */
export async function POST(request: Request) {
  const body = await request.json();

  const upstream = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const result = await upstream.json().catch(() => null);
  const token: string | undefined = result?.data?.token;

  if (!upstream.ok || !token) {
    const msg = Array.isArray(result?.message)
      ? result.message[0]
      : typeof result?.message === "string"
        ? result.message
        : `Erro ${upstream.status}`;

    return noStore(NextResponse.json(
      { success: false, message: msg },
      { status: upstream.status || 500 },
    ));
  }

  const payload = decodeJwt(token);

  const response = NextResponse.json({
    success: true,
    data: {
      data: {
        user: {
          ...result.data.user,
          companyId: payload?.companyId ?? null,
        },
      },
    },
  });

  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return noStore(response);
}
