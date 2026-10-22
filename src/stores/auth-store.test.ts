import { afterEach, describe, expect, it } from "vitest";
import {
  normalizeAuthUser,
  useAuthStore,
  userHasCpf,
  type User,
} from "./auth-store";

afterEach(() => {
  useAuthStore.setState(
    { user: null, isAuthenticated: false, isLoading: false, _hasHydrated: false },
    false,
  );
});

describe("normalizeAuthUser", () => {
  it("usa os campos de pessoa física para role de cliente", () => {
    const user = normalizeAuthUser({
      id: "u1",
      email: "cliente@example.com",
      role: "client",
      name: "Maria",
      cpf: "12345678900",
      phone: "11999999999",
      birthDate: "1990-01-01",
      photoUrl: "foto.png",
    });

    expect(user).toEqual({
      id: "u1",
      name: "Maria",
      email: "cliente@example.com",
      cpf: "12345678900",
      phone: "11999999999",
      birthDate: "1990-01-01",
      role: "client",
      companyId: undefined,
      photoUrl: "foto.png",
    });
  });

  it("trata role ausente como cliente por padrão", () => {
    const user = normalizeAuthUser({ id: "u1", email: "sem-role@example.com" });
    expect(user.role).toBe("client");
  });

  it("usa os campos de empresa para roles de staff (owner, admin, manager, financial, cook, delivery)", () => {
    const user = normalizeAuthUser({
      id: "c1",
      email: "empresa@example.com",
      role: "owner",
      tradeName: "Restaurante do Zé",
      legalName: "Zé Comércio Ltda",
      cnpj: "12345678000199",
      companyId: "comp-1",
      logo_url: "logo.png",
    });

    expect(user.name).toBe("Restaurante do Zé");
    expect(user.cpf).toBe("12345678000199"); // cnpj cai no campo cpf normalizado
    expect(user.companyId).toBe("comp-1");
    expect(user.photoUrl).toBe("logo.png"); // fallback pra logo_url quando não há photoUrl
  });

  it("usa os campos de empresa para a role financial", () => {
    const user = normalizeAuthUser({
      id: "f1",
      email: "financeiro@example.com",
      role: "financial",
      tradeName: "Restaurante do Zé",
      cnpj: "12345678000199",
      companyId: "comp-1",
      logo_url: "logo.png",
    });

    expect(user.name).toBe("Restaurante do Zé");
    expect(user.cpf).toBe("12345678000199");
    expect(user.companyId).toBe("comp-1");
    expect(user.tradeName).toBe("Restaurante do Zé");
    expect(user.logo_url).toBe("logo.png");
  });

  it("segue a cadeia de fallback do nome da empresa: tradeName > legalName > name > 'Empresa'", () => {
    expect(normalizeAuthUser({ id: "c1", email: "e@e.com", role: "admin" }).name).toBe(
      "Empresa",
    );
    expect(
      normalizeAuthUser({
        id: "c1",
        email: "e@e.com",
        role: "admin",
        name: "Nome genérico",
      }).name,
    ).toBe("Nome genérico");
    expect(
      normalizeAuthUser({
        id: "c1",
        email: "e@e.com",
        role: "admin",
        name: "Nome genérico",
        legalName: "Razão Social",
      }).name,
    ).toBe("Razão Social");
    expect(
      normalizeAuthUser({
        id: "c1",
        email: "e@e.com",
        role: "admin",
        name: "Nome genérico",
        legalName: "Razão Social",
        tradeName: "Nome Fantasia",
      }).name,
    ).toBe("Nome Fantasia");
  });

  it("prioriza photoUrl sobre logo_url quando os dois vêm preenchidos", () => {
    const user = normalizeAuthUser({
      id: "c1",
      email: "e@e.com",
      role: "manager",
      photoUrl: "foto.png",
      logo_url: "logo.png",
    });
    expect(user.photoUrl).toBe("foto.png");
  });
});

describe("indicador de CPF (LDMF-362)", () => {
  it("normalizeAuthUser guarda o hasCpf que vem do back", () => {
    expect(
      normalizeAuthUser({ id: "u1", email: "a@a.com", hasCpf: true }).hasCpf,
    ).toBe(true);
    expect(
      normalizeAuthUser({ id: "u1", email: "a@a.com", hasCpf: false }).hasCpf,
    ).toBe(false);
  });

  it("normalizeAuthUser deixa o hasCpf vazio quando o back não manda", () => {
    expect(
      normalizeAuthUser({ id: "u1", email: "a@a.com" }).hasCpf,
    ).toBeUndefined();
  });

  it("userHasCpf segue o indicador quando ele existe", () => {
    expect(userHasCpf({ cpf: "", hasCpf: true })).toBe(true);
    expect(userHasCpf({ cpf: "12345678900", hasCpf: false })).toBe(false);
  });

  it("userHasCpf sem indicador considera sem CPF, salvo número de sessão antiga", () => {
    expect(userHasCpf({ cpf: "" })).toBe(false);
    expect(userHasCpf({ cpf: "123" })).toBe(false);
    expect(userHasCpf({ cpf: "123.456.789-00" })).toBe(true);
    expect(userHasCpf(null)).toBe(false);
  });
});

describe("useAuthStore", () => {
  const user: User = {
    id: "u1",
    name: "Maria",
    email: "maria@example.com",
    cpf: "12345678900",
    phone: "11999999999",
    birthDate: "1990-01-01",
    role: "client",
  };

  it("login autentica o usuário e limpa o loading", () => {
    useAuthStore.getState().setLoading(true);
    useAuthStore.getState().login(user);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(user);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("logout limpa o usuário e o estado de autenticação", () => {
    useAuthStore.getState().login(user);
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("updateUser mescla os campos parciais no usuário existente", () => {
    useAuthStore.getState().login(user);
    useAuthStore.getState().updateUser({ name: "Maria Atualizada" });

    expect(useAuthStore.getState().user).toEqual({ ...user, name: "Maria Atualizada" });
  });

  it("updateUser não faz nada quando não há usuário logado", () => {
    useAuthStore.getState().updateUser({ name: "Ninguém" });
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("setHasHydrated marca a store como hidratada", () => {
    useAuthStore.getState().setHasHydrated(true);
    expect(useAuthStore.getState()._hasHydrated).toBe(true);
  });
});
