"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import ProtectedRoute from "@/components/protected-route";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamManagement, type StaffMember, type StaffRole } from "@/hooks";
import { useAuthStore } from "@/stores/auth-store";
import { canRemoveStaffMember, isManagementRole } from "@/utils/role-helpers";
import {
  Mail,
  Search,
  Trash2,
  TriangleAlert,
  UserCog,
  UserPlus,
} from "lucide-react";

// A ordem daqui é a ordem do seletor de função do convite, e as chaves são
// o StaffRoleEnum do backend - função nova entra nos dois mapas junto com o
// enum. `admin` ficou de fora de propósito (ver StaffRole).
const ROLE_LABELS: Record<StaffRole, string> = {
  manager: "Gerente",
  cook: "Cozinheiro",
  delivery: "Entregador",
  financial: "Financeiro",
};

const ROLE_BADGE_CLASSES: Record<StaffRole, string> = {
  manager: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400",
  cook: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400",
  delivery: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
  financial: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
};

function TeamManagementContent() {
  const currentUser = useAuthStore((state) => state.user);
  const canManageTeam = isManagementRole(currentUser?.role);

  // As duas variantes precisam aparecer literais no código: o Tailwind gera a
  // classe lendo o fonte, então template interpolado não viraria CSS.
  const headerGridClass = canManageTeam
    ? "grid-cols-[minmax(0,1fr)_130px_56px]"
    : "grid-cols-[minmax(0,1fr)_130px]";

  const rowGridClass = canManageTeam
    ? "md:grid-cols-[minmax(0,1fr)_130px_56px]"
    : "md:grid-cols-[minmax(0,1fr)_130px]";

  const {
    staff: filteredStaff,
    allStaff,
    searchQuery,
    setSearchQuery,
    isLoadingStaff,
    isFetchingStaff,
    isStaffError,
    staffError,
    refetchStaff,
    isModalOpen,
    formData,
    removeTarget,
    isInviting,
    isRemoving,
    handleOpenInviteModal,
    handleCloseModal,
    updateFormField,
    handleSendInvite,
    handleRequestRemove,
    handleCancelRemove,
    handleConfirmRemove,
  } = useTeamManagement();

  return (
    <AdminPageLayout
      title="Equipe"
      icon={UserCog}
      mainClassName="p-4 pb-20 sm:p-6 md:pb-10 lg:pl-[17rem] lg:pr-8"
      action={{
        label: "Atualizar",
        busyLabel: "Atualizando...",
        onClick: () => refetchStaff(),
        busy: isFetchingStaff,
      }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex h-9 w-full max-w-[340px] items-center gap-2 rounded-[8px] border border-border bg-card px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-auto min-w-0 border-0 bg-transparent p-0 text-[12.5px] font-medium text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Sem o guarda, o contador anuncia "0 membros" enquanto a lista
                ainda está carregando ou falhou - número que não é verdade. */}
            {!isLoadingStaff && !isStaffError && (
              <span className="rounded-[8px] border border-border bg-card px-2.5 py-1 text-[11.5px] font-bold text-foreground">
                {allStaff.length} {allStaff.length === 1 ? "membro" : "membros"}
              </span>
            )}
            {/* Desceu do header (LDMF-393): lá fica só o botão único. */}
            <Button
              onClick={handleOpenInviteModal}
              className="h-[34px] w-full cursor-pointer rounded-xl bg-brand-500 px-4 text-[12.5px] font-extrabold text-white shadow-[0_4px_12px_var(--tw-shadow-color)] shadow-brand-500/25 hover:bg-brand-600 sm:ml-1 sm:w-auto"
            >
              <UserPlus className="h-4 w-4" />
              Convidar Membro
            </Button>
          </div>
        </div>

        <section className="overflow-hidden rounded-[8px] border border-border bg-card">
          <div
            className={`hidden shrink-0 ${headerGridClass} items-center gap-2 border-b border-border bg-muted px-3.5 py-2.5 md:grid`}
          >
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Membro
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Função
            </span>
            {canManageTeam && (
              <span className="text-right text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">
                Ações
              </span>
            )}
          </div>

          {isLoadingStaff ? (
            <div className="divide-y divide-border">
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className={`grid gap-3 p-3.5 ${rowGridClass} md:items-center md:gap-2`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-44" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-20" />
                  {canManageTeam && (
                    <Skeleton className="ml-auto h-7 w-7 rounded-[7px]" />
                  )}
                </div>
              ))}
            </div>
          ) : isStaffError ? (
            <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[8px] bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <TriangleAlert className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-bold text-foreground">
                Não foi possível carregar a equipe
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {staffError || "Tente novamente em instantes."}
              </p>
              <Button
                variant="outline"
                onClick={() => refetchStaff()}
                className="mt-3 h-8 cursor-pointer rounded-[8px] border-border text-xs font-bold"
              >
                Tentar de novo
              </Button>
            </div>
          ) : filteredStaff.length > 0 ? (
            <div className="divide-y divide-border">
              {filteredStaff.map((member: StaffMember) => (
                <div
                  key={member.id}
                  className={`grid gap-3 p-3.5 ${rowGridClass} md:items-center md:gap-2`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-extrabold text-foreground">
                      {member.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-foreground">
                        {member.name}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        {member.email}
                      </div>
                    </div>
                  </div>

                  <div>
                    <span
                      className={`inline-flex rounded-[6px] px-2 py-0.5 text-[10.5px] font-bold ${ROLE_BADGE_CLASSES[member.role]}`}
                    >
                      {ROLE_LABELS[member.role]}
                    </span>
                  </div>

                  {canManageTeam && (
                    <div className="flex justify-end">
                      {canRemoveStaffMember(currentUser, member) ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRequestRemove(member)}
                          className="h-7 w-7 cursor-pointer rounded-[7px] bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400"
                          aria-label={`Remover ${member.name}`}
                          title="Remover"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <div className="h-7 w-7" aria-hidden="true" />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[8px] bg-brand-50 dark:bg-brand-950/40 text-brand-500">
                <UserCog className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-bold text-foreground">
                Nenhum membro encontrado
              </p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {searchQuery
                  ? "Tente outro termo de busca"
                  : "Convide o primeiro membro da equipe"}
              </p>
            </div>
          )}
        </section>
      </div>

      <Dialog open={isModalOpen} onOpenChange={handleCloseModal}>
        <DialogContent className="max-h-[90vh] rounded-[8px] p-0 sm:max-w-[440px]">
          <DialogHeader className="border-b border-border px-4 pb-3 pt-4 sm:px-6">
            <DialogTitle className="text-lg font-extrabold text-foreground">
              Convidar Membro
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-muted-foreground">
              Envie um convite por e-mail para um novo membro da equipe.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 px-4 py-4 sm:px-6">
            <div className="grid gap-1.5">
              <Label htmlFor="invite-email" className="text-xs">
                E-mail *
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={formData.email}
                onChange={(e) => updateFormField("email", e.target.value)}
                placeholder="pessoa@email.com"
                className="h-10 rounded-xl border-border text-xs focus-visible:ring-brand-200"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="invite-role" className="text-xs">
                Função *
              </Label>
              <select
                id="invite-role"
                value={formData.role}
                onChange={(e) => updateFormField("role", e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-xs font-medium text-foreground outline-none focus:border-brand-300 dark:focus:border-brand-700"
              >
                {(Object.keys(ROLE_LABELS) as StaffRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter className="border-t border-border px-4 py-3 sm:px-6">
            <Button
              variant="outline"
              onClick={handleCloseModal}
              disabled={isInviting}
              className="cursor-pointer rounded-[8px] border-border text-xs disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendInvite}
              disabled={isInviting}
              className="cursor-pointer rounded-[8px] bg-brand-500 text-xs font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isInviting ? "Enviando..." : "Enviar Convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManageTeam && (
        <AlertDialog
          open={!!removeTarget}
          onOpenChange={(open) => !open && !isRemoving && handleCancelRemove()}
        >
          <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-[8px] bg-card text-center shadow-2xl sm:w-fit">
            <div className="mx-auto mt-2 flex h-12 w-12 items-center justify-center rounded-[8px] bg-yellow-100 dark:bg-yellow-900">
              <TriangleAlert className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>

            <AlertDialogHeader className="space-y-3 px-4">
              <AlertDialogTitle className="text-center text-xl font-bold text-foreground">
                Remover da equipe?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-sm text-muted-foreground">
                <span className="block">
                  <strong className="text-foreground">
                    {removeTarget?.name}
                  </strong>{" "}
                  vai perder o acesso ao painel da empresa.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex w-full flex-row gap-3 px-4 pb-2 pt-2">
              <Button
                variant="outline"
                onClick={handleCancelRemove}
                disabled={isRemoving}
                className="h-10 flex-1 cursor-pointer rounded-[8px] border-border font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                className="h-10 flex-1 cursor-pointer rounded-[8px] bg-red-600 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRemoving ? "Removendo..." : "Remover"}
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AdminPageLayout>
  );
}

export default function TeamManagementPage() {
  return (
    <ProtectedRoute allowedRoles={["owner", "admin", "manager"]}>
      <TeamManagementContent />
    </ProtectedRoute>
  );
}
