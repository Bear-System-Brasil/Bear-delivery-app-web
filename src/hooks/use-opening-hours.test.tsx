import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  notifyManager,
  onlineManager,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { act, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * LDMF-374: o status Aberto/Fechado ficava parado no cache com a aba aberta,
 * porque a configuração global não busca de novo no foco nem no mount. A
 * correção vale só para a consulta do status - estes testes travam o ciclo
 * dela e que o resto do app continua com a configuração de antes.
 */

const getByCompany = vi.fn();

vi.mock("@/services/api", () => ({
  apiService: { openingHours: { getByCompany } },
}));

const { useRestaurantOpeningHours, fetchFreshRestaurantOpeningHours } =
  await import("./use-opening-hours");
const { Providers } = await import("@/providers");

const OPEN = { isOpen: true, linkedToCashRegister: false, days: [] };
const CLOSED = { ...OPEN, isOpen: false };

/** Mesmos defaults de src/providers - o hook precisa funcionar debaixo deles. */
const makeClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: "always",
        retry: false,
      },
    },
  });

let queryClient: QueryClient;

const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  window.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  // Notifica o hook na hora: o agendador padrão usa setTimeout, que com o
  // relógio falso deixa o render atrasado em relação ao cache.
  notifyManager.setScheduler((cb) => cb());
  queryClient = makeClient();
  getByCompany.mockReset();
  getByCompany.mockResolvedValue({ success: true, data: OPEN });
  setVisibility("visible");
});

afterEach(() => {
  queryClient.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  notifyManager.setScheduler((cb) => setTimeout(cb, 0));
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Avança o relógio e deixa a resposta chegar até o hook. */
async function advance(ms: number) {
  await act(() => vi.advanceTimersByTimeAsync(ms));
  await act(() => vi.advanceTimersByTimeAsync(0));
}

async function renderStatus() {
  const view = renderHook(() => useRestaurantOpeningHours("comp-1"), {
    wrapper: Wrapper,
  });
  await act(() => vi.advanceTimersByTimeAsync(0));
  expect(getByCompany).toHaveBeenCalledTimes(1);
  return view;
}

describe("useRestaurantOpeningHours - status atualiza com a aba aberta", () => {
  it("busca de novo a cada 1 minuto com a tela visível e mostra o novo status", async () => {
    const { result } = await renderStatus();
    expect(result.current.data?.isOpen).toBe(true);

    getByCompany.mockResolvedValue({ success: true, data: CLOSED });

    await act(() => vi.advanceTimersByTimeAsync(59_000));
    expect(getByCompany).toHaveBeenCalledTimes(1);

    await advance(1_000);
    expect(getByCompany).toHaveBeenCalledTimes(2);
    expect(result.current.data?.isOpen).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(getByCompany).toHaveBeenCalledTimes(3);
  });

  it("não busca com a aba oculta", async () => {
    await renderStatus();

    act(() => setVisibility("hidden"));
    await act(() => vi.advanceTimersByTimeAsync(5 * 60_000));

    expect(getByCompany).toHaveBeenCalledTimes(1);
  });

  it("busca de novo ao voltar para a aba", async () => {
    const { result } = await renderStatus();

    act(() => setVisibility("hidden"));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    getByCompany.mockResolvedValue({ success: true, data: CLOSED });

    act(() => setVisibility("visible"));
    await advance(0);

    expect(getByCompany).toHaveBeenCalledTimes(2);
    expect(result.current.data?.isOpen).toBe(false);
  });

  it("busca de novo quando a internet volta", async () => {
    await renderStatus();

    act(() => onlineManager.setOnline(false));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    act(() => onlineManager.setOnline(true));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(getByCompany).toHaveBeenCalledTimes(2);
  });

  it("se a busca falhar, mantém o último status em vez de inventar um", async () => {
    const { result } = await renderStatus();

    getByCompany.mockResolvedValue({ success: false, message: "erro" });
    await advance(60_000);

    expect(getByCompany).toHaveBeenCalledTimes(2);
    const state = queryClient.getQueryState(["opening-hours", "public", "comp-1"]);
    expect(state?.status).toBe("error");
    expect(state?.data).toEqual(OPEN);
    expect(result.current.data?.isOpen).toBe(true);
  });
});

describe("fetchFreshRestaurantOpeningHours - consulta na hora do checkout", () => {
  it("ignora o cache ainda fresco e grava o resultado na mesma chave", async () => {
    queryClient.setQueryData(["opening-hours", "public", "comp-1"], OPEN);
    getByCompany.mockResolvedValue({ success: true, data: CLOSED });

    const data = await fetchFreshRestaurantOpeningHours(queryClient, "comp-1");

    expect(getByCompany).toHaveBeenCalledWith("comp-1");
    expect(data).toEqual(CLOSED);
    expect(
      queryClient.getQueryData(["opening-hours", "public", "comp-1"]),
    ).toEqual(CLOSED);
  });

  it("rejeita quando a rota falha, sem tocar no status guardado", async () => {
    queryClient.setQueryData(["opening-hours", "public", "comp-1"], OPEN);
    getByCompany.mockResolvedValue({ success: false, message: "fora do ar" });

    await expect(
      fetchFreshRestaurantOpeningHours(queryClient, "comp-1"),
    ).rejects.toThrow("fora do ar");
    expect(
      queryClient.getQueryData(["opening-hours", "public", "comp-1"]),
    ).toEqual(OPEN);
  });
});

describe("configuração global do cache continua a mesma", () => {
  it("o resto do app não busca de novo no foco nem no intervalo", async () => {
    const otherFetch = vi.fn().mockResolvedValue("x");
    let client: QueryClient | undefined;

    function OtherQuery() {
      client = useQueryClient();
      useQuery({ queryKey: ["outra-consulta"], queryFn: otherFetch });
      return null;
    }

    // O Toaster do Providers lê o tema do sistema; o jsdom não tem matchMedia.
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    );

    render(
      <Providers>
        <OtherQuery />
      </Providers>,
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(otherFetch).toHaveBeenCalledTimes(1);

    expect(client?.getDefaultOptions().queries).toMatchObject({
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: "always",
    });
    expect(client?.getDefaultOptions().queries?.refetchInterval).toBeUndefined();

    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    await act(() => vi.advanceTimersByTimeAsync(10 * 60_000));

    expect(otherFetch).toHaveBeenCalledTimes(1);
  });
});
