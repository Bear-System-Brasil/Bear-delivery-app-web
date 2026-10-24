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
  totalDebit: 80,
  totalTransfer: 0,
  // Inclui métodos que não são dinheiro (ex.: os R$ 80 do débito), então é
  // diferente de fundo + dinheiro. A gaveta não pode usar este valor.
  availableBalance: 240,
};

const initialPreferences = useFinancialPreferencesStore.getState();

beforeEach(() => {
  h.register.data = null;
  h.summary.data = null;
  h.movements.data = {
    items: [],
    meta: { total: 0, page: 1, totalPages: 1 },
  };
  localStorage.clear();
  useFinancialPreferencesStore.setState(initialPreferences, true);
});

describe("Controle de Caixa - caixa fechado", () => {
  it("mostra o aviso de fechado e o card inline de abertura", () => {
    render(<CashRegisterPage />);

    expect(screen.getByText("Caixa fechado")).toBeInTheDocument();
    // Abrir caixa agora é inline (sem modal): card com título e botão. O botão
    // só libera depois do fundo de troco.
    expect(
      screen.getByRole("heading", { name: "Abrir caixa" }),
    ).toBeInTheDocument();
    const abrir = screen.getByRole("button", { name: "Abrir caixa" });
    expect(abrir).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("0,00"), {
      target: { value: "100" },
    });
    expect(abrir).toBeEnabled();
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
      "Conferência de fechamento",
      "Extrato de movimentos",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    // O detalhamento perdeu o título destacado, mas as linhas brutas seguem.
    expect(
      screen.getByText("Vendas (todos os métodos)"),
    ).toBeInTheDocument();
  });

  it("filtra o extrato por tipo na própria tela", () => {
    h.movements.data = {
      items: [
        {
          id: "1",
          type: "SALE",
          amount: 100,
          description: "Venda A",
          paymentMethod: "CASH",
          source: "MANUAL",
          createdAt: "2026-10-20T10:00:00.000Z",
        },
        {
          id: "2",
          type: "WITHDRAWAL",
          amount: 50,
          description: "Sangria B",
          paymentMethod: "CASH",
          source: "MANUAL",
          createdAt: "2026-10-20T11:00:00.000Z",
        },
      ],
      meta: { total: 2, page: 1, totalPages: 1 },
    };
    render(<CashRegisterPage />);
    const extrato = screen
      .getByRole("heading", { name: "Extrato de movimentos" })
      .closest("section") as HTMLElement;

    // Sem filtro, os dois movimentos aparecem (lista mobile + tabela desktop
    // renderizam juntas no jsdom, por isso queryAllByText).
    expect(within(extrato).queryAllByText("Venda A").length).toBeGreaterThan(0);
    expect(within(extrato).queryAllByText("Sangria B").length).toBeGreaterThan(
      0,
    );

    fireEvent.change(within(extrato).getByLabelText("Filtrar por tipo"), {
      target: { value: "WITHDRAWAL" },
    });

    expect(within(extrato).queryAllByText("Venda A").length).toBe(0);
    expect(within(extrato).queryAllByText("Sangria B").length).toBeGreaterThan(
      0,
    );
  });

  it("esperado na gaveta é fundo + dinheiro, sem somar cartão/pix", () => {
    render(<CashRegisterPage />);
    const conf = screen
      .getByRole("heading", { name: "Conferência de fechamento" })
      .closest("section") as HTMLElement;
    // fundo 100 + dinheiro 60 = 160. Não usa o availableBalance (240), que
    // inclui o cartão.
    expect(within(conf).getByText(/R\$\s*160,00/)).toBeInTheDocument();
    expect(within(conf).queryByText(/R\$\s*240,00/)).toBeNull();
  });

  it("Entrada abre em Venda e Saída em Reembolso, cada um só com seu grupo", () => {
    render(<CashRegisterPage />);

    fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
    let dialog = screen.getByRole("dialog", { name: "Registrar entrada" });
    expect(within(dialog).getByRole("button", { name: "Venda" })).toHaveClass(
      "bg-selected",
    );
    // Só os tipos de entrada aparecem; os de saída não.
    expect(
      within(dialog).queryByRole("button", { name: "Sangria" }),
    ).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Suprimento" }),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Saída" }));
    dialog = screen.getByRole("dialog", { name: "Registrar saída" });
    expect(within(dialog).getByRole("button", { name: "Reembolso" })).toHaveClass(
      "bg-selected",
    );
    expect(within(dialog).queryByRole("button", { name: "Venda" })).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Sangria" }),
    ).toBeInTheDocument();
  });

  it("confirmar fechamento fica bloqueado até valor contado e confirmação", () => {
    render(<CashRegisterPage />);

    // "Fechar caixa" agora só abre o modal; a trava é no "Confirmar fechamento".
    fireEvent.click(screen.getByRole("button", { name: "Fechar caixa" }));
    const dialog = screen.getByRole("dialog", { name: "Fechar caixa" });
    const confirmar = within(dialog).getByRole("button", {
      name: "Confirmar fechamento",
    });

    expect(confirmar).toBeDisabled();
    fireEvent.change(within(dialog).getByPlaceholderText("0,00"), {
      target: { value: "160" },
    });
    // Falta ainda a confirmação extra.
    expect(confirmar).toBeDisabled();
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "Confirmo que conferi o dinheiro físico da gaveta",
      }),
    );
    expect(confirmar).toBeEnabled();
  });

  it("sem a confirmação extra nas preferências, o botão não depende do checkbox", () => {
    useFinancialPreferencesStore.setState({ confirmBeforeCloseRegister: false });
    render(<CashRegisterPage />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar caixa" }));
    const dialog = screen.getByRole("dialog", { name: "Fechar caixa" });
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();

    const confirmar = within(dialog).getByRole("button", {
      name: "Confirmar fechamento",
    });
    expect(confirmar).toBeDisabled();
    fireEvent.change(within(dialog).getByPlaceholderText("0,00"), {
      target: { value: "160" },
    });
    expect(confirmar).toBeEnabled();
  });
});

