import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useUserAddresses } from "./use-addresses";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      address: { getUserAddresses: vi.fn() },
    },
  };
});

const api = vi.mocked(apiService, true);
const initialAuthState = useAuthStore.getState();

function loginAs(role: string) {
  useAuthStore.setState(
    {
      ...initialAuthState,
      isAuthenticated: true,
      _hasHydrated: true,
      user: { id: `user-${role}`, name: "Teste", email: "t@t.com", role },
    } as never,
    true,
  );
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useUserAddresses", () => {
  beforeEach(() => {
    api.address.getUserAddresses.mockResolvedValue({
      success: true,
      data: [],
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState(initialAuthState, true);
  });

  it("busca GET /address/me para cliente", async () => {
    loginAs("client");

    renderHook(() => useUserAddresses(), { wrapper });

    await waitFor(() =>
      expect(api.address.getUserAddresses).toHaveBeenCalledTimes(1),
    );
  });

  // O back devolve o endereço da loja (cozinheiro, gerente) ou 403
  // (financeiro) - nunca um endereço pessoal. Entregador não faz pedido.
  it.each(["cook", "manager", "financial", "delivery", "owner"])(
    "não busca para %s",
    async (role) => {
      loginAs(role);

      const { result } = renderHook(() => useUserAddresses(), { wrapper });

      // Query desabilitada fica parada, sem carregar e sem dado.
      await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeUndefined();
      expect(api.address.getUserAddresses).not.toHaveBeenCalled();
    },
  );
});
