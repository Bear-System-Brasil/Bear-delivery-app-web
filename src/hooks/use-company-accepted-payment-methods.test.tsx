import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateAcceptedPaymentMethods = vi.fn();
const getRestaurant = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/services/api", () => ({
  apiService: { companies: { updateAcceptedPaymentMethods } },
  PaymentMethod: {
    CASH: "CASH",
    CREDIT_CARD: "CREDIT_CARD",
    DEBIT_CARD: "DEBIT_CARD",
    PIX: "PIX",
    BANK_TRANSFER: "BANK_TRANSFER",
  },
}));

vi.mock("@/services/restaurant", () => ({ getRestaurant }));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const { useCompanyAcceptedPaymentMethods } = await import(
  "./use-company-accepted-payment-methods"
);

const QUERY_KEY = ["restaurant", "comp-1"];

function renderPaymentMethods() {
  // Cliente novo por teste, mas estável entre renders do mesmo teste.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    () => useCompanyAcceptedPaymentMethods("comp-1"),
    { wrapper: Wrapper },
  );
  return { ...rendered, queryClient };
}

type Rendered = ReturnType<typeof renderPaymentMethods>;

/**
 * Refaz a busca e espera o dado novo chegar ao hook. Só aguardar o
 * `refetch()` não basta: o TanStack entrega a notificação aos observers num
 * tick seguinte, e a asserção rodaria antes do re-render com o dado novo -
 * o teste passaria sem testar nada (um mutante que sobrescreve a edição
 * passou assim).
 */
