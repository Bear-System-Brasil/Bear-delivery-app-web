import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api-config";
import { decodeJwt, isExpired } from "@/lib/jwt";
import { getSessionToken } from "@/lib/session";
import { noStore } from "@/lib/no-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getSessionToken();

  if (!token) {
    return noStore(NextResponse.json({ authenticated: false, user: null }));
  }

  const payload = decodeJwt(token);

  if (!payload || isExpired(payload)) {
    return noStore(NextResponse.json({ authenticated: false, user: null }));
  }

  const upstream = await fetch(`${API_BASE_URL}/user/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return noStore(NextResponse.json({ authenticated: false, user: null }));
  }

  const user = await upstream.json().catch(() => null);

  // /user/me devolve o hash bcrypt da senha no corpo - nunca repassar isso
  // pro client (esse endpoint alimenta o Zustand, que persiste em
  // localStorage).
  const { password: _password, ...safeUser } = user?.data ?? user ?? {};

  return noStore(NextResponse.json({
    authenticated: true,
    user: {
      ...safeUser,
      role: payload.role,
      companyId: payload.companyId ?? null,
    },
  }));
}
