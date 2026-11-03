"use client";

import { formatCep } from "@/utils";
import { Search, Save } from "lucide-react";
import { GradientButton } from "@/components/ui/gradient-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AddressForm, HandleAddAddress } from "@/components/profile/addresses";
import { AddressMap } from "@/components/address-map";
import type {
  CoordinateSource,
  SourcedCoords,
} from "@/lib/address-coordinates";
import type { AddressFieldLocks } from "@/hooks/use-address-fields";
import { isNoNumber, NO_NUMBER } from "@/hooks/use-form-validation";
import type { IbgeState } from "@/services/ibge";
import { Coords } from "@/types/restaurant";
import { toast } from "sonner";

/** Bairro da lista: `value` é o nome oficial, `label` o texto exibido. */
export type NeighborhoodOption = { value: string; label: string };

/** Estado do pino no mapa (vem de `useProfileManagement`). */
export type PinStatusProps = {
  isSearchingAddress?: boolean;
  addressNotFound?: boolean;
  pinZoom?: number;
  pinRecenterKey?: number;
};

/** Ordem, trava e opções dos campos (vem de `useAddressFields`). */
export type AddressFieldProps = {
  stateOptions: IbgeState[];
  /** Municípios do estado; `null` enquanto carrega ou se o IBGE falhar. */
  cityOptions: string[] | null;
  isLoadingCities?: boolean;
  citiesError?: boolean;
  fieldLocks: AddressFieldLocks;
  onStateChange: (uf: string) => void;
  onCityChange: (city: string) => void;
  onNeighborhoodChange: (neighborhood: string) => void;
  /** Bairro em "Outro": a lista mostra "Outro" e aparece o campo de texto. */
  isOtherNeighborhood?: boolean;
  onSelectOtherNeighborhood?: () => void;
  onOtherNeighborhoodChange?: (neighborhood: string) => void;
};

/** Valor da opção "Outro" na lista (nunca é salvo). */
const OTHER_NEIGHBORHOOD = "__outro__";

