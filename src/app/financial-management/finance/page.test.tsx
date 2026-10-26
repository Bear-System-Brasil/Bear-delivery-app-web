import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Payment } from "@/services/api";

const PENDING_DEBIT: Payment = {
  id: "pay-1",
  orderId: "order-aaaaaaaa",
  customerId: "cus-1",
  amount: 35.9,
  paymentMethod: "DEBIT_CARD" as Payment["paymentMethod"],
  status: "PENDING" as Payment["status"],
};

const FAILED_CASH: Payment = {
  ...PENDING_DEBIT,
  id: "pay-2",
  orderId: "order-bbbbbbbb",
  paymentMethod: "CASH" as Payment["paymentMethod"],
  status: "FAILED" as Payment["status"],
};

const COMPLETED_PIX: Payment = {
  ...PENDING_DEBIT,
  id: "pay-3",
  orderId: "order-cccccccc",
  paymentMethod: "PIX" as Payment["paymentMethod"],
  status: "COMPLETED" as Payment["status"],
};

const updatePayment = vi.fn();
const fetchPaymentsByFilters = vi.fn();

// Referências estáveis: mock de hook com identidade nova a cada chamada
// causa laço infinito de render neste projeto.
const PAYMENTS = [PENDING_DEBIT, FAILED_CASH, COMPLETED_PIX];
const HOOK = {
  payments: PAYMENTS,
  paymentsMeta: null,
  isLoading: false,
  fetchPaymentsByFilters,
  fetchPaymentsByMethod: vi.fn(),
  fetchPaymentsByDateRange: vi.fn(),
  approvePayment: vi.fn(),
  rejectPayment: vi.fn(),
  refundPayment: vi.fn(),
  updatePayment,
  getPaymentMethodLabel: (method: string) => method,
  getPaymentStatusLabel: (status: string) => status,
  isPending: (p: Payment) => p.status === "PENDING",
  isCompleted: (p: Payment) => p.status === "COMPLETED",
  isFailed: (p: Payment) => p.status === "FAILED",
};

vi.mock("@/hooks", () => ({ usePayment: () => HOOK }));

const AUTH = { user: { role: "manager" } as { role: string } | null };
vi.mock("@/stores", () => ({
  useAuthStore: (selector: (state: typeof AUTH) => unknown) => selector(AUTH),
}));

vi.mock("@/components/admin-page-layout", () => ({
  AdminPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { default: FinancePage } = await import("./page");

/** A tabela (desktop) fica escondida por CSS, mas existe no DOM; o card do celular também. */
const changeLinks = () => screen.queryAllByRole("button", { name: "Alterar" });

describe("Finanças - alterar forma de pagamento", () => {
  beforeEach(() => {
    updatePayment.mockReset();
    fetchPaymentsByFilters.mockReset();
    AUTH.user = { role: "manager" };
  });

  it.each(["owner", "admin", "manager"])("%s vê o botão em pagamento pendente", (role) => {
    AUTH.user = { role };
    render(<FinancePage />);

    // Um no card do celular e um na tabela, só para o pagamento pendente:
    // o concluído já foi lançado no caixa com a forma dele.
    expect(changeLinks()).toHaveLength(2);
  });

  it.each(["financial", "cook", "delivery"])("%s não vê o botão", (role) => {
    AUTH.user = { role };
    render(<FinancePage />);

    expect(changeLinks()).toHaveLength(0);
  });

  it("salva a forma escolhida e recarrega a lista", async () => {
    updatePayment.mockResolvedValue({ ...PENDING_DEBIT, paymentMethod: "CREDIT_CARD" });
    const user = userEvent.setup();
    render(<FinancePage />);
    fetchPaymentsByFilters.mockClear();

    await user.click(changeLinks()[0]);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Crédito/ }));
    await user.click(within(dialog).getByRole("button", { name: "Salvar forma" }));

    // Corpo inteiro com os valores atuais: o backend valida todos os campos
    // ("Valor inválido" e "Id inválido" no preview). Só a forma muda.
    expect(updatePayment).toHaveBeenCalledWith("pay-1", {
      orderId: "order-aaaaaaaa",
      customerId: "cus-1",
      amount: 35.9,
      paymentMethod: "CREDIT_CARD",
      status: "PENDING",
    });
    expect(fetchPaymentsByFilters).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mantém a janela aberta quando o backend recusa", async () => {
    updatePayment.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<FinancePage />);

    await user.click(changeLinks()[0]);
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /PIX/ }));
    await user.click(within(dialog).getByRole("button", { name: "Salvar forma" }));

    expect(updatePayment).toHaveBeenCalledWith(
      "pay-1",
      expect.objectContaining({ paymentMethod: "PIX" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("Finanças - filtro de método (LDMF-391)", () => {
  it("tem os 4 métodos, sem Transferência", () => {
    render(<FinancePage />);

    const select = screen
      .getByRole("option", { name: "Todos os métodos" })
      .closest("select") as HTMLElement;
    const labels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);

    expect(labels).toEqual([
      "Todos os métodos",
      "PIX",
      "Cartão de Crédito",
      "Cartão de Débito",
      "Dinheiro",
    ]);
  });
});
