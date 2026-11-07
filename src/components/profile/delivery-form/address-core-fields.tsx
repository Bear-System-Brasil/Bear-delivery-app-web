"use client";

import { formatCep } from "@/utils";
import { LocateFixed, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AddressForm } from "@/components/profile/addresses";
import { AddressMap } from "@/components/address-map";
import type {
  CoordinateSource,
  SourcedCoords,
} from "@/lib/address-coordinates";
import type { AddressFieldLocks } from "@/hooks/use-address-fields";
import { isNoNumber, NO_NUMBER } from "@/hooks/use-form-validation";
import type { IbgeState } from "@/services/ibge";
import { Coords } from "@/types/restaurant";
import type { StreetSuggestion } from "@/hooks/use-address-pin";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STREET_TYPE,
  joinStreet,
  splitStreet,
  STREET_TYPES,
  type StreetType,
} from "@/lib/street-type";
import { useState } from "react";

/** Bairro da lista: `value` é o nome oficial, `label` o texto exibido. */
export type NeighborhoodOption = { value: string; label: string };

/** Estado do pino no mapa (vem de `useAddressEditor`). */
export type PinStatusProps = {
  isSearchingAddress?: boolean;
  addressNotFound?: boolean;
  /** Logradouro achado com outro nome, para o cliente confirmar (LDMF-282). */
  streetSuggestion?: StreetSuggestion | null;
  onAcceptStreetSuggestion?: () => void;
  onDismissStreetSuggestion?: () => void;
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
  /** A lista de bairros da cidade ainda está chegando. */
  isLoadingNeighborhoods?: boolean;
  /** Bairro em "Outro": a lista mostra "Outro" e aparece o campo de texto. */
  isOtherNeighborhood?: boolean;
  onSelectOtherNeighborhood?: () => void;
  onOtherNeighborhoodChange?: (neighborhood: string) => void;
};

export type AddressCoreFieldsProps = AddressFieldProps &
  PinStatusProps & {
    applyCoords: (coords: Coords | null, source: CoordinateSource) => void;
    addressForm: AddressForm;
    addressCoords: SourcedCoords | null;
    isLoadingCep: boolean;
    /** Aviso abaixo do CEP (CEP da cidade inteira, sem bairro, não achado). */
    zipCodeHint?: string | null;
    /** Bairros oficiais da cidade; `null` = cidade sem lista (campo livre). */
    neighborhoodOptions?: NeighborhoodOption[] | null;
    isLocatingPin?: boolean;
    /** CEP obrigatório (perfil e loja). No seletor da home é opcional. */
    zipCodeRequired?: boolean;
    /**
     * Complemento e referência ficam atrás de um botão até o cliente abrir
     * (checkout: a tela já é longa e os dois são opcionais).
     */
    collapseOptionalFields?: boolean;
    /** Mostra o campo "Complemento". */
    showComplement?: boolean;
    /** Mostra o campo "Referência" (loja, perfil do cliente e checkout). */
    showReference?: boolean;
    /** Mostra a caixa "Definir como endereço padrão". A loja não mostra: o
     *  endereço dela é sempre o padrão (LDMF-263). */
    showDefaultOption?: boolean;
    /** Preenchido quando o endereço tem que ser o padrão (LDMF-262): a caixa
     *  fica marcada e travada, com este texto explicando o porquê. */
    defaultOptionLockedHint?: string | null;
    /**
     * Botão "Usar minha localização" no mapa (perfil e loja). O checkout tem
     * o dele no cabeçalho do bloco, e o seletor da home usa o GPS do topo.
     */
    showUseLocation?: boolean;
    /** Onde o pino deve ficar, nos textos do mapa ("sua casa", "sua loja"). */
    placeLabel?: string;
  };

/** Valor da opção "Outro" na lista (nunca é salvo). */
const OTHER_NEIGHBORHOOD = "__outro__";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

/** Lista de opções que sempre inclui o valor atual (carregando ou legado). */
function withCurrent(options: string[], current: string) {
  return current && !options.includes(current)
    ? [current, ...options]
    : options;
}

