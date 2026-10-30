import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, useFinancialPreferencesStore } from "@/stores";
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
      error: null as Error | null,
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
const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  h.register.data = null;
  h.summary.data = null;
  h.summary.error = null;
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

    fireEvent.click(screen.getAllByRole("button", { name: "Entrada" })[0]);
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

    fireEvent.click(screen.getAllByRole("button", { name: "Entrada" })[0]);
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

    fireEvent.click(screen.getAllByRole("button", { name: "Entrada" })[0]);
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

    // Dois botões "Entrada"/"Saída" (cabeçalho no desktop + barra fixa no
    // mobile, LDMF-455); ambos abrem o mesmo diálogo, usamos o do cabeçalho.
    fireEvent.click(screen.getAllByRole("button", { name: "Saída" })[0]);
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

describe("Controle de Caixa - resumo indisponível (LDMF-427)", () => {
  // Linhas do bloco "Por forma de pagamento", lidas pela estrutura do card.
  function paymentRows() {
    let el: HTMLElement | null = screen.getByText("Por forma de pagamento");
    while (el && !el.querySelector(".divide-y")) el = el.parentElement;
    return Array.from(el!.querySelector(".divide-y")!.children) as HTMLElement[];
  }

  beforeEach(() => {
    h.register.data = OPEN_REGISTER;
  });

  it("com resumo, mostra os 4 métodos com valor e sem aviso", () => {
    h.summary.data = SUMMARY;
    render(<CashRegisterPage />);

    const rows = paymentRows();
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("R$ 60,00");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("com erro (403), mantém os 4 métodos em “—” e mostra a mensagem do back", () => {
    h.summary.data = undefined;
    h.summary.error = new Error("Operador não vinculado ao caixa aberto.");
    render(<CashRegisterPage />);

    const rows = paymentRows();
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Dinheiro"),
      expect.stringContaining("PIX"),
      expect.stringContaining("Cartão de Crédito"),
      expect.stringContaining("Cartão de Débito"),
    ]);
    rows.forEach((r) => expect(r).not.toHaveTextContent("R$"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os totais do caixa",
    );
  });

  it("caixa de outro operador: explica quem abriu, sem a mensagem técnica do back", () => {
    useAuthStore.setState({ user: { id: "dono", name: "Dono" } as never });
    h.register.data = {
      ...OPEN_REGISTER,
      operatorId: "op1",
      operator: { id: "op1", name: "Fogo e braza" },
    };
    h.summary.data = undefined;
    h.summary.error = new Error("Operador não vinculado ao caixa aberto.");
    render(<CashRegisterPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Este caixa foi aberto por Fogo e braza");
    expect(alert).not.toHaveTextContent("não vinculado");
    expect(paymentRows()).toHaveLength(4);
    useAuthStore.setState(initialAuthState, true);
  });

  it("sem resumo (404), não mostra zero falso em Entradas nem no esperado", () => {
    h.summary.data = null;
    render(<CashRegisterPage />);

    expect(paymentRows()).toHaveLength(4);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    // Entradas/Saídas e esperado na gaveta: nada de R$ 0,00 inventado.
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    // Só o fundo de troco (dado do caixa, não do resumo) continua com valor.
    expect(screen.getAllByText("R$ 100,00")).toHaveLength(1);
  });

  it("no fechamento, não calcula sobra nem falta sem o resumo", () => {
    h.summary.data = undefined;
    h.summary.error = new Error("falhou");
    render(<CashRegisterPage />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar caixa" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("0,00"), {
      target: { value: "50" },
    });

    expect(dialog).toHaveTextContent(
      "Sem o resumo do caixa não dá pra calcular a diferença.",
    );
    expect(dialog).not.toHaveTextContent(/Sobra de|Falta de/);
  });
});

describe("Controle de Caixa - operador da faixa (LDMF-427)", () => {
  const initialAuth = useAuthStore.getState();
  afterEach(() => useAuthStore.setState(initialAuth, true));

  function operatorText() {
    return screen.getByText("Operador").parentElement!.textContent;
  }

  it("mostra quem abriu o caixa, não o usuário logado", () => {
    useAuthStore.setState({ user: { id: "dono", name: "Dono Logado" } as never });
    h.register.data = {
      ...OPEN_REGISTER,
      operatorId: "op1",
      operator: { id: "op1", name: "Operador do Turno" },
    };
    render(<CashRegisterPage />);

    expect(operatorText()).toContain("Operador do Turno");
    expect(operatorText()).not.toContain("Dono Logado");
  });

  it("sem operator na resposta, usa o logado só se foi ele quem abriu", () => {
    useAuthStore.setState({ user: { id: "op1", name: "Operador Logado" } as never });
    h.register.data = { ...OPEN_REGISTER, operatorId: "op1" };
    const { unmount } = render(<CashRegisterPage />);
    expect(operatorText()).toContain("Operador Logado");
    unmount();

    h.register.data = { ...OPEN_REGISTER, operatorId: "outro" };
    render(<CashRegisterPage />);
    expect(operatorText()).not.toContain("Operador Logado");
    expect(operatorText()).toContain("—");
  });
});
