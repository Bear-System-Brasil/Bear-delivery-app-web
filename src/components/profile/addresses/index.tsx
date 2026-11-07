"use client";

import { Dispatch, SetStateAction } from "react";
import { UseFormReturn } from "react-hook-form";
import { AddressFormData } from "@/hooks";
import type {
  CoordinateSource,
  SourcedCoords,
} from "@/lib/address-coordinates";
import { Coords } from "@/types/restaurant";
import { MapPin, Plus, Star, X, Pencil } from "lucide-react";
import { GradientButton } from "@/components/ui/gradient-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataCard } from "@/components/data-card";
import {
  DeliveryForm,
  type AddressFieldProps,
  type NeighborhoodOption,
  type PinStatusProps,
} from "../delivery-form";
import { cn } from "@/lib/utils";
import { formatCep } from "@/utils";

type AddingAddressState = {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
};

export type AddressForm = UseFormReturn<
  {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    type?: string | undefined;
    complement?: string | undefined;
    reference?: string | undefined;
    longitude?: number | undefined;
    latitude?: number | undefined;
    isDefault?: boolean | undefined;
  },
  any,
  {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    type?: string | undefined;
    complement?: string | undefined;
    reference?: string | undefined;
    longitude?: number | undefined;
    latitude?: number | undefined;
    isDefault?: boolean | undefined;
  }
>;

export type HandleAddAddress = (data: {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  type?: string | undefined;
  complement?: string | undefined;
  reference?: string | undefined;
  longitude?: number | undefined;
  latitude?: number | undefined;
  isDefault?: boolean | undefined;
}) => Promise<void>;

interface Address extends AddressFormData {
  id: string;
  type?: string;
}

type Props = {
  handleDeleteAddress: (addressId: string) => Promise<void>;
  handleSetDefaultAddress: (addressId: string) => Promise<void>;
  settingDefaultAddressId: string | null;
  handleCloseAddressModal: () => void;
  handleAddAddress: HandleAddAddress;
  handleEditAddress: (address: Address) => void;
  applyCoords: (coords: Coords | null, source: CoordinateSource) => void;
  addressForm: AddressForm;
  addressCoords: SourcedCoords | null;
  addingAddressState: AddingAddressState;
  isLoadingAddresses: boolean;
  isSavingAddress: boolean;
  addresses: Address[];
  isLoadingCep: boolean;
  zipCodeHint?: string | null;
  editingAddressId?: string | null;
  neighborhoodOptions?: NeighborhoodOption[] | null;
  isLocatingPin?: boolean;
  /** Ver `AddressCoreFields`: endereço que tem que ser o padrão (LDMF-262). */
  defaultOptionLockedHint?: string | null;
  addressFieldProps: AddressFieldProps;
  pinStatusProps?: PinStatusProps;
};

export function Addresses({
  handleDeleteAddress,
  handleCloseAddressModal,
  handleAddAddress,
  handleEditAddress,
  handleSetDefaultAddress,
  settingDefaultAddressId,
  applyCoords,
  addingAddressState,
  isLoadingAddresses,
  isSavingAddress,
  isLoadingCep,
  zipCodeHint = null,
  addressForm,
  addressCoords,
  addresses,
  editingAddressId,
  neighborhoodOptions,
  isLocatingPin,
  defaultOptionLockedHint = null,
  addressFieldProps,
  pinStatusProps,
}: Props) {
  return (
    <DataCard
      title="Meus Endereços"
      icon={<MapPin className="h-5 w-5" />}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={addingAddressState.open}
          className="rounded-xl border-border"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar
        </Button>
      }
    >
      {isLoadingAddresses ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : !Array.isArray(addresses) || addresses.length === 0 ? (
        <div
          className={cn(
            "text-center py-8",
            addingAddressState.isOpen ? "hidden" : "block",
          )}
        >
          <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Nenhum endereço cadastrado</p>
          <GradientButton onClick={addingAddressState.open}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Primeiro Endereço
          </GradientButton>
        </div>
      ) : (
        <div className="space-y-4">
          {/* O padrão primeiro: é o que vale para entrega e para a home. */}
          {[...addresses]
            .sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault))
            .map((address) => (
            <div
              key={address.id}
              className="border border-border rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-4">
                {/* Sem o selo "Endereço" repetido em todo cartão: só o
                    padrão ganha selo. */}
                <div className="flex items-center space-x-2">
                  {address.isDefault && (
                    <Badge className="bg-linear-to-r from-brand-500 to-brand-500 text-white border-0 text-xs flex items-center gap-1">
                      <Star className="h-3 w-3 fill-current" />
                      Padrão
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {/* Sem isto, escolher o padrão exigia abrir "Editar" e
                      salvar o endereço inteiro de novo, passando por
                      validações que não têm relação nenhuma com o padrão. */}
                  {!address.isDefault && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefaultAddress(address.id)}
                      disabled={settingDefaultAddressId === address.id}
                      className="text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                      aria-label="Tornar endereço padrão"
                      title="Tornar endereço padrão"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditAddress(address)}
                    className="text-muted-foreground hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/40"
                    aria-label="Editar endereço"
                    title="Editar endereço"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAddress(address.id)}
                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                    title="Excluir endereço"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  {address.street}, {address.number}
                  {address.complement && ` - ${address.complement}`}
                </p>
                <p>
                  {address.neighborhood} - {address.city}/{address.state}
                </p>
                <p>CEP: {formatCep(address.zipCode ?? "")}</p>
                {address.reference && <p>Referência: {address.reference}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {addingAddressState.isOpen && (
        <DeliveryForm
          // Em cidade pequena, "casa amarela ao lado da igreja" é o que
          // mais ajuda o entregador (o back guarda em `reference`).
          showReference
          handleCloseAddressModal={handleCloseAddressModal}
          handleAddAddress={handleAddAddress}
          applyCoords={applyCoords}
          isSavingAddress={isSavingAddress}
          addressForm={addressForm}
          addressCoords={addressCoords}
          isLoadingCep={isLoadingCep}
          zipCodeHint={zipCodeHint}
          isEditing={!!editingAddressId}
          neighborhoodOptions={neighborhoodOptions}
          isLocatingPin={isLocatingPin}
          defaultOptionLockedHint={defaultOptionLockedHint}
          {...addressFieldProps}
          {...pinStatusProps}
        />
      )}
    </DataCard>
  );
}
