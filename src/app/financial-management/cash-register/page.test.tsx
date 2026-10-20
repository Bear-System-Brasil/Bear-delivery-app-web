import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFinancialPreferencesStore } from "@/stores";
import CashRegisterPage from "./page";

/**
 * Testes de layout da tela. Não cobrem conta de dinheiro: os totais vêm
 * prontos do mock, e o que se confere é que cada bloco aparece no estado
 * certo e que os gatilhos continuam ligados aos mesmos fluxos.
 */

// Referências estáveis: objetos criados uma vez e só alterados entre testes.
// Mock com identidade nova a cada render causa laço infinito neste projeto.
const h = vi.hoisted(() => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    register: {
      data: null as unknown,
      isLoading: false,
      refetch: vi.fn(),
    },
    summary: {
      data: null as unknown,
      isLoading: false,
      refetch: vi.fn(),
    },
    movements: {
      data: { items: [], meta: { total: 0, page: 1, totalPages: 1 } },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    },
    open: mutation(),
    close: mutation(),
    withdrawal: mutation(),
    deposit: mutation(),
    sale: mutation(),
    refund: mutation(),
  };
});

vi.mock("@/hooks", () => ({
  useCashRegister: () => h.register,
  useCashMovementSummary: () => h.summary,
  useCashMovements: () => h.movements,
  useOpenCashRegister: () => h.open,
  useCloseCashRegister: () => h.close,
  useCashWithdrawal: () => h.withdrawal,
  useCashDeposit: () => h.deposit,
  useCashSale: () => h.sale,
  useCashRefund: () => h.refund,
}));

vi.mock("@/components/admin-page-layout", () => ({
  AdminPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const OPEN_REGISTER = {
  id: "cx1",
  openingBalance: 100,
  openedAt: "2026-10-20T13:54:00.000Z",
};

const SUMMARY = {
  totalSales: 50,
  totalDeposits: 20,
  totalWithdrawals: 10,
  totalRefunds: 0,
  totalCash: 60,
  totalPix: 0,
  totalCredit: 0,
  totalDebit: 0,
  totalTransfer: 0,
  availableBalance: 160,
};

const initialPreferences = useFinancialPreferencesStore.getState();

beforeEach(() => {
  h.register.data = null;
  h.summary.data = null;
  localStorage.clear();
  useFinancialPreferencesStore.setState(initialPreferences, true);
});

describe("Controle de Caixa - caixa fechado", () => {
  it("mostra o aviso de fechado e abre o mesmo diálogo de abertura", () => {
    render(<CashRegisterPage />);

    expect(screen.getByText("Caixa fechado")).toBeInTheDocument();
    expect(screen.getByText("Nenhum caixa aberto")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Abrir caixa" }));
    expect(
      screen.getByRole("dialog", { name: "Abrir caixa" }),
    ).toBeInTheDocument();
  });
});

describe("Controle de Caixa - caixa aberto", () => {
  beforeEach(() => {
    h.register.data = OPEN_REGISTER;
    h.summary.data = SUMMARY;
  });

  it("mostra a faixa de status e as seções do design novo", () => {
    render(<CashRegisterPage />);

    expect(screen.getByText("Caixa aberto")).toBeInTheDocument();
    for (const title of [
      "Por forma de pagamento",
      "Registrar movimento",
      "Conferência de fechamento",
      "Extrato de movimentos",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("Detalhamento do turno")).toBeInTheDocument();
  });

  it("os quatro tipos de movimento continuam abrindo o diálogo no tipo certo", () => {
    render(<CashRegisterPage />);
    const section = screen
      .getByRole("heading", { name: "Registrar movimento" })
      .closest("section") as HTMLElement;

    for (const label of ["Sangria", "Suprimento", "Venda", "Reembolso"]) {
      fireEvent.click(within(section).getByRole("button", { name: label }));
      const dialog = screen.getByRole("dialog", { name: "Registrar movimento" });
      // O tipo escolhido fica marcado dentro do diálogo.
      expect(within(dialog).getByRole("button", { name: label })).toHaveClass(
        "bg-selected",
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    }
  });

  it("Entrada e Saída da faixa abrem suprimento e sangria", () => {
    render(<CashRegisterPage />);

    fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
    let dialog = screen.getByRole("dialog", { name: "Registrar movimento" });
    expect(within(dialog).getByRole("button", { name: "Suprimento" })).toHaveClass(
      "bg-selected",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Saída" }));
    dialog = screen.getByRole("dialog", { name: "Registrar movimento" });
    expect(within(dialog).getByRole("button", { name: "Sangria" })).toHaveClass(
      "bg-selected",
    );
  });

  it("fechar caixa segue bloqueado até marcar a confirmação extra", () => {
    render(<CashRegisterPage />);
    const fechar = screen.getByRole("button", { name: "Fechar caixa" });

    expect(fechar).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Confirmo que conferi o dinheiro físico da gaveta",
      }),
    );
    expect(fechar).toBeEnabled();
  });

  it("sem a confirmação extra nas preferências, o botão não depende do checkbox", () => {
    useFinancialPreferencesStore.setState({ confirmBeforeCloseRegister: false });
    render(<CashRegisterPage />);

    expect(
      screen.queryByRole("checkbox", {
        name: "Confirmo que conferi o dinheiro físico da gaveta",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar caixa" })).toBeEnabled();
  });
});