/**
 * Campos do núcleo de endereço (LDMF-260): CEP → Estado → Cidade → Bairro →
 * Rua → Número, complemento/referência e o mapa com pino. Sem janela em
 * volta: o modal do perfil e da loja e a gaveta da home usam os mesmos
 * campos, ligados ao `useAddressEditor`.
 */
export function AddressCoreFields({
  applyCoords,
  addressForm,
  addressCoords,
  isLoadingCep,
  zipCodeHint = null,
  neighborhoodOptions = null,
  isLocatingPin = false,
  zipCodeRequired = true,
  showComplement = true,
  collapseOptionalFields = false,
  showReference = false,
  showDefaultOption = true,
  defaultOptionLockedHint = null,
  placeLabel = "sua casa",
  showUseLocation = false,
  stateOptions,
  cityOptions,
  isLoadingCities = false,
  citiesError = false,
  fieldLocks,
  onStateChange,
  onCityChange,
  onNeighborhoodChange,
  isOtherNeighborhood = false,
  isLoadingNeighborhoods = false,
  onSelectOtherNeighborhood,
  onOtherNeighborhoodChange,
  isSearchingAddress = false,
  addressNotFound = false,
  streetSuggestion = null,
  onAcceptStreetSuggestion,
  onDismissStreetSuggestion,
  pinZoom,
  pinRecenterKey,
}: AddressCoreFieldsProps) {
  const [currentState, currentCity, currentNeighborhood, currentNumber] =
    addressForm.watch(["state", "city", "neighborhood", "number"]);
  const errors = addressForm.formState.errors;
  // "Sem número" é o próprio valor S/N no campo: endereço salvo assim já abre
  // com a caixa marcada, e trocar rua/bairro (que limpa o número) desmarca.
  const noNumber = isNoNumber(currentNumber);

  // GPS só no toque do cliente: diz onde ele está agora, que nem sempre é o
  // endereço que está cadastrando - por isso vale como gesto explícito
  // ("manual", prioridade máxima) e o texto pede para conferir.
  const [locatingDevice, setLocatingDevice] = useState(false);
  const [deviceLocationError, setDeviceLocationError] = useState<string | null>(null);
  const locateDevice = () => {
    setDeviceLocationError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setDeviceLocationError("Este aparelho não informa a localização. Arraste o pino.");
      return;
    }
    setLocatingDevice(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocatingDevice(false);
        applyCoords(
          { lat: position.coords.latitude, lng: position.coords.longitude },
          "manual",
        );
      },
      () => {
        setLocatingDevice(false);
        setDeviceLocationError(
          "Não conseguimos sua localização (permissão negada ou sem sinal). Arraste o pino.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  // Opcionais recolhidos (checkout): abrem no botão, ou sozinhos quando já
  // têm valor (endereço preenchido pelo CEP ou aberto para edição).
  const [optionalFieldsOpen, setOptionalFieldsOpen] = useState(false);
  const [currentComplement, currentReference] = addressForm.watch([
    "complement",
    "reference",
  ]);
  const hasOptionalValue = !!(currentComplement?.trim() || currentReference?.trim());
  const showOptionalFields =
    !collapseOptionalFields || optionalFieldsOpen || hasOptionalValue;
  const hasOptionalFields = showComplement || showReference;

  // Tipo de logradouro + nome (LDMF-282). O formulário guarda só `street`,
  // o logradouro completo ("Rua Sete de Setembro"), que é o que vai para o
  // back; tipo e nome são lidos dele. O tipo escolhido com o nome ainda
  // vazio fica aqui até o nome ser digitado.
  const currentStreet = addressForm.watch("street") ?? "";
  const streetParts = splitStreet(currentStreet);
  const [chosenStreetType, setChosenStreetType] =
    useState<StreetType>(DEFAULT_STREET_TYPE);
  // Endereço salvo sem tipo reconhecido ("MACHADO DE ASSIS"): o seletor
  // pede o tipo em vez de mostrar "Rua", e nada é posto na frente do nome
  // sem o cliente escolher. Endereço novo (rua vazia) vem com Rua.
  const legacyWithoutType = !streetParts.type && currentStreet.trim() !== "";
  const streetType: StreetType | null = streetParts.type
    ? streetParts.type
    : legacyWithoutType
      ? null
      : chosenStreetType;
  const streetName = streetParts.type ? streetParts.name : currentStreet;

  const setStreet = (value: string) =>
    addressForm.setValue("street", value, {
      shouldValidate: !!addressForm.formState.errors.street,
      shouldDirty: true,
    });

  // Tipo digitado no começo do nome ("Av. ") vai para o seletor, mesmo
  // antes do resto do nome: nunca "Rua Av. Brasil" nem "Rua Rua ...".
  const changeStreetName = (value: string) => {
    const typed = splitStreet(value).type;
    if (typed) setChosenStreetType(typed);
    const type = typed ?? streetType;
    setStreet(type ? joinStreet(type, value) : value);
  };

  const changeStreetType = (type: StreetType) => {
    setChosenStreetType(type);
    if (streetName.trim()) setStreet(joinStreet(type, streetName));
  };

  const setNoNumber = (checked: boolean) =>
    addressForm.setValue("number", checked ? NO_NUMBER : "", {
      shouldValidate: true,
      shouldDirty: true,
    });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* CEP */}
      <div className="md:col-span-2 space-y-2">
        <label htmlFor="address-zipcode" className="text-sm font-medium">
          CEP{zipCodeRequired ? " *" : ""}
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
        {/* CEP de cidade inteira, sem bairro ou que falhou: diz o
            que falta preencher. */}
        {zipCodeHint && !isLoadingCep ? (
          <p
            role="status"
            className="text-xs font-semibold text-amber-700 dark:text-amber-400"
          >
            {zipCodeHint}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isLoadingCep
              ? "Buscando CEP..."
              : zipCodeRequired
                ? "Digite o CEP e os campos serão preenchidos. Não sabe o CEP? Preencha o endereço que a gente acha."
                : "Digite o CEP e os campos serão preenchidos automaticamente"}
          </p>
        )}
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
        {/* Carregando vale também com uma lista na tela: ela é da cidade
            anterior até a nova chegar. */}
        {isLoadingNeighborhoods ? (
          <select
            id="address-neighborhood"
            disabled
            aria-busy="true"
            className={selectClass}
          >
            <option>Carregando bairros...</option>
          </select>
        ) : neighborhoodOptions ? (
          <>
            <select
              id="address-neighborhood"
              value={
                isOtherNeighborhood
                  ? OTHER_NEIGHBORHOOD
                  : (currentNeighborhood ?? "")
              }
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

      {/* Rua: tipo de logradouro + nome (LDMF-282) */}
      <div className="md:col-span-2 grid grid-cols-[7rem_1fr] gap-2 sm:grid-cols-[8.5rem_1fr]">
        <div className="space-y-2">
          <label htmlFor="address-street-type" className="text-sm font-medium">
            Tipo
          </label>
          <select
            id="address-street-type"
            className={selectClass}
            value={streetType ?? ""}
            onChange={(e) =>
              e.target.value && changeStreetType(e.target.value as StreetType)
            }
            disabled={fieldLocks.street}
            aria-describedby={
              legacyWithoutType ? "address-street-type-hint" : undefined
            }
          >
            {streetType === null && <option value="">Escolha</option>}
            {STREET_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="address-street" className="text-sm font-medium">
            Nome da rua *
          </label>
          <input type="hidden" {...addressForm.register("street")} />
          <Input
            id="address-street"
            value={streetName}
            onChange={(e) => changeStreetName(e.target.value)}
            onBlur={() => {
              if (currentStreet !== currentStreet.trim()) {
                setStreet(currentStreet.trim());
              }
            }}
            placeholder="Ex.: Sete de Setembro"
            disabled={fieldLocks.street}
            aria-invalid={errors.street ? true : undefined}
          />
        </div>
        {errors.street && (
          <p className="col-span-2 text-sm text-destructive">
            {errors.street.message}
          </p>
        )}
        {legacyWithoutType && (
          <p
            id="address-street-type-hint"
            className="col-span-2 text-xs text-amber-700 dark:text-amber-400"
          >
            Escolha o tipo da rua (Rua, Avenida, Travessa...) para o
            entregador achar o endereço.
          </p>
        )}
        {/* Retorno da busca junto do campo: é para cá que o cliente olha
            enquanto digita, não para o mapa lá embaixo (LDMF-282). */}
        {isSearchingAddress && !streetSuggestion && (
          <p className="col-span-2 text-xs text-muted-foreground">
            Procurando sua rua no mapa...
          </p>
        )}
        {streetSuggestion && (
          <div
            role="status"
            className="col-span-2 space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-700 dark:bg-amber-950/40"
          >
            <p>
              Encontramos <strong>{streetSuggestion.road}</strong>, em{" "}
              {streetSuggestion.place}. É essa?
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={onAcceptStreetSuggestion}
              >
                Sim, usar esse nome
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onDismissStreetSuggestion}
              >
                Manter o que digitei
              </Button>
            </div>
          </div>
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

      {!hasOptionalFields ? null : showOptionalFields ? (
        <>
        {/* Complemento (o seletor da home não guarda: não mostra) */}
        {showComplement && (
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
        )}

        {/* Referência (loja, cliente no perfil e checkout) */}
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
        </>
      ) : (
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={() => setOptionalFieldsOpen(true)}
            className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            + {showComplement && showReference
              ? "Complemento e ponto de referência"
              : showReference
                ? "Ponto de referência"
                : "Complemento"}{" "}
            (opcional)
          </button>
        </div>
      )}

      {/* Localização no mapa */}
      <div className="md:col-span-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium">Localização no mapa</label>
          {(isSearchingAddress || isLocatingPin) && (
            <span role="status" className="text-xs text-muted-foreground">
              {isSearchingAddress ? "Buscando endereço..." : "Localizando..."}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Confira se o pino está na {placeLabel}. Se não estiver, arraste.
        </p>
        {showUseLocation && (
          <div className="space-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={locateDevice}
              disabled={locatingDevice}
              className="gap-2"
            >
              <LocateFixed className="h-4 w-4" />
              {locatingDevice ? "Localizando..." : "Usar minha localização"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Use se você está na {placeLabel} agora.
            </p>
            {deviceLocationError && (
              <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {deviceLocationError}
              </p>
            )}
          </div>
        )}
        <AddressMap
          mapHeight={220}
          value={addressCoords?.coords ?? null}
          onSelect={(coords) => applyCoords(coords, "manual")}
          zoom={pinZoom}
          recenterKey={pinRecenterKey}
        />
        {addressNotFound && (
          <p
            role="alert"
            className="text-xs font-medium text-amber-700 dark:text-amber-400"
          >
            Não encontramos esse endereço no mapa. Arraste o pino até a{" "}
            {placeLabel}.
          </p>
        )}
        {!addressCoords && (
          <p className="text-xs font-medium text-destructive">
            Escolha o bairro ou toque no mapa para marcar o endereço. Sem o pino
            não dá para salvar.
          </p>
        )}
      </div>

      {/* Checkbox Padrão */}
      {showDefaultOption && (
        <div className="md:col-span-2 flex flex-wrap items-center gap-x-2 pt-2">
          <input
            type="checkbox"
            id="isDefault"
            {...addressForm.register("isDefault")}
            disabled={!!defaultOptionLockedHint}
            aria-describedby={
              defaultOptionLockedHint ? "isDefault-locked-hint" : undefined
            }
            className="h-4 w-4 rounded border-border text-brand-500 focus:ring-brand-500 disabled:opacity-60"
          />
          <label
            htmlFor="isDefault"
            className={cn(
              "text-sm font-medium",
              defaultOptionLockedHint ? "cursor-default" : "cursor-pointer",
            )}
          >
            Definir como endereço padrão
          </label>
          {defaultOptionLockedHint && (
            <p
              id="isDefault-locked-hint"
              className="basis-full text-xs text-muted-foreground"
            >
              {defaultOptionLockedHint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
