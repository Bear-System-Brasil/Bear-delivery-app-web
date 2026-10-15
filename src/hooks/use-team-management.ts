import {
  apiService,
  type CompanyStaffMember,
  type InviteStaffRequest,
  type StaffRole,
} from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

// O tipo mora em services/api.ts, junto do contrato de POST /company/invite.
// Reexportado aqui porque a tela importa de "@/hooks".
export type { StaffRole };

/**
 * Mensagem por status quando o backend não manda uma própria. `apiRequest`
 * preenche `message` com "Erro 409: Conflict" nesse caso, o que não ajuda
 * ninguém na tela - daí o regex que detecta esse texto genérico.
 */
const INVITE_ERROR_BY_STATUS: Record<number, string> = {
  400: "Convite inválido. Confira o e-mail e a função selecionada.",
  403: "Você não tem permissão para convidar membros para esta equipe.",
  409: "Esse e-mail já está na equipe ou já tem um convite pendente.",
};

const GENERIC_API_MESSAGE = /^Erro \d+:/;

/**
 * Escolhe o que mostrar quando o convite falha: a mensagem do backend tem
 * prioridade, o mapa por status cobre quando ela veio genérica ou nem veio,
 * e o texto final é a rede de segurança (ex.: falha de conexão, sem status).
 */
export function resolveInviteErrorMessage(response: {
  message?: string;
  status?: number;
}): string {
  const fromBackend =
    response.message && !GENERIC_API_MESSAGE.test(response.message)
      ? response.message
      : undefined;
  const byStatus = response.status
    ? INVITE_ERROR_BY_STATUS[response.status]
    : undefined;

  return fromBackend || byStatus || "Não foi possível enviar o convite";
}

const REMOVE_ERROR_MESSAGES: Record<string, string> = {
  CANNOT_REMOVE_YOURSELF: "Você não pode remover a si mesmo da equipe.",
  CANNOT_REMOVE_OWNER: "Não é possível remover o proprietário da equipe.",
  INSUFFICIENT_ROLE_TO_REMOVE:
    "Você não tem permissão para remover este membro da equipe.",
  STAFF_HAS_OPEN_CASH_REGISTER:
    "Não é possível remover: o membro possui um caixa aberto.",
  STAFF_HAS_ACTIVE_DELIVERY:
    "Não é possível remover: o membro possui uma entrega em andamento.",
  STAFF_NOT_FOUND: "Membro não encontrado na equipe.",
  COMPANY_ID_REQUIRED: "Empresa não informada.",
};

const REMOVE_ERROR_BY_STATUS: Record<number, string> = {
  400: "Não foi possível remover o membro da equipe.",
  403: "Você não tem permissão para remover este membro da equipe.",
  404: "Membro não encontrado na equipe.",
  409: "Não é possível remover o membro com atividades em andamento.",
};

/**
 * Mapeia mensagens de erro da remoção de membro (DELETE /company/staff/:userId).
 */
export function resolveRemoveStaffErrorMessage(response: {
  message?: string;
  status?: number;
}): string {
  if (response.message) {
    if (REMOVE_ERROR_MESSAGES[response.message]) {
      return REMOVE_ERROR_MESSAGES[response.message];
    }
    if (!GENERIC_API_MESSAGE.test(response.message)) {
      return response.message;
    }
  }
  if (response.status && REMOVE_ERROR_BY_STATUS[response.status]) {
    return REMOVE_ERROR_BY_STATUS[response.status];
  }
  return "Não foi possível remover o membro da equipe";
}


/**
 * Membro como a tela usa. Só tem o que GET /company/staff devolve: a rota
 * não manda status nem data de convite, então a tela não mostra nenhum dos
 * dois em vez de inventar valor.
 */
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

interface InviteFormData {
  email: string;
  role: StaffRole;
}

const emptyInvite: InviteFormData = { email: "", role: "cook" };

export const STAFF_QUERY_KEY = ["company", "staff"] as const;

/**
 * Achata a resposta de GET /company/staff no formato da tela.
 *
 * A rota responde array cru - se vier outra coisa, devolve lista vazia em
 * vez de estourar `.map is not a function` no render. Linha sem `user.id` é
 * descartada: sem chave estável não dá para renderizar nem remover.
 */
