"use client";

import { Dispatch, SetStateAction } from "react";
import { formatDate } from "@/utils";

import {
  User,
  Edit3,
  X,
  Save,
  Mail,
  IdCard,
  Phone,
  Calendar,
} from "lucide-react";

import { GradientButton } from "@/components/ui/gradient-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { FormField } from "@/components/form-field";
import { BirthDateInput } from "@/components/birth-date-input";
import { DataCard } from "@/components/data-card";
import { ErrorState } from "@/components/states";
import { UseMutationResult } from "@tanstack/react-query";
import { ApiResponse } from "@/services";

import { User as UserType } from "@/services";
import type { UpdateUserRequest } from "@/services/api";
import { Controller, UseFormReturn } from "react-hook-form";
import type { ProfileFormData } from "@/hooks";
import {
  User as PqTemDoisUserType,
  userHasCpf,
} from "@/stores/auth-store";

type SaveProfile = (data: ProfileFormData) => Promise<void>;

type ProfileForm = UseFormReturn<ProfileFormData>;

type EditingState = {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
};

type Props = {
  handleCancelEdit: () => void;
  handleSaveProfile: SaveProfile;
  user: PqTemDoisUserType;
  updateProfile: UseMutationResult<
    ApiResponse<UserType>,
    Error,
    Partial<UpdateUserRequest>,
    unknown
  >;
  profileForm: ProfileForm;
  editingState: EditingState;
};

export function PersonalInformation({
  handleCancelEdit,
  handleSaveProfile,
  updateProfile,
  profileForm,
  editingState,
  user,
}: Props) {
  return (
    <DataCard
      title="Informações Pessoais"
      icon={<User className="h-5 w-5" />}
      actions={
        !editingState.isOpen ? (
          <Button
            variant="outline"
            size="sm"
            onClick={editingState.open}
            className="rounded-xl border-border"
          >
            <Edit3 className="h-4 w-4 mr-2" />
            Editar
          </Button>
        ) : (
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEdit}
              className="rounded-xl border-border"
              disabled={updateProfile.isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <GradientButton
              size="sm"
              onClick={profileForm.handleSubmit(handleSaveProfile)}
              isLoading={updateProfile.isPending}
              loadingText="Salvando..."
            >
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </GradientButton>
          </div>
        )
      }
    >
      {updateProfile.isError && (
        <ErrorState
          message="Erro ao atualizar perfil. Tente novamente."
          retry={() => updateProfile.reset()}
        />
      )}

      <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          label="Nome Completo"
          id="name"
          icon={<User className="h-4 w-4" />}
          error={profileForm.formState.errors.name?.message}
          inputProps={{
            ...profileForm.register("name"),
            disabled: !editingState.isOpen,
          }}
        />

        <FormField
          label="Email (não editável)"
          id="email"
          icon={<Mail className="h-4 w-4" />}
          inputProps={{
            ...profileForm.register("email"),
            disabled: true,
            className: "pl-10 bg-muted text-muted-foreground",
          }}
        />

        {/* O back não devolve o número do CPF, só se a conta tem um
            (LDMF-362). Por isso o campo vem vazio e o aviso diz o estado. */}
        <div className="space-y-1">
          <FormField
            label="CPF"
            id="cpf"
            icon={<IdCard className="h-4 w-4" />}
            error={profileForm.formState.errors.cpf?.message}
            inputProps={{
              ...profileForm.register("cpf"),
              disabled: !editingState.isOpen,
              maxLength: 14,
              placeholder: "000.000.000-00",
              "aria-describedby": "cpf-status",
            }}
          />
          <p id="cpf-status" className="text-xs text-muted-foreground">
            {userHasCpf(user)
              ? editingState.isOpen
                ? "CPF cadastrado na sua conta. Para trocar, digite o novo CPF; em branco, ele continua o mesmo."
                : "CPF cadastrado na sua conta."
              : "Nenhum CPF cadastrado na sua conta."}
          </p>
        </div>

        <FormField
          label="Telefone"
          id="phone"
          icon={<Phone className="h-4 w-4" />}
          error={profileForm.formState.errors.phone?.message}
          inputProps={{
            ...profileForm.register("phone"),
            disabled: !editingState.isOpen,
            maxLength: 15,
          }}
        />

        <FormField
          label="Data de Nascimento"
          id="birthDate"
          // Em edição o BirthDateInput traz o próprio ícone e a mensagem de erro
          icon={editingState.isOpen ? undefined : <Calendar className="h-4 w-4" />}
        >
          {editingState.isOpen ? (
            <Controller
              control={profileForm.control}
              name="birthDate"
              render={({ field, fieldState }) => (
                <BirthDateInput
                  id="birthDate"
                  name={field.name}
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  showIncompleteError={profileForm.formState.isSubmitted}
                />
              )}
            />
          ) : (
            <Input
              id="birthDate"
              value={formatDate(user.birthDate)}
              disabled
              className="pl-10 rounded-xl border-2 border-border bg-muted"
            />
          )}
        </FormField>
      </form>
    </DataCard>
  );
}