type Props = AddressFieldProps & PinStatusProps & {
  handleCloseAddressModal: () => void;
  handleAddAddress: HandleAddAddress;
  applyCoords: (coords: Coords | null, source: CoordinateSource) => void;
  addressForm: AddressForm;
  addressCoords: SourcedCoords | null;
  isSavingAddress: boolean;
  isLoadingCep: boolean;
  isEditing?: boolean;
  /** Bairros oficiais da cidade; `null` = cidade sem lista (campo livre). */
  neighborhoodOptions?: NeighborhoodOption[] | null;
  isLocatingPin?: boolean;
  /** Mostra o campo "Referência" (endereço da loja). */
  showReference?: boolean;
  /** Mostra a caixa "Definir como endereço padrão". A loja não mostra: o
   *  endereço dela é sempre o padrão (LDMF-263). */
  showDefaultOption?: boolean;
  /** Onde o pino deve ficar, nos textos do mapa ("sua casa", "sua loja"). */
  placeLabel?: string;
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/** Lista de opções que sempre inclui o valor atual (carregando ou legado). */
function withCurrent(options: string[], current: string) {
  return current && !options.includes(current) ? [current, ...options] : options;
}

export function DeliveryForm({
  handleCloseAddressModal,
  handleAddAddress,
  applyCoords,
  addressForm,
  addressCoords,
  isSavingAddress,
  isLoadingCep,
  isEditing = false,
  neighborhoodOptions = null,
  isLocatingPin = false,
  showReference = false,
  showDefaultOption = true,
  placeLabel = "sua casa",
  stateOptions,
  cityOptions,
  isLoadingCities = false,
  citiesError = false,
  fieldLocks,
  onStateChange,
  onCityChange,
  onNeighborhoodChange,
  isOtherNeighborhood = false,
  onSelectOtherNeighborhood,
  onOtherNeighborhoodChange,
  isSearchingAddress = false,
  addressNotFound = false,
  pinZoom,
  pinRecenterKey,
}: Props) {
  const [currentState, currentCity, currentNeighborhood, currentNumber] =
    addressForm.watch(["state", "city", "neighborhood", "number"]);
  const errors = addressForm.formState.errors;
  // "Sem número" é o próprio valor S/N no campo: endereço salvo assim já abre
  // com a caixa marcada, e trocar rua/bairro (que limpa o número) desmarca.
  const noNumber = isNoNumber(currentNumber);

  const setNoNumber = (checked: boolean) =>
    addressForm.setValue("number", checked ? NO_NUMBER : "", {
      shouldValidate: true,
      shouldDirty: true,
    });

  return (
    <Dialog open onOpenChange={(open) => !open && handleCloseAddressModal()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CEP */}
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="address-zipcode" className="text-sm font-medium">
                CEP *
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="address-zipcode"
                  {...addressForm.register("zipCode")}
                  placeholder="00000-000"
                  maxLength={9}
                  className="pl-10"
                  onChange={(e) => {
                    const formatted = formatCep(e.target.value);
                    addressForm.setValue("zipCode", formatted, {
                      shouldValidate: true,
                    });
                  }}
                  disabled={isLoadingCep}
                />
                {isLoadingCep && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {addressForm.formState.errors.zipCode && (
                <p className="text-sm text-destructive">
                  {addressForm.formState.errors.zipCode.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Digite o CEP e os campos serão preenchidos automaticamente
              </p>
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <label htmlFor="address-state" className="text-sm font-medium">
                Estado *
              </label>
              <select
                id="address-state"
                value={currentState ?? ""}
                onChange={(e) => onStateChange(e.target.value)}
                className={selectClass}
              >
                <option value="">Selecione o estado</option>
                {currentState &&
                  !stateOptions.some((option) => option.uf === currentState) && (
                    <option value={currentState}>{currentState}</option>
                  )}
                {stateOptions.map((option) => (
                  <option key={option.uf} value={option.uf}>
                    {option.name}
                  </option>
                ))}
              </select>
              {errors.state && (
                <p className="text-sm text-destructive">{errors.state.message}</p>
              )}
            </div>

            {/* Cidade */}
            <div className="space-y-2">
              <label htmlFor="address-city" className="text-sm font-medium">
                Cidade *
              </label>
              {citiesError ? (
                // Sem resposta do IBGE, o cliente ainda consegue cadastrar.
                <Input
                  id="address-city"
                  value={currentCity ?? ""}
                  onChange={(e) => onCityChange(e.target.value)}
                  placeholder="Nome da cidade"
                  disabled={fieldLocks.city}
                />
              ) : (
                <select
                  id="address-city"
                  value={currentCity ?? ""}
                  onChange={(e) => onCityChange(e.target.value)}
                  disabled={fieldLocks.city}
                  className={selectClass}
                >
                  <option value="">
                    {isLoadingCities ? "Carregando cidades..." : "Selecione a cidade"}
                  </option>
                  {withCurrent(cityOptions ?? [], currentCity ?? "").map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
              {errors.city && (
                <p className="text-sm text-destructive">{errors.city.message}</p>
              )}
            </div>

            {/* Bairro */}
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="address-neighborhood" className="text-sm font-medium">
                Bairro *
              </label>
              {neighborhoodOptions ? (
                <>
                  <select
                    id="address-neighborhood"
                    value={isOtherNeighborhood ? OTHER_NEIGHBORHOOD : (currentNeighborhood ?? "")}
                    onChange={(e) =>
                      e.target.value === OTHER_NEIGHBORHOOD
                        ? onSelectOtherNeighborhood?.()
                        : onNeighborhoodChange(e.target.value)
                    }
                    disabled={fieldLocks.neighborhood}
                    className={selectClass}
                  >
                    <option value="">Selecione o bairro</option>
                    {/* O texto pode trazer outros nomes do bairro entre
                        parênteses; o valor salvo é sempre o nome oficial. */}
                    {neighborhoodOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value={OTHER_NEIGHBORHOOD}>Outro</option>
                  </select>
                  {/* "Outro" (bairro fora da lista, ou endereço antigo com um
                      nome que não está nela): o nome é salvo como foi escrito. */}
                  {isOtherNeighborhood && (
                    <div className="space-y-2 pt-1">
                      <label
                        htmlFor="address-neighborhood-other"
                        className="text-sm font-medium"
                      >
                        Qual é o seu bairro? *
                      </label>
                      <Input
                        id="address-neighborhood-other"
                        value={currentNeighborhood ?? ""}
                        onChange={(e) => onOtherNeighborhoodChange?.(e.target.value)}
                        placeholder="Nome do bairro"
                        required
                      />
                    </div>
                  )}
                </>
              ) : (
                <Input
                  id="address-neighborhood"
                  value={currentNeighborhood ?? ""}
                  onChange={(e) => onNeighborhoodChange(e.target.value)}
                  placeholder="Nome do bairro"
                  disabled={fieldLocks.neighborhood}
                />
              )}
              {errors.neighborhood && (
                <p className="text-sm text-destructive">
                  {errors.neighborhood.message}
                </p>
              )}
            </div>

            {/* Rua */}
            <div className="md:col-span-2 space-y-2">
              <label htmlFor="address-street" className="text-sm font-medium">
                Rua *
              </label>
              <Input
                id="address-street"
                {...addressForm.register("street")}
                placeholder="Nome da rua"
                disabled={fieldLocks.street}
              />
              {errors.street && (
                <p className="text-sm text-destructive">{errors.street.message}</p>
              )}
            </div>

            {/* Número */}
            <div className="space-y-2">
              <label htmlFor="address-number" className="text-sm font-medium">
                Número *
              </label>
              <Input
                id="address-number"
                {...addressForm.register("number")}
                placeholder="123"
                disabled={fieldLocks.number || noNumber}
              />
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="address-no-number"
                  checked={noNumber}
                  onChange={(e) => setNoNumber(e.target.checked)}
                  disabled={fieldLocks.number}
                  className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500"
                />
                <label htmlFor="address-no-number" className="text-sm cursor-pointer">
                  Sem número
                </label>
              </div>
              {errors.number && (
                <p className="text-sm text-destructive">{errors.number.message}</p>
              )}
            </div>

            {/* Complemento */}
            <div className="space-y-2">
              <label htmlFor="address-complement" className="text-sm font-medium">
                Complemento
              </label>
              <Input
                id="address-complement"
                {...addressForm.register("complement")}
                placeholder="Apto, bloco, etc"
                disabled={fieldLocks.rest}
              />
            </div>

            {/* Referência (só endereço da loja) */}
            {showReference && (
              <div className="md:col-span-2 space-y-2">
                <label htmlFor="address-reference" className="text-sm font-medium">
                  Referência
                </label>
                <Input
                  id="address-reference"
                  {...addressForm.register("reference")}
                  placeholder="Ponto de referência (opcional)"
                  disabled={fieldLocks.rest}
                />
              </div>
            )}

            {/* Localização no mapa */}
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">
                  Localização no mapa
                </label>
                {(isSearchingAddress || isLocatingPin) && (
                  <span role="status" className="text-xs text-muted-foreground">
                    {isSearchingAddress ? "Buscando endereço..." : "Localizando..."}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Confira se o pino está na {placeLabel}. Se não estiver, arraste.
              </p>
              <AddressMap
                mapHeight={220}
                value={addressCoords?.coords ?? null}
                onSelect={(coords) => applyCoords(coords, "manual")}
                zoom={pinZoom}
                recenterKey={pinRecenterKey}
              />
              {addressNotFound && (
                <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Não encontramos esse endereço no mapa. Arraste o pino até a{" "}
                  {placeLabel}.
                </p>
              )}
              {!addressCoords && (
                <p className="text-xs font-medium text-destructive">
                  Escolha o bairro ou toque no mapa para marcar o endereço.
                  Sem o pino não dá para salvar.
                </p>
              )}
            </div>

            {/* Checkbox Padrão */}
            {showDefaultOption && (
              <div className="md:col-span-2 flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  {...addressForm.register("isDefault")}
                  className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500"
                />
                <label
                  htmlFor="isDefault"
                  className="text-sm font-medium cursor-pointer"
                >
                  Definir como endereço padrão
                </label>
              </div>
            )}
          </div>

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