export function toStaffMembers(data: unknown): StaffMember[] {
  if (!Array.isArray(data)) return [];

  return (data as CompanyStaffMember[])
    .filter((entry) => entry?.user?.id)
    .map((entry) => ({
      id: entry.user.id,
      name: entry.user.name || entry.user.email || "Sem nome",
      email: entry.user.email || "",
      // `staffRole` e não `user.role`: é o campo que o convite define.
      role: entry.staffRole,
    }));
}

/**
 * Hook para gerenciar a equipe da empresa.
 *
 * Listagem, convite e remoção são reais:
 * - GET /company/staff
 * - POST /company/invite
 * - DELETE /company/staff/:userId (LDMF-231)
 */
export const useTeamManagement = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<InviteFormData>(emptyInvite);
  const [removeTarget, setRemoveTarget] = useState<StaffMember | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: staff = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: STAFF_QUERY_KEY,
    queryFn: async () => {
      const response = await apiService.companies.getStaff();
      if (!response.success) {
        throw new Error(response.message || "Erro ao carregar a equipe");
      }
      return toStaffMembers(response.data);
    },
    staleTime: 60_000,
  });

  const filteredStaff = useMemo(
    () =>
      staff.filter(
        (member) =>
          member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          member.email.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [staff, searchQuery],
  );

  const handleOpenInviteModal = () => {
    setFormData(emptyInvite);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData(emptyInvite);
  };

  const updateFormField = (field: keyof InviteFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteStaffRequest) => {
      const response = await apiService.companies.invite(data);
      if (!response.success) {
        throw new Error(resolveInviteErrorMessage(response));
      }
      return response.data;
    },
    onSuccess: (_invite, variables) => {
      // O eco local do convidado saiu daqui: a lista agora é do servidor, e
      // uma linha "pendente" montada no cliente exigiria um status que a
      // rota não devolve. Recarrega e mostra o que o backend tiver - se ele
      // só lista quem já aceitou, o convidado aparece quando aceitar.
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
      toast.success(`Convite enviado para ${variables.email}`);
      handleCloseModal();
    },
    onError: (error: Error) =>
      toast.error(error.message || "Não foi possível enviar o convite"),
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiService.companies.removeStaff(userId);
      if (!response.success) {
        throw new Error(resolveRemoveStaffErrorMessage(response));
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STAFF_QUERY_KEY });
      toast.success(
        removeTarget?.name
          ? `${removeTarget.name} removido da equipe`
          : "Membro removido da equipe",
      );
      setRemoveTarget(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Não foi possível remover o membro da equipe");
      setRemoveTarget(null);
    },
  });

  // A checagem de duplicado saiu daqui de propósito: ela só enxergava o mock
  // local, e quem sabe de verdade quem já foi convidado é o backend - que
  // responde 409 nesse caso.
  const handleSendInvite = () => {
    const email = formData.email.trim();
    if (!email) {
      toast.error("Informe o e-mail do convidado");
      return;
    }

    // `role` no formulário, `staffRole` no corpo - é o nome que o DTO valida.
    inviteMutation.mutate({ email, staffRole: formData.role });
  };

  const handleRequestRemove = (member: StaffMember) => {
    setRemoveTarget(member);
  };

  const handleCancelRemove = () => {
    if (removeMutation.isPending) return;
    setRemoveTarget(null);
  };

  const handleConfirmRemove = () => {
    if (!removeTarget || removeMutation.isPending) return;
    removeMutation.mutate(removeTarget.id);
  };

  return {
    staff: filteredStaff,
    allStaff: staff,
    searchQuery,
    setSearchQuery,

    isLoadingStaff: isLoading,
    isStaffError: isError,
    staffError: error instanceof Error ? error.message : null,
    refetchStaff: refetch,

    isModalOpen,
    formData,
    removeTarget,
    isInviting: inviteMutation.isPending,
    isRemoving: removeMutation.isPending,

    handleOpenInviteModal,
    handleCloseModal,
    updateFormField,
    handleSendInvite,
    handleRequestRemove,
    handleCancelRemove,
    handleConfirmRemove,
  };
};
