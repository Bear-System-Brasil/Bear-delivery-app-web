import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { apiService } from "@/services/api";
import {
  resolveRemoveStaffErrorMessage,
  toStaffMembers,
  useTeamManagement,
} from "./use-team-management";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      ...actual.apiService,
      companies: {
        ...actual.apiService.companies,
        getStaff: vi.fn(),
        removeStaff: vi.fn(),
      },
    },
  };
});

const entry = {
  user: {
    id: "u-1",
    name: "Mamaco",
    email: "mamaco@c.com",
    role: "cook",
  },
  companyId: "c-1",
  staffRole: "cook" as const,
};

describe("toStaffMembers", () => {
  it("achata a resposta de GET /company/staff", () => {
    expect(toStaffMembers([entry])).toEqual([
      { id: "u-1", name: "Mamaco", email: "mamaco@c.com", role: "cook" },
    ]);
  });

  it("usa staffRole como função, não user.role", () => {
    const promovido = {
      ...entry,
      user: { ...entry.user, role: "cook" },
      staffRole: "manager" as const,
    };

    expect(toStaffMembers([promovido])[0].role).toBe("manager");
  });

  it("devolve lista vazia quando a resposta não é array", () => {
    // Sem isso a tela estourava ".map is not a function" no render.
    expect(toStaffMembers(undefined)).toEqual([]);
    expect(toStaffMembers(null)).toEqual([]);
    expect(toStaffMembers({ data: [entry] })).toEqual([]);
  });

  it("descarta linha sem user.id, que não tem chave estável", () => {
    const semId = { ...entry, user: { ...entry.user, id: "" } };

    expect(toStaffMembers([semId, entry])).toHaveLength(1);
    expect(toStaffMembers([null, undefined, entry])).toHaveLength(1);
  });

  it("cai no e-mail quando o nome vem vazio", () => {
    const semNome = { ...entry, user: { ...entry.user, name: "" } };

    expect(toStaffMembers([semNome])[0].name).toBe("mamaco@c.com");
  });
});

describe("resolveRemoveStaffErrorMessage", () => {
  it("mapeia códigos de erro específicos do backend para mensagens amigáveis", () => {
    expect(
      resolveRemoveStaffErrorMessage({ message: "CANNOT_REMOVE_YOURSELF" }),
    ).toBe("Você não pode remover a si mesmo da equipe.");

    expect(
      resolveRemoveStaffErrorMessage({ message: "CANNOT_REMOVE_OWNER" }),
    ).toBe("Não é possível remover o proprietário da equipe.");

    expect(
      resolveRemoveStaffErrorMessage({ message: "INSUFFICIENT_ROLE_TO_REMOVE" }),
    ).toBe("Você não tem permissão para remover este membro da equipe.");

    expect(
      resolveRemoveStaffErrorMessage({ message: "STAFF_HAS_OPEN_CASH_REGISTER" }),
    ).toBe("Não é possível remover: o membro possui um caixa aberto.");

    expect(
      resolveRemoveStaffErrorMessage({ message: "STAFF_HAS_ACTIVE_DELIVERY" }),
    ).toBe("Não é possível remover: o membro possui uma entrega em andamento.");

    expect(
      resolveRemoveStaffErrorMessage({ message: "STAFF_NOT_FOUND" }),
    ).toBe("Membro não encontrado na equipe.");

    expect(
      resolveRemoveStaffErrorMessage({ message: "COMPANY_ID_REQUIRED" }),
    ).toBe("Empresa não informada.");
  });

  it("usa mensagem vinda do backend quando não for genérica de status", () => {
    expect(
      resolveRemoveStaffErrorMessage({ message: "O membro possui pedidos vinculados" }),
    ).toBe("O membro possui pedidos vinculados");
  });

  it("cai no mapa por status HTTP quando a mensagem for genérica ou ausente", () => {
    expect(
      resolveRemoveStaffErrorMessage({ message: "Erro 403: Forbidden", status: 403 }),
    ).toBe("Você não tem permissão para remover este membro da equipe.");

    expect(
      resolveRemoveStaffErrorMessage({ message: "Erro 409: Conflict", status: 409 }),
    ).toBe("Não é possível remover o membro com atividades em andamento.");

    expect(
      resolveRemoveStaffErrorMessage({ status: 404 }),
    ).toBe("Membro não encontrado na equipe.");
  });

  it("devolve mensagem padrão de segurança quando nada estiver definido", () => {
    expect(resolveRemoveStaffErrorMessage({})).toBe(
      "Não foi possível remover o membro da equipe",
    );
  });
});

describe("useTeamManagement - remoção de membro", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.mocked(apiService.companies.getStaff).mockResolvedValue({
      success: true,
      data: [entry],
      status: 200,
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  it("abre e cancela o diálogo de remoção atualizando removeTarget", async () => {
    const { result } = renderHook(() => useTeamManagement(), { wrapper });

    await waitFor(() => expect(result.current.isLoadingStaff).toBe(false));

    act(() => {
      result.current.handleRequestRemove({
        id: "u-1",
        name: "Mamaco",
        email: "mamaco@c.com",
        role: "cook",
      });
    });

    expect(result.current.removeTarget?.id).toBe("u-1");

    act(() => {
      result.current.handleCancelRemove();
    });

    expect(result.current.removeTarget).toBeNull();
  });

  it("chama DELETE /company/staff/:userId com sucesso e invalida a query de equipe", async () => {
    vi.mocked(apiService.companies.removeStaff).mockResolvedValue({
      success: true,
      data: { id: "u-1", removed: true },
      status: 200,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useTeamManagement(), { wrapper });

    await waitFor(() => expect(result.current.isLoadingStaff).toBe(false));

    act(() => {
      result.current.handleRequestRemove({
        id: "u-1",
        name: "Mamaco",
        email: "mamaco@c.com",
        role: "cook",
      });
    });

    act(() => {
      result.current.handleConfirmRemove();
    });

    await waitFor(() => {
      expect(apiService.companies.removeStaff).toHaveBeenCalledWith("u-1");
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["company", "staff"] });
      expect(toast.success).toHaveBeenCalledWith("Mamaco removido da equipe");
      expect(result.current.removeTarget).toBeNull();
    });
  });

  it("exibe mensagem amigável e fecha modal em caso de falha na rota sem remover localmente", async () => {
    vi.mocked(apiService.companies.removeStaff).mockResolvedValue({
      success: false,
      message: "STAFF_HAS_OPEN_CASH_REGISTER",
      status: 409,
    });

    const { result } = renderHook(() => useTeamManagement(), { wrapper });

    await waitFor(() => expect(result.current.isLoadingStaff).toBe(false));

    act(() => {
      result.current.handleRequestRemove({
        id: "u-1",
        name: "Mamaco",
        email: "mamaco@c.com",
        role: "cook",
      });
    });

    act(() => {
      result.current.handleConfirmRemove();
    });

    await waitFor(() => {
      expect(apiService.companies.removeStaff).toHaveBeenCalledWith("u-1");
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Não é possível remover: o membro possui um caixa aberto.",
      );
      expect(result.current.removeTarget).toBeNull();
      // O membro permanece na lista de equipe
      expect(result.current.staff).toHaveLength(1);
    });
  });
});


