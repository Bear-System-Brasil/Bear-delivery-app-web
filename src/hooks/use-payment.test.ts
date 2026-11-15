import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  apiService,
  PaymentMethod,
  PaymentStatus,
  type Payment,
} from "@/services/api";
import { usePayment } from "./use-payment";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      payments: {
        findById: vi.fn(),
        findByFilters: vi.fn(),
        findByMethod: vi.fn(),
        findByDateRange: vi.fn(),
        approve: vi.fn(),
        reject: vi.fn(),
        financialRefund: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
});

const payments = vi.mocked(apiService.payments);

const payment = (id: string, status = PaymentStatus.PENDING): Payment => ({
  id,
  amount: 50,
  orderId: `order-${id}`,
  customerId: "cust-1",
  paymentMethod: PaymentMethod.PIX,
  status,
});

const meta = { page: 1, limit: 10, total: 2, totalPages: 1 };

// Carrega a lista com p1 e p2 pendentes, ponto de partida das ações.
async function renderWithList() {
  payments.findByFilters.mockResolvedValue({
    success: true,
    data: { data: [payment("p1"), payment("p2")], meta },
  });
  const hook = renderHook(() => usePayment());
  await act(async () => {
    await hook.result.current.fetchPaymentsByFilters({});
  });
  return hook;
}

