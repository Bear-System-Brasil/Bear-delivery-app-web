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

function renderPaymentMethods() {
  // Cliente novo por teste, mas estável entre renders do mesmo teste.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCompanyAcceptedPaymentMethods("comp-1"), {
    wrapper: Wrapper,
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
});
