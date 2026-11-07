"use client";

import { toast } from "sonner";

import { AddressCoreFields } from "@/components/profile/delivery-form/address-core-fields";
import { Button } from "@/components/ui/button";
import { SheetTitle } from "@/components/ui/sheet";
import { useAddressEditor } from "@/hooks/use-address-editor";
import {
  isNoNumber,
  type AddressFormData,
} from "@/hooks/use-form-validation";
import { cn } from "@/lib/utils";
import { useState } from "react";

export const ADDRESS_LABELS = ["Casa", "Trabalho", "Outro"] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

/** O que o header grava no cookie `userLocation` quando o cliente salva. */
export interface SavedDeliveryLocation {
  lat: number;
  lng: number;
  city: string;
  /** Endereço formatado pra exibir ("R. X, 304 - Bairro, Cidade - UF"). */
  address: string;
  label: AddressLabel;
}

type AddressText = Pick<
  AddressFormData,
  "street" | "number" | "neighborhood" | "city" | "state"
>;

const LABEL_CLASS = "text-sm font-medium";

export function formatDeliveryAddress(fields: AddressText, noNumber: boolean) {
  // "R. Machado de Assis, 304 - Santo Andrezinho, Castelo - ES"
  const streetLine = [fields.street, noNumber ? "s/n" : fields.number]
    .filter(Boolean)
    .join(", ");
  const cityLine = [fields.city, fields.state].filter(Boolean).join(" - ");
  const tail = [fields.neighborhood, cityLine].filter(Boolean).join(", ");

  return [streetLine, tail].filter(Boolean).join(" - ");
}

type Props = {
  onSave: (location: SavedDeliveryLocation) => void;
};

/**
 * Formulário "Seu endereço" da gaveta de entrega da home. Usa o núcleo de
 * endereço (LDMF-260), o mesmo do perfil e da loja: CEP (opcional) → Estado
 * → Cidade → Bairro → Rua → Número, e o pino no mapa. A coordenada salva no
 * cookie é a do pino - a home filtra as lojas por raio a partir dela.
 *
 * Não grava nada no backend: só o cookie `userLocation`, como antes.
 */
export function DeliveryAddressForm({ onSave }: Props) {
  const [label, setLabel] = useState<AddressLabel>("Casa");
  // O componente só existe com a gaveta aberta no modo de troca.
  const editor = useAddressEditor({ enabled: true, zipCodeOptional: true });
  const { addressForm } = editor;

  const handleSave = (data: AddressFormData) => {
    const pin = editor.getPinForSave(data);
    if (!pin) return;

    onSave({
      lat: pin.lat,
      lng: pin.lng,
      city: data.city.trim(),
      address: formatDeliveryAddress(
        {
          street: data.street.trim(),
          number: data.number.trim(),
          neighborhood: data.neighborhood.trim(),
          city: data.city.trim(),
          state: data.state.trim().toUpperCase(),
        },
        isNoNumber(data.number),
      ),
      label,
    });
  };

  return (
    <form
      onSubmit={addressForm.handleSubmit(handleSave, (errors) => {
        const firstError = Object.values(errors)[0];
        toast.error(
          firstError?.message || "Verifique os campos obrigatórios do endereço",
        );
      })}
      noValidate
      className="mx-auto w-full max-w-xl space-y-4"
    >
      <div className="space-y-1">
        <SheetTitle className="text-xl font-extrabold tracking-tight text-foreground">
          Seu endereço
        </SheetTitle>
        <p className="text-[13px] text-muted-foreground">
          Comece pelo CEP ou escolha estado e cidade
        </p>
      </div>

      <AddressCoreFields
        addressForm={addressForm}
        applyCoords={editor.applyCoords}
        addressCoords={editor.addressCoords}
        isLoadingCep={editor.isLoadingCep}
        zipCodeHint={editor.zipCodeHint}
        neighborhoodOptions={editor.neighborhoodOptions}
        isLocatingPin={editor.isLocatingPin}
        stateOptions={editor.stateOptions}
        cityOptions={editor.cityOptions}
        isLoadingCities={editor.isLoadingCities}
        citiesError={editor.citiesError}
        fieldLocks={editor.fieldLocks}
        onStateChange={editor.changeState}
        onCityChange={editor.changeCity}
        onNeighborhoodChange={editor.changeNeighborhood}
        isOtherNeighborhood={editor.isOtherNeighborhood}
        isLoadingNeighborhoods={editor.isLoadingNeighborhoods}
        onSelectOtherNeighborhood={editor.selectOtherNeighborhood}
        onOtherNeighborhoodChange={editor.changeOtherNeighborhood}
        isSearchingAddress={editor.isSearchingAddress}
        addressNotFound={editor.addressNotFound}
        streetSuggestion={editor.streetSuggestion}
        onAcceptStreetSuggestion={editor.acceptStreetSuggestion}
        onDismissStreetSuggestion={editor.dismissStreetSuggestion}
        pinZoom={editor.pinZoom}
        pinRecenterKey={editor.pinRecenterKey}
        zipCodeRequired={false}
        // Complemento e padrão não vão para o cookie: não mostra.
        showComplement={false}
        showDefaultOption={false}
        placeLabel="posição certa"
      />

      <fieldset className="space-y-2">
        <legend className={LABEL_CLASS}>Salvar como</legend>
        <div className="grid grid-cols-3 gap-2">
          {ADDRESS_LABELS.map((option) => {
            const isActive = option === label;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={isActive}
                onClick={() => setLabel(option)}
                className={cn(
                  "h-11 rounded-full border text-sm font-semibold transition-colors",
                  isActive
                    ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400"
                    : "border-border bg-card text-foreground hover:border-orange-200 dark:hover:border-orange-800",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Button
        type="submit"
        disabled={editor.isLoadingCep}
        className="h-12 w-full rounded-xl bg-orange-500 text-[15px] font-bold text-white hover:bg-orange-600"
      >
        Salvar endereço
      </Button>
    </form>
  );
}
