"use client";

import { Save } from "lucide-react";
import { GradientButton } from "@/components/ui/gradient-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { HandleAddAddress } from "@/components/profile/addresses";
import { toast } from "sonner";
import {
  AddressCoreFields,
  type AddressCoreFieldsProps,
} from "./address-core-fields";

export type {
  AddressFieldProps,
  NeighborhoodOption,
  PinStatusProps,
} from "./address-core-fields";

type Props = AddressCoreFieldsProps & {
  handleCloseAddressModal: () => void;
  handleAddAddress: HandleAddAddress;
  isSavingAddress: boolean;
  isEditing?: boolean;
};

/**
 * Modal de endereço do perfil do cliente e da loja: os campos do núcleo
 * (`AddressCoreFields`) dentro de uma janela, com Cancelar e Salvar.
 */
export function DeliveryForm({
  handleCloseAddressModal,
  handleAddAddress,
  isSavingAddress,
  isEditing = false,
  ...coreFields
}: Props) {
  const { addressForm } = coreFields;

  return (
    <Dialog open onOpenChange={(open) => !open && handleCloseAddressModal()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        // Sem foco automático no CEP: no celular o teclado abria na hora e
        // cobria metade do modal, num campo que quase ninguém sabe e que o
        // app preenche sozinho. O foco fica na janela (Tab segue funcionando).
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Endereço" : "Adicionar Novo Endereço"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={addressForm.handleSubmit(handleAddAddress, (errors) => {
            const firstError = Object.values(errors)[0];
            toast.error(
              firstError?.message ||
                "Verifique os campos obrigatórios do endereço",
            );
          })}
          className="space-y-4"
        >
          <AddressCoreFields {...coreFields} />

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseAddressModal}
              disabled={isSavingAddress}
            >
              Cancelar
            </Button>
            <GradientButton
              type="submit"
              isLoading={isSavingAddress}
              loadingText={isEditing ? "Atualizando..." : "Salvando..."}
              disabled={isSavingAddress}
            >
              <Save className="h-4 w-4 mr-2" />
              {isEditing ? "Atualizar Endereço" : "Salvar Endereço"}
            </GradientButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