describe("usePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listagens paginadas", () => {
    it("guarda itens e meta do envelope e repassa filtros e paginação", async () => {
      payments.findByFilters.mockResolvedValue({
        success: true,
        data: { data: [payment("p1")], meta },
      });
      const { result } = renderHook(() => usePayment());

      let list: Payment[] = [];
      await act(async () => {
        list = await result.current.fetchPaymentsByFilters(
          { customerId: "cust-1" },
          { page: 2, limit: 10 },
        );
      });

      expect(payments.findByFilters).toHaveBeenCalledWith(
        { customerId: "cust-1" },
        { page: 2, limit: 10 },
      );
      expect(list).toEqual([payment("p1")]);
      expect(result.current.payments).toEqual([payment("p1")]);
      expect(result.current.paymentsMeta).toEqual(meta);
      expect(result.current.isLoading).toBe(false);
    });

    it.each([
      ["fetchPaymentsByFilters", "findByFilters", {}],
      ["fetchPaymentsByMethod", "findByMethod", PaymentMethod.PIX],
      ["fetchPaymentsByDateRange", "findByDateRange", { startDate: "2026-11-01", endDate: "2026-11-09" }],
    ] as const)(
      "%s aceita array cru, sem envelope, e não deixa a lista undefined (LDMF-495)",
      async (fn, method, arg) => {
        // Com `.data.data` direto, a lista virava undefined e a tela de
        // Finanças quebrava no `.reduce` do resumo.
        payments[method].mockResolvedValue({
          success: true,
          data: [payment("p1"), payment("p2")],
        } as never);
        const { result } = renderHook(() => usePayment());

        await act(async () => {
          await (result.current[fn] as (a: unknown) => Promise<Payment[]>)(arg);
        });

        expect(result.current.payments).toEqual([payment("p1"), payment("p2")]);
        expect(result.current.paymentsMeta).toMatchObject({ total: 2, totalPages: 1 });
      },
    );

    it("em falha, zera lista e meta e guarda a mensagem do backend", async () => {
      const { result } = await renderWithList();
      payments.findByFilters.mockResolvedValue({ success: false, message: "Sem permissão" });

      let list: Payment[] = [payment("x")];
      await act(async () => {
        list = await result.current.fetchPaymentsByFilters({});
      });

      expect(list).toEqual([]);
      expect(result.current.payments).toEqual([]);
      expect(result.current.paymentsMeta).toBeNull();
      expect(result.current.error).toBe("Sem permissão");
      expect(result.current.isLoading).toBe(false);
    });

    it("fetchPaymentsByOrder e fetchPaymentsByCustomer filtram pelo campo certo", async () => {
      payments.findByFilters.mockResolvedValue({ success: true, data: { data: [], meta } });
      const { result } = renderHook(() => usePayment());

      await act(async () => {
        await result.current.fetchPaymentsByOrder("order-9");
        await result.current.fetchPaymentsByCustomer("cust-9");
      });

      expect(payments.findByFilters).toHaveBeenNthCalledWith(1, { orderId: "order-9" }, undefined);
      expect(payments.findByFilters).toHaveBeenNthCalledWith(2, { customerId: "cust-9" }, undefined);
    });

    it("fetchPaymentsByMethod repassa o método e a paginação", async () => {
      payments.findByMethod.mockResolvedValue({
        success: true,
        data: { data: [payment("p1")], meta },
      });
      const { result } = renderHook(() => usePayment());

      await act(async () => {
        await result.current.fetchPaymentsByMethod(PaymentMethod.CASH, { page: 1, limit: 5 });
      });

      expect(payments.findByMethod).toHaveBeenCalledWith(PaymentMethod.CASH, { page: 1, limit: 5 });
      expect(result.current.payments).toHaveLength(1);
    });

    it("fetchPaymentsByDateRange repassa período, cliente e paginação", async () => {
      payments.findByDateRange.mockResolvedValue({
        success: true,
        data: { data: [payment("p1")], meta },
      });
      const { result } = renderHook(() => usePayment());

      await act(async () => {
        await result.current.fetchPaymentsByDateRange(
          { startDate: "2026-09-01", endDate: "2026-09-30", customerId: "cust-1" },
          { page: 3, limit: 20 },
        );
      });

      expect(payments.findByDateRange).toHaveBeenCalledWith(
        "2026-09-01",
        "2026-09-30",
        "cust-1",
        { page: 3, limit: 20 },
      );
      expect(result.current.payments).toHaveLength(1);
    });

    it("fetchPaymentsByMethod em falha zera a lista com mensagem própria", async () => {
      payments.findByMethod.mockRejectedValue("boom");
      const { result } = await renderWithList();

      await act(async () => {
        await result.current.fetchPaymentsByMethod(PaymentMethod.PIX);
      });

      expect(result.current.payments).toEqual([]);
      expect(result.current.error).toBe("boom");
    });
  });

  describe("fetchPaymentById", () => {
    it("guarda o pagamento como atual", async () => {
      payments.findById.mockResolvedValue({ success: true, data: payment("p1") });
      const { result } = renderHook(() => usePayment());

      await act(async () => {
        await result.current.fetchPaymentById("p1");
      });

      expect(result.current.currentPayment).toEqual(payment("p1"));
    });

    it("sem mensagem do backend, avisa 'Pagamento não encontrado'", async () => {
      payments.findById.mockResolvedValue({ success: false });
      const { result } = renderHook(() => usePayment());

      let found: Payment | null = payment("x");
      await act(async () => {
        found = await result.current.fetchPaymentById("p1");
      });

      expect(found).toBeNull();
      expect(result.current.error).toBe("Pagamento não encontrado");
      expect(toast.error).toHaveBeenCalledWith("Pagamento não encontrado");
    });
  });

  describe("aprovar, rejeitar e reembolsar", () => {
    it("approvePayment manda a transação e troca só o item aprovado na lista", async () => {
      const { result } = await renderWithList();
      const approved = { ...payment("p1", PaymentStatus.COMPLETED), transaction: "TXN-1" };
      payments.approve.mockResolvedValue({ success: true, data: approved });

      await act(async () => {
        await result.current.approvePayment("p1", "TXN-1");
      });

      expect(payments.approve).toHaveBeenCalledWith("p1", "TXN-1");
      expect(result.current.payments).toEqual([approved, payment("p2")]);
      expect(result.current.currentPayment).toEqual(approved);
      expect(toast.success).toHaveBeenCalledWith("Pagamento aprovado com sucesso!");
    });

    it("approvePayment recusado mantém a lista e mostra o erro do backend", async () => {
      const { result } = await renderWithList();
      payments.approve.mockResolvedValue({ success: false, message: "Pagamento já aprovado" });

      let returned: Payment | null = payment("x");
      await act(async () => {
        returned = await result.current.approvePayment("p1");
      });

      expect(returned).toBeNull();
      expect(result.current.payments).toEqual([payment("p1"), payment("p2")]);
      expect(toast.error).toHaveBeenCalledWith("Pagamento já aprovado");
      expect(result.current.isLoading).toBe(false);
    });

    it("rejectPayment troca o item pelo devolvido pelo backend", async () => {
      const { result } = await renderWithList();
      const rejected = payment("p2", PaymentStatus.FAILED);
      payments.reject.mockResolvedValue({ success: true, data: rejected });

      await act(async () => {
        await result.current.rejectPayment("p2");
      });

      expect(payments.reject).toHaveBeenCalledWith("p2");
      expect(result.current.payments).toEqual([payment("p1"), rejected]);
      expect(toast.success).toHaveBeenCalledWith("Pagamento rejeitado");
    });

    it("rejectPayment com exceção de rede usa a mensagem da exceção", async () => {
      const { result } = await renderWithList();
      payments.reject.mockRejectedValue(new Error("Falha de conexão"));

      await act(async () => {
        await result.current.rejectPayment("p2");
      });

      expect(result.current.error).toBe("Falha de conexão");
      expect(result.current.payments).toEqual([payment("p1"), payment("p2")]);
    });

    it("refundPayment passa pelo fluxo /financial e atualiza o item", async () => {
      const { result } = await renderWithList();
      const refunded = payment("p1", PaymentStatus.REFUNDED);
      payments.financialRefund.mockResolvedValue({ success: true, data: refunded });

      await act(async () => {
        await result.current.refundPayment("p1");
      });

      expect(payments.financialRefund).toHaveBeenCalledWith("p1");
      expect(result.current.payments[0]).toEqual(refunded);
      expect(toast.success).toHaveBeenCalledWith("Reembolso realizado com sucesso!");
    });

    it("refundPayment recusado não mexe na lista e usa a mensagem padrão", async () => {
      const { result } = await renderWithList();
      payments.financialRefund.mockResolvedValue({ success: false });

      await act(async () => {
        await result.current.refundPayment("p1");
      });

      expect(result.current.payments).toEqual([payment("p1"), payment("p2")]);
      expect(toast.error).toHaveBeenCalledWith("Erro ao reembolsar pagamento");
    });
  });

  describe("updatePayment e deletePayment", () => {
    it("updatePayment repassa os campos e troca o item na lista", async () => {
      const { result } = await renderWithList();
      const updated = { ...payment("p2"), amount: 80 };
      payments.update.mockResolvedValue({ success: true, data: updated });

      await act(async () => {
        await result.current.updatePayment("p2", { amount: 80 });
      });

      expect(payments.update).toHaveBeenCalledWith("p2", { amount: 80 });
      expect(result.current.payments).toEqual([payment("p1"), updated]);
    });

    it("deletePayment remove da lista e limpa o pagamento atual se for o mesmo", async () => {
      const { result } = await renderWithList();
      payments.findById.mockResolvedValue({ success: true, data: payment("p1") });
      payments.delete.mockResolvedValue({ success: true });

      await act(async () => {
        await result.current.fetchPaymentById("p1");
      });
      let deleted = false;
      await act(async () => {
        deleted = await result.current.deletePayment("p1");
      });

      expect(deleted).toBe(true);
      expect(result.current.payments).toEqual([payment("p2")]);
      expect(result.current.currentPayment).toBeNull();
    });

    it("deletePayment de outro id mantém o pagamento atual", async () => {
      const { result } = await renderWithList();
      payments.findById.mockResolvedValue({ success: true, data: payment("p1") });
      payments.delete.mockResolvedValue({ success: true });

      await act(async () => {
        await result.current.fetchPaymentById("p1");
      });
      await act(async () => {
        await result.current.deletePayment("p2");
      });

      expect(result.current.payments).toEqual([payment("p1")]);
      expect(result.current.currentPayment).toEqual(payment("p1"));
    });

    it("deletePayment recusado devolve false e mantém a lista", async () => {
      const { result } = await renderWithList();
      payments.delete.mockResolvedValue({ success: false, message: "Não pode" });

      let deleted = true;
      await act(async () => {
        deleted = await result.current.deletePayment("p1");
      });

      expect(deleted).toBe(false);
      expect(result.current.payments).toHaveLength(2);
      expect(toast.error).toHaveBeenCalledWith("Não pode");
    });
  });

  describe("utilitários", () => {
    it("clearPayments zera lista, atual e erro", async () => {
      const { result } = await renderWithList();
      payments.findById.mockResolvedValue({ success: false, message: "erro" });
      await act(async () => {
        await result.current.fetchPaymentById("p9");
      });

      act(() => result.current.clearPayments());

      expect(result.current.payments).toEqual([]);
      expect(result.current.currentPayment).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("isPending, isCompleted e isFailed olham só o status", () => {
      const { result } = renderHook(() => usePayment());
      const { isPending, isCompleted, isFailed } = result.current;

      expect(isPending(payment("a", PaymentStatus.PENDING))).toBe(true);
      expect(isCompleted(payment("a", PaymentStatus.COMPLETED))).toBe(true);
      expect(isFailed(payment("a", PaymentStatus.FAILED))).toBe(true);
      expect(isPending(payment("a", PaymentStatus.REFUNDED))).toBe(false);
      expect(isFailed(payment("a", PaymentStatus.CANCELLED))).toBe(false);
    });

    it("rótulos em português, e o valor cru quando o backend manda algo desconhecido", () => {
      const { result } = renderHook(() => usePayment());

      expect(result.current.getPaymentMethodLabel(PaymentMethod.CREDIT_CARD)).toBe("Cartão de Crédito");
      expect(result.current.getPaymentStatusLabel(PaymentStatus.REFUNDED)).toBe("Reembolsado");
      expect(result.current.getPaymentMethodLabel("VOUCHER" as PaymentMethod)).toBe("VOUCHER");
      expect(result.current.getPaymentStatusLabel("ON_HOLD" as PaymentStatus)).toBe("ON_HOLD");
    });
  });
});