async function refetchAndSettle({ result, queryClient }: Rendered) {
  const updates = queryClient.getQueryState(QUERY_KEY)?.dataUpdateCount ?? 0;
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() =>
    expect(queryClient.getQueryState(QUERY_KEY)?.dataUpdateCount).toBe(
      updates + 1,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe("useCompanyAcceptedPaymentMethods (LDMF-251)", () => {
  beforeEach(() => {
    updateAcceptedPaymentMethods.mockReset();
    updateAcceptedPaymentMethods.mockResolvedValue({ success: true, data: {} });
    getRestaurant.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("mostra as formas gravadas", async () => {
    getRestaurant.mockResolvedValue({
      id: "comp-1",
      acceptedPaymentMethods: ["PIX", "CASH"],
    });
    const { result } = renderPaymentMethods();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selected).toEqual(["CASH", "PIX"]);
    expect(result.current.hasChanges).toBe(false);
  });

  it("sem o campo, começa com todas marcadas", async () => {
    getRestaurant.mockResolvedValue({ id: "comp-1" });
    const { result } = renderPaymentMethods();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.selected).toEqual([
      "CASH",
      "CREDIT_CARD",
      "DEBIT_CARD",
      "PIX",
    ]);
  });

  it("salva a lista completa, não só a forma alterada", async () => {
    // "Banco" com estado: o refetch depois do PATCH lê o que foi gravado.
    let stored = ["CASH", "PIX"];
    getRestaurant.mockImplementation(async () => ({
      id: "comp-1",
      acceptedPaymentMethods: stored,
    }));
    updateAcceptedPaymentMethods.mockImplementation(
      async (_id: string, methods: string[]) => {
        stored = methods;
        return { success: true, data: {} };
      },
    );
    const { result } = renderPaymentMethods();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleMethod("DEBIT_CARD"));
    expect(result.current.hasChanges).toBe(true);

    await act(async () => {
      await result.current.handleSave();
    });

    expect(updateAcceptedPaymentMethods).toHaveBeenCalledWith("comp-1", [
      "CASH",
      "DEBIT_CARD",
      "PIX",
    ]);
    expect(toastSuccess).toHaveBeenCalled();
    await waitFor(() => expect(getRestaurant).toHaveBeenCalledTimes(2));
    expect(result.current.selected).toEqual(["CASH", "DEBIT_CARD", "PIX"]);
    expect(result.current.hasChanges).toBe(false);
  });

  it("não manda lista vazia", async () => {
    getRestaurant.mockResolvedValue({
      id: "comp-1",
      acceptedPaymentMethods: ["PIX"],
    });
    const { result } = renderPaymentMethods();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleMethod("PIX"));
    expect(result.current.selected).toEqual([]);

    await act(async () => {
      await result.current.handleSave();
    });

    expect(updateAcceptedPaymentMethods).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "Escolha pelo menos uma forma de pagamento.",
    );
  });

  it("traduz o erro do backend e mantém a alteração na tela", async () => {
    getRestaurant.mockResolvedValue({
      id: "comp-1",
      acceptedPaymentMethods: ["CASH"],
    });
    updateAcceptedPaymentMethods.mockResolvedValue({
      success: false,
      message: "PAYMENT_METHODS_INVALID",
    });
    const { result } = renderPaymentMethods();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleMethod("PIX"));
    await act(async () => {
      await result.current.handleSave();
    });

    expect(toastError).toHaveBeenCalledWith(
      "Forma de pagamento inválida ou repetida.",
    );
    expect(result.current.selected).toEqual(["CASH", "PIX"]);
    expect(result.current.hasChanges).toBe(true);
  });

  it("descartar volta para o que está gravado", async () => {
    getRestaurant.mockResolvedValue({
      id: "comp-1",
      acceptedPaymentMethods: ["CASH"],
    });
    const { result } = renderPaymentMethods();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleMethod("PIX"));
    act(() => result.current.discardChanges());

    expect(result.current.selected).toEqual(["CASH"]);
    expect(result.current.hasChanges).toBe(false);
  });

  // Bug relatado no preview (celular): a caixa desmarcada voltaria a ficar
  // marcada quando o dado do back chega de novo. A edição tem que sobreviver
  // a qualquer refetch enquanto não for salva.
  describe("refetch durante a edição", () => {
    it("refetch com o mesmo dado não desfaz a caixa desmarcada", async () => {
      getRestaurant.mockResolvedValue({
        id: "comp-1",
        acceptedPaymentMethods: ["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"],
      });
      const rendered = renderPaymentMethods();
      const { result } = rendered;
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.toggleMethod("CASH"));
      await refetchAndSettle(rendered);

      expect(getRestaurant).toHaveBeenCalledTimes(2);
      expect(result.current.selected).toEqual(["CREDIT_CARD", "DEBIT_CARD", "PIX"]);
      expect(result.current.hasChanges).toBe(true);
    });

    it("refetch com dado diferente também não sobrescreve a edição", async () => {
      getRestaurant.mockResolvedValueOnce({
        id: "comp-1",
        acceptedPaymentMethods: ["CASH", "PIX"],
      });
      getRestaurant.mockResolvedValue({
        id: "comp-1",
        acceptedPaymentMethods: ["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"],
      });
      const rendered = renderPaymentMethods();
      const { result } = rendered;
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.toggleMethod("PIX"));
      await refetchAndSettle(rendered);

      expect(result.current.selected).toEqual(["CASH"]);
      expect(result.current.hasChanges).toBe(true);
    });

    it("salvar depois de um refetch manda o estado atual das caixas", async () => {
      getRestaurant.mockResolvedValue({
        id: "comp-1",
        acceptedPaymentMethods: ["CASH", "CREDIT_CARD", "DEBIT_CARD", "PIX"],
      });
      const rendered = renderPaymentMethods();
      const { result } = rendered;
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => result.current.toggleMethod("CASH"));
      await refetchAndSettle(rendered);
      act(() => result.current.toggleMethod("PIX"));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(updateAcceptedPaymentMethods).toHaveBeenCalledTimes(1);
      expect(updateAcceptedPaymentMethods).toHaveBeenCalledWith("comp-1", [
        "CREDIT_CARD",
        "DEBIT_CARD",
      ]);
    });
  });
});