describe("Controle de Caixa - métodos de pagamento (LDMF-391)", () => {
  const CASH_METHOD_LABELS = [
    "Dinheiro",
    "Cartão de Crédito",
    "Cartão de Débito",
    "PIX",
  ];

  beforeEach(() => {
    h.register.data = OPEN_REGISTER;
    h.summary.data = SUMMARY;
  });

  const optionLabels = (select: HTMLElement) =>
    within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);

  const movementMethodSelect = (dialog: HTMLElement) =>
    within(dialog)
      .getByRole("option", { name: "Selecione o método" })
      .closest("select") as HTMLElement;

  it("o modal de movimento oferece os 4 métodos, sem Transferência", () => {
    render(<CashRegisterPage />);

    fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
    const dialog = screen.getByRole("dialog", { name: "Registrar entrada" });

    expect(optionLabels(movementMethodSelect(dialog))).toEqual([
      "Selecione o método",
      ...CASH_METHOD_LABELS,
    ]);
  });

  it("o filtro de método do extrato tem os 4 métodos, sem Transferência", () => {
    render(<CashRegisterPage />);
    const extrato = screen
      .getByRole("heading", { name: "Extrato de movimentos" })
      .closest("section") as HTMLElement;

    expect(
      optionLabels(within(extrato).getByLabelText("Filtrar por método")),
    ).toEqual(["Todos os métodos", ...CASH_METHOD_LABELS]);
  });

  it("Transferência salva como preferida não vem pré-selecionada", () => {
    useFinancialPreferencesStore.setState({
      defaultPaymentMethod: "BANK_TRANSFER" as never,
    });
    render(<CashRegisterPage />);

    fireEvent.click(screen.getByRole("button", { name: "Entrada" }));
    const dialog = screen.getByRole("dialog", { name: "Registrar entrada" });

    expect(movementMethodSelect(dialog)).toHaveValue("");
  });

  it("movimento antigo com Transferência continua aparecendo pelo nome", () => {
    h.movements.data = {
      items: [
        {
          id: "1",
          type: "SALE",
          amount: 100,
          description: "Venda antiga",
          paymentMethod: "BANK_TRANSFER",
          source: "MANUAL",
          createdAt: "2026-10-20T10:00:00.000Z",
        },
      ],
      meta: { total: 1, page: 1, totalPages: 1 },
    };
    render(<CashRegisterPage />);
    const extrato = screen
      .getByRole("heading", { name: "Extrato de movimentos" })
      .closest("section") as HTMLElement;

    expect(
      within(extrato).queryAllByText("Transferência Bancária").length,
    ).toBeGreaterThan(0);
  });
});
