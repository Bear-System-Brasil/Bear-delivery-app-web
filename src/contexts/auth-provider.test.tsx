import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth-store";
import { AuthProvider, useAuth } from "./auth-provider";

const getSession = vi.fn();
const logoutApi = vi.fn();

vi.mock("@/services/api", () => ({
  apiService: {
    getSession: (...args: unknown[]) => getSession(...args),
    logout: (...args: unknown[]) => logoutApi(...args),
  },
}));

vi.mock("@/components/auth-modal", () => ({ default: () => null }));

const LOGIN_USER = {
  id: "user-1",
  email: "cliente@example.com",
  role: "client",
  name: "Cliente",
};

let auth: ReturnType<typeof useAuth> | null = null;

function Capture() {
  auth = useAuth();
  return null;
}

const renderProvider = () =>
  render(
    <AuthProvider>
      <Capture />
    </AuthProvider>,
  );

beforeEach(() => {
  getSession.mockReset();
  logoutApi.mockReset();
  auth = null;
});

afterEach(() => {
  useAuthStore.setState(
    { user: null, isAuthenticated: false, isLoading: false },
    false,
  );
});

describe("AuthProvider - indicador de CPF (LDMF-362)", () => {
  it("login sem hasCpf busca o /user/me e marca a conta com CPF", async () => {
    getSession
      .mockResolvedValueOnce({ authenticated: false, user: null })
      .mockResolvedValueOnce({
        authenticated: true,
        user: { ...LOGIN_USER, hasCpf: true },
      });

    renderProvider();
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));

    act(() => auth!.login(LOGIN_USER));

    await waitFor(() =>
      expect(useAuthStore.getState().user?.hasCpf).toBe(true),
    );
    expect(getSession).toHaveBeenCalledTimes(2);
    expect(useAuthStore.getState().user?.cpf).toBe("");
  });

  it("login que já traz hasCpf não busca o /user/me de novo", async () => {
    getSession.mockResolvedValue({ authenticated: false, user: null });

    renderProvider();
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));

    act(() => auth!.login({ ...LOGIN_USER, hasCpf: false }));

    expect(useAuthStore.getState().user?.hasCpf).toBe(false);
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("sessão persistida recebe o hasCpf do /user/me sem trocar o resto do usuário", async () => {
    useAuthStore.setState({
      user: {
        id: "user-1",
        name: "Nome salvo no login",
        email: "cliente@example.com",
        cpf: "",
        phone: "",
        birthDate: "",
        role: "client",
      },
      isAuthenticated: true,
    });
    getSession.mockResolvedValue({
      authenticated: true,
      user: { ...LOGIN_USER, name: "Nome do me", hasCpf: true },
    });

    renderProvider();

    await waitFor(() =>
      expect(useAuthStore.getState().user?.hasCpf).toBe(true),
    );
    expect(useAuthStore.getState().user?.name).toBe("Nome salvo no login");
  });

  it("não marca CPF se o /user/me for de outra conta", async () => {
    getSession
      .mockResolvedValueOnce({ authenticated: false, user: null })
      .mockResolvedValueOnce({
        authenticated: true,
        user: { ...LOGIN_USER, id: "outra-conta", hasCpf: true },
      });

    renderProvider();
    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(1));

    act(() => auth!.login(LOGIN_USER));

    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(2));
    expect(useAuthStore.getState().user?.hasCpf).toBeUndefined();
  });
});
