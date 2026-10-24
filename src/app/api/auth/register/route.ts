import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";
import { decodeJwt } from "@/lib/jwt";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { noStore } from "@/lib/no-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json();

  const cleanCpf = body.cpf ? String(body.cpf).replace(/\D/g, "") : undefined;
  const userPayload: Record<string, unknown> = {
    name: body.name,
    email: body.email,
    phone: body.phone ? String(body.phone).replace(/\D/g, "") : "",
    password: body.password,
    // Não inventa data de nascimento (LDMF-422): a data é do dono e vem do
    // formulário. Sem ela, o back recusa com 400, que é o certo - melhor do
    // que gravar 01/01/2000 e mascarar a idade real.
    birthDate: body.birthDate,
    role: body.role || "client",
    termsVersion: body.termsVersion || "2026-10-04",
    privacyVersion: body.privacyVersion || "2026-10-05",
  };

  if (cleanCpf) {
    userPayload.cpf = cleanCpf;
  }

  const upstream = await fetch(`${API_BASE_URL}/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userPayload),
    cache: "no-store",
  });

  const result = await upstream.json().catch(() => null);

  if (!upstream.ok) {
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

  // Faz login para obter o JWT da nova conta e persistir o cookie de sessão
  const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: body.email,
      password: body.password,
    }),
    cache: "no-store",
  });

  const loginResult = await loginRes.json().catch(() => null);
  const token: string | undefined = loginResult?.data?.token;

  if (!loginRes.ok || !token) {
    return noStore(NextResponse.json({
      success: true,
      data: {
        data: {
          user: result,
        },
      },
    }));
  }

  const payload = decodeJwt(token);

  const response = NextResponse.json({
    success: true,
    data: {
      data: {
        user: {
          ...loginResult.data.user,
          companyId: payload?.companyId ?? null,
        },
      },
    },
  });

  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return noStore(response);
}
