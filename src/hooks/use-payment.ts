import {
  apiService,
  Payment,
  PaymentMethod,
  PaymentStatus,
  toPaginated,
  type PaginationParams,
} from "@/services/api";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils";

interface PaymentsPageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PaymentFilters {
  id?: string;
  orderId?: string;
  customerId?: string;
}

interface DateRangeFilter {
  startDate: string;
  endDate: string;
  customerId?: string;
}

/**
 * Hook para gerenciar operações de pagamento
 *
 * Funcionalidades:
 * - Buscar pagamentos por filtros (id, orderId, customerId)
 * - Buscar por método de pagamento
 * - Buscar por período (data)
 * - Aprovar pagamento
 * - Rejeitar pagamento
 * - Atualizar pagamento
 * - Deletar pagamento
 */
export const usePayment = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsMeta, setPaymentsMeta] = useState<PaymentsPageMeta | null>(
    null,
  );
  const [currentPayment, setCurrentPayment] = useState<Payment | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Buscar pagamento por ID
   */
  const fetchPaymentById = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiService.payments.findById(id);
      if (response.success && response.data) {
        setCurrentPayment(response.data);
        return response.data;
      } else {
        throw new Error(response.message || "Pagamento não encontrado");
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err, "Erro ao buscar pagamento");
      setError(errorMessage);
      toast.error(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Buscar pagamentos por filtros
   */
  const fetchPaymentsByFilters = useCallback(
    async (filters: PaymentFilters, params?: PaginationParams) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiService.payments.findByFilters(
          filters,
          params,
        );
        if (response.success && response.data) {
          // toPaginated aceita o envelope { data, meta } e o array cru. Ler
          // `.data.data` direto deixava `payments` undefined com array cru e
          // derrubava a tela de Finanças no `.reduce` (LDMF-495).
          const { items: paymentList, meta } = toPaginated(
            response.data,
            params,
          );
          setPayments(paymentList);
          setPaymentsMeta(meta);
          return paymentList;
        } else {
          throw new Error(response.message || "Nenhum pagamento encontrado");
        }
      } catch (err) {
        const errorMessage = getErrorMessage(err, "Erro ao buscar pagamentos");
        setError(errorMessage);
        setPayments([]);
        setPaymentsMeta(null);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Buscar pagamentos de um pedido específico
   */
  const fetchPaymentsByOrder = useCallback(
    async (orderId: string) => {
      return fetchPaymentsByFilters({ orderId });
    },
    [fetchPaymentsByFilters],
  );

  /**
   * Buscar pagamentos de um cliente específico
   */
  const fetchPaymentsByCustomer = useCallback(
    async (customerId: string) => {
      return fetchPaymentsByFilters({ customerId });
    },
    [fetchPaymentsByFilters],
  );

  /**
   * Buscar pagamentos por método de pagamento
   */
  const fetchPaymentsByMethod = useCallback(
    async (paymentMethod: PaymentMethod, params?: PaginationParams) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiService.payments.findByMethod(
          paymentMethod,
          params,
        );
        if (response.success && response.data) {
          // toPaginated aceita o envelope { data, meta } e o array cru. Ler
          // `.data.data` direto deixava `payments` undefined com array cru e
          // derrubava a tela de Finanças no `.reduce` (LDMF-495).
          const { items: paymentList, meta } = toPaginated(
            response.data,
            params,
          );
          setPayments(paymentList);
          setPaymentsMeta(meta);
          return paymentList;
        } else {
          throw new Error(response.message || "Nenhum pagamento encontrado");
        }
      } catch (err) {
        const errorMessage = getErrorMessage(err, "Erro ao buscar pagamentos por método");
        setError(errorMessage);
        setPayments([]);
        setPaymentsMeta(null);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Buscar pagamentos por período (data)
   */
  const fetchPaymentsByDateRange = useCallback(
    async (filters: DateRangeFilter, params?: PaginationParams) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiService.payments.findByDateRange(
          filters.startDate,
          filters.endDate,
          filters.customerId,
          params,
        );
        if (response.success && response.data) {
          // toPaginated aceita o envelope { data, meta } e o array cru. Ler
          // `.data.data` direto deixava `payments` undefined com array cru e
          // derrubava a tela de Finanças no `.reduce` (LDMF-495).
          const { items: paymentList, meta } = toPaginated(
            response.data,
            params,
          );
          setPayments(paymentList);
          setPaymentsMeta(meta);
          return paymentList;
        } else {
          throw new Error(response.message || "Nenhum pagamento encontrado");
        }
      } catch (err) {
        const errorMessage = getErrorMessage(err, "Erro ao buscar pagamentos por período");
        setError(errorMessage);
        setPayments([]);
        setPaymentsMeta(null);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Aprovar pagamento
   * Atualiza status para COMPLETED e pode incluir código de transação
   */
  const approvePayment = useCallback(
    async (id: string, transaction?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiService.payments.approve(id, transaction);
        if (response.success && response.data) {
          setCurrentPayment(response.data);

          // Atualizar na lista se existir
          setPayments((prev) =>
            prev.map((p) => (p.id === id ? response.data! : p)),
          );

          toast.success("Pagamento aprovado com sucesso!");
          return response.data;
        } else {
          throw new Error(response.message || "Erro ao aprovar pagamento");
        }
      } catch (err) {
        const errorMessage = getErrorMessage(err, "Erro ao aprovar pagamento");
        setError(errorMessage);
        toast.error(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Rejeitar pagamento
   * Atualiza status para FAILED
   */
  const rejectPayment = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiService.payments.reject(id);
      if (response.success && response.data) {
        setCurrentPayment(response.data);

        // Atualizar na lista se existir
        setPayments((prev) =>
          prev.map((p) => (p.id === id ? response.data! : p)),
        );

        toast.success("Pagamento rejeitado");
        return response.data;
      } else {
        throw new Error(response.message || "Erro ao rejeitar pagamento");
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err, "Erro ao rejeitar pagamento");
      setError(errorMessage);
      toast.error(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Reembolsar pagamento (via fluxo /financial)
   * Cria CashMovement REFUND automaticamente
   */
  const refundPayment = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiService.payments.financialRefund(id);
      if (response.success && response.data) {
        setCurrentPayment(response.data);
        setPayments((prev) =>
          prev.map((p) => (p.id === id ? response.data! : p)),
        );
        toast.success("Reembolso realizado com sucesso!");
        return response.data;
      } else {
        throw new Error(response.message || "Erro ao reembolsar pagamento");
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err, "Erro ao reembolsar pagamento");
      setError(errorMessage);
      toast.error(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Atualizar pagamento
   */
  const updatePayment = useCallback(
    async (
      id: string,
      data: {
        amount?: number;
        orderId?: string;
        customerId?: string;
        paymentMethod?: PaymentMethod;
        status?: PaymentStatus;
      },
    ) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiService.payments.update(id, data);
        if (response.success && response.data) {
          setCurrentPayment(response.data);

          // Atualizar na lista se existir
          setPayments((prev) =>
            prev.map((p) => (p.id === id ? response.data! : p)),
          );

          toast.success("Pagamento atualizado com sucesso!");
          return response.data;
        } else {
          throw new Error(response.message || "Erro ao atualizar pagamento");
        }
      } catch (err) {
        const errorMessage = getErrorMessage(err, "Erro ao atualizar pagamento");
        setError(errorMessage);
        toast.error(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  /**
   * Deletar pagamento
   */
  const deletePayment = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiService.payments.delete(id);
        if (response.success) {
          // Remover da lista
          setPayments((prev) => prev.filter((p) => p.id !== id));

          if (currentPayment?.id === id) {
            setCurrentPayment(null);
          }

          toast.success("Pagamento deletado com sucesso!");
          return true;
        } else {
          throw new Error(response.message || "Erro ao deletar pagamento");
        }
      } catch (err) {
        const errorMessage = getErrorMessage(err, "Erro ao deletar pagamento");
        setError(errorMessage);
        toast.error(errorMessage);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [currentPayment],
  );

  /**
   * Limpar estado
   */
  const clearPayments = useCallback(() => {
    setPayments([]);
    setCurrentPayment(null);
    setError(null);
  }, []);

  /**
   * Verificar se um pagamento está pendente
   */
  const isPending = useCallback((payment: Payment) => {
    return payment.status === PaymentStatus.PENDING;
  }, []);

  /**
   * Verificar se um pagamento foi completado
   */
  const isCompleted = useCallback((payment: Payment) => {
    return payment.status === PaymentStatus.COMPLETED;
  }, []);

  /**
   * Verificar se um pagamento falhou
   */
  const isFailed = useCallback((payment: Payment) => {
    return payment.status === PaymentStatus.FAILED;
  }, []);

  /**
   * Obter label legível do método de pagamento
   */
  const getPaymentMethodLabel = useCallback((method: PaymentMethod) => {
    const labels: Record<PaymentMethod, string> = {
      [PaymentMethod.CASH]: "Dinheiro",
      [PaymentMethod.CREDIT_CARD]: "Cartão de Crédito",
      [PaymentMethod.DEBIT_CARD]: "Cartão de Débito",
      [PaymentMethod.PIX]: "PIX",
      [PaymentMethod.BANK_TRANSFER]: "Transferência Bancária",
    };
    return labels[method] || method;
  }, []);

  /**
   * Obter label legível do status do pagamento
   */
  const getPaymentStatusLabel = useCallback((status: PaymentStatus) => {
    const labels: Record<PaymentStatus, string> = {
      [PaymentStatus.PENDING]: "Pendente",
      [PaymentStatus.COMPLETED]: "Concluído",
      [PaymentStatus.FAILED]: "Falhou",
      [PaymentStatus.CANCELLED]: "Cancelado",
      [PaymentStatus.REFUNDED]: "Reembolsado",
    };
    return labels[status] || status;
  }, []);

  return {
    // State
    payments,
    paymentsMeta,
    currentPayment,
    isLoading,
    error,

    // Fetch operations
    fetchPaymentById,
    fetchPaymentsByFilters,
    fetchPaymentsByOrder,
    fetchPaymentsByCustomer,
    fetchPaymentsByMethod,
    fetchPaymentsByDateRange,

    // Update operations
    approvePayment,
    rejectPayment,
    refundPayment,
    updatePayment,
    deletePayment,

    // Utilities
    clearPayments,
    isPending,
    isCompleted,
    isFailed,
    getPaymentMethodLabel,
    getPaymentStatusLabel,
  };
};
