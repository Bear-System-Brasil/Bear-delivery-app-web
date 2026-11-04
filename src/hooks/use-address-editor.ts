import {
  withCoords,
  type CoordinateSource,
  type SourcedCoords,
} from "@/lib/address-coordinates";
import { CepNotFoundError, fetchCepAddress } from "@/lib/cep";
import { parseCoords } from "@/lib/geocode";
import { findNeighborhood, neighborhoodLabel } from "@/services/neighborhoods";
import { Coords } from "@/types/restaurant";
import { onlyNumbers } from "@/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAddressFields } from "./use-address-fields";
import {
  NEIGHBORHOOD_ZOOM,
  STREET_ZOOM,
  useAddressPin,
  type PinSource,
} from "./use-address-pin";
import { AddressFormData, useAddressForm } from "./use-form-validation";

// Avisos abaixo do CEP, para cliente e loja. Cidade de CEP único (Castelo
// 29360-000, Alegre 29500-000) não traz rua nem bairro: o aviso diz o que
// falta em vez de deixar parecer que o CEP preencheu tudo (LDMF-364).
export const CITY_WIDE_CEP_HINT =
  "Este CEP vale para a cidade inteira. Preencha bairro, rua e número abaixo.";
export const NO_NEIGHBORHOOD_CEP_HINT =
  "Este CEP não traz o bairro. Preencha o bairro abaixo.";
export const CEP_NOT_FOUND_HINT =
  "CEP não encontrado. Confira o número ou preencha estado, cidade, bairro, rua e número à mão.";
export const CITY_CEP_FILLED_HINT =
  "Preenchemos o CEP da cidade, que vale para a cidade inteira.";
export const CEP_LOOKUP_FAILED_HINT =
  "Não conseguimos consultar o CEP agora. Preencha estado, cidade, bairro, rua e número à mão.";

/** Endereço salvo que o modal abre para edição. */
export type EditableAddress = {
  street?: string;
  number?: string | number;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  type?: string;
  complement?: string;
  reference?: string;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
};

/**
 * Núcleo do modal de endereço (LDMF-258): formulário, CEP, ordem e trava
 * dos campos, lista de bairros e pino. Usado pelo perfil do cliente e pelo
 * perfil da loja - cada tela só decide como salvar (rota, padrão, regras do
 * PATCH). O salvar usa exatamente a posição do pino.
 *
 * @param enabled o modal está aberto (carrega estados e cidades só então).
 * @param zipCodeOptional CEP pode ficar vazio (seletor da home).
 */
export const useAddressEditor = ({
  enabled,
  zipCodeOptional = false,
}: {
  enabled: boolean;
  zipCodeOptional?: boolean;
}) => {
  // CEP state
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [lastFetchedCep, setLastFetchedCep] = useState<string | null>(null);
  // Orientação abaixo do CEP. null = sem aviso.
  const [zipCodeHint, setZipCodeHint] = useState<string | null>(null);
  // Último CEP pedido: resposta atrasada de um CEP anterior não preenche nada.
  const lastCepRequest = useRef<string | null>(null);

  // Posição do pino + de onde ela veio. É exatamente o que vai para o
  // backend ao salvar (LDMF-261): sem pino, não salva. `zoom` e `seq` só
  // dizem ao mapa como recentralizar a cada novo posicionamento.
  const [pin, setPin] = useState<
    (SourcedCoords & { zoom?: number; seq: number }) | null
  >(null);
  const pinSeq = useRef(0);
  const addressCoords = useMemo<SourcedCoords | null>(
    () => (pin ? { coords: pin.coords, source: pin.source } : null),
    [pin],
  );

  const addressForm = useAddressForm(undefined, { zipCodeOptional });

  // Watch CEP field changes
  const watchedZipCode = addressForm.watch("zipCode");
  const watchedAddress = addressForm.watch([
    "zipCode",
    "street",
    "number",
    "neighborhood",
    "city",
    "state",
  ]);
  const [
    ,
    watchedStreet,
    watchedNumber,
    watchedNeighborhood,
    watchedCity,
    watchedState,
  ] = watchedAddress;

  // Bairro, rua e número movem o pino na frente de quem cadastra - o salvar
  // não geocodifica nada escondido.
  // Ordem e trava dos campos; trocar estado, cidade ou bairro limpa os
  // seguintes e o pino. As ações do pino chegam por ref porque o hook do pino
  // também precisa saber se o bairro está em "Outro".
  const pinActions = useRef<{
    resetBaseline: () => void;
    locateCityCenter: () => void;
  } | null>(null);
  const addressFields = useAddressFields({
    form: addressForm,
    enabled,
    onPreviousFieldChange: () => {
      setPin(null);
      pinActions.current?.resetBaseline();
    },
    // "Outro": pino no centro da cidade.
    onOtherNeighborhood: () => pinActions.current?.locateCityCenter(),
  });

  const addressPin = useAddressPin({
    otherNeighborhood: addressFields.otherNeighborhood,
    fields: {
      state: watchedState,
      city: watchedCity,
      neighborhood: watchedNeighborhood,
      street: watchedStreet,
      number: watchedNumber,
    },
    onPin: (coords: Coords, source: PinSource, zoom: number) =>
      setPin({ coords, source, zoom, seq: ++pinSeq.current }),
  });
  pinActions.current = {
    resetBaseline: addressPin.resetBaseline,
    locateCityCenter: addressPin.locateCityCenter,
  };

  // Bairro digitado ou vindo do CEP/endereço salvo com nome alternativo (ex.:
  // "Pombal") vira o nome oficial ("Castelo III"): o formulário exibe
  // e salva sempre o oficial (LDMF-278).
  // "Outro" escolhido agora, ou endereço salvo com bairro fora da lista (o
  // nome digitado antes continua editável no campo de texto).
  const isOtherNeighborhood =
    addressFields.otherNeighborhood ||
    (!!addressPin.neighborhoodList &&
      !!watchedNeighborhood?.trim() &&
      !findNeighborhood(addressPin.neighborhoodList, watchedNeighborhood));

  // Em "Outro" o nome digitado é salvo como foi escrito, sem conversão.
  useEffect(() => {
    if (addressFields.otherNeighborhood) return;

    const item = findNeighborhood(addressPin.neighborhoodList, watchedNeighborhood);
    if (item && item.name !== watchedNeighborhood) {
      addressForm.setValue("neighborhood", item.name, { shouldValidate: true });
    }
  }, [
    addressFields.otherNeighborhood,
    addressPin.neighborhoodList,
    watchedNeighborhood,
    addressForm,
  ]);

  // CEP automático (LDMF-260): cidade de CEP único na lista (Castelo,
  // 29360-000) preenche o CEP vazio. Sem busca: o CEP é o da própria cidade
  // escolhida. Trocar para outra cidade tira o CEP que foi preenchido aqui.
  const autoFilledCep = useRef<string | null>(null);
  useEffect(() => {
    const currentCep = onlyNumbers(addressForm.getValues("zipCode") ?? "");
    const cityCep = onlyNumbers(addressPin.neighborhoodList?.cep ?? "");

    if (autoFilledCep.current && currentCep === autoFilledCep.current) {
      if (cityCep === currentCep) return;
      autoFilledCep.current = null;
      lastCepRequest.current = null;
      setLastFetchedCep(null);
      addressForm.setValue("zipCode", "", { shouldValidate: true });
      return;
    }

    if (cityCep.length !== 8 || currentCep) return;

    autoFilledCep.current = cityCep;
    lastCepRequest.current = cityCep;
    setLastFetchedCep(cityCep);
    addressForm.setValue("zipCode", formatCep(cityCep), {
      shouldValidate: true,
    });
    setZipCodeHint(CITY_CEP_FILLED_HINT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressPin.neighborhoodList]);

  /**
   * Auto-fetch CEP when complete (8 digits)
   */
  useEffect(() => {
    const cleanCep = onlyNumbers(watchedZipCode ?? "");
    // CEP mudou: o aviso e a busca anteriores não valem mais.
    if (cleanCep !== lastCepRequest.current) {
      lastCepRequest.current = null;
      setZipCodeHint(null);
      setIsLoadingCep(false);
    }
    if (watchedZipCode) {
      if (cleanCep.length === 8 && cleanCep !== lastFetchedCep) {
        fetchCepData(watchedZipCode);
        setLastFetchedCep(cleanCep);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedZipCode]);

  /**
   * Registra uma coordenada respeitando a prioridade das fontes
   * (clique no mapa > geocodificação > CEP).
   */
  const applyCoords = (coords: Coords | null, source: CoordinateSource) => {
    if (source === "manual" && coords) addressPin.clearNotice();

    setPin((current) => {
      const base = current
        ? { coords: current.coords, source: current.source }
        : null;
      const next = withCoords(base, coords, source);
      if (next === base || !next) return current;

      // Toque/arrasto mantém o zoom do cliente; a coordenada do CEP é do
      // logradouro (ou da cidade inteira), então aproxima só até o bairro.
      return {
        ...next,
        zoom: source === "cep" ? NEIGHBORHOOD_ZOOM : undefined,
        seq: ++pinSeq.current,
      };
    });
  };

  /**
   * Buscar CEP na BrasilAPI. Só preenche o que o CEP trouxe: CEP de cidade
   * inteira não apaga bairro e rua já digitados. Se a busca falhar, nada é
   * apagado e o aviso diz para preencher à mão.
   */
  const fetchCepData = async (cep: string) => {
    const cleanCep = onlyNumbers(cep);
    if (cleanCep.length !== 8) return;

    lastCepRequest.current = cleanCep;
    setIsLoadingCep(true);
    setZipCodeHint(null);
    try {
      const result = await fetchCepAddress(cleanCep);
      if (lastCepRequest.current !== cleanCep) return;

      // CEP preenche estado e cidade. Se a cidade mudou, os campos seguintes
      // e o pino são limpos como em qualquer troca de campo anterior.
      if (result.state) addressFields.changeState(result.state);
      if (result.city) addressFields.changeCity(result.city);
      // CEP de rua (não o de cidade inteira) também traz bairro e rua.
      if (result.neighborhood) addressForm.setValue("neighborhood", result.neighborhood);
      if (result.street) addressForm.setValue("street", result.street);

      // A BrasilAPI já devolve a coordenada do logradouro - usa como ponto de
      // partida e centra o mapa nela. É a fonte de menor prioridade: cede
      // para a geocodificação do endereço completo e para o clique no mapa.
      applyCoords(result.coords, "cep");

      setZipCodeHint(
        !result.street
          ? CITY_WIDE_CEP_HINT
          : !result.neighborhood
            ? NO_NEIGHBORHOOD_CEP_HINT
            : null,
      );
      toast.success(
        !result.street
          ? "CEP da cidade encontrado. Preencha bairro, rua e número."
          : !result.neighborhood
            ? "CEP encontrado. Preencha o bairro."
            : "CEP encontrado! Campos preenchidos automaticamente",
      );
    } catch (error) {
      if (lastCepRequest.current !== cleanCep) return;

      if (error instanceof CepNotFoundError) {
        setZipCodeHint(CEP_NOT_FOUND_HINT);
        toast.error("CEP não encontrado");
      } else {
        console.error("Erro ao buscar CEP:", error);
        setZipCodeHint(CEP_LOOKUP_FAILED_HINT);
        toast.error("Erro ao buscar CEP. Preencha o endereço à mão.");
      }
    } finally {
      if (lastCepRequest.current === cleanCep) setIsLoadingCep(false);
    }
  };

  /**
   * Formatar CEP com máscara
   */
  const formatCep = (value: string) => {
    const cleanValue = onlyNumbers(value);
    if (cleanValue.length <= 5) {
      return cleanValue;
    }
    return `${cleanValue.slice(0, 5)}-${cleanValue.slice(5, 8)}`;
  };

  /**
   * Preenche o formulário com um endereço salvo. O pino abre na coordenada
   * salva: só mudança de bairro, rua ou número dispara nova posição. Mudar o
   * complemento mantém.
   */
  const loadAddress = (address: EditableAddress) => {
    addressForm.reset({
      street: address.street || "",
      number: String(address.number ?? ""),
      neighborhood: address.neighborhood || "",
      city: address.city || "",
      state: address.state || "",
      zipCode: address.zipCode || "",
      type: address.type,
      complement: address.complement || "",
      reference: address.reference || "",
      longitude: address.longitude ?? undefined,
      latitude: address.latitude ?? undefined,
      isDefault: address.isDefault ?? false,
    });

    const storedCoords = parseCoords(address.latitude, address.longitude);

    setPin(
      storedCoords
        ? {
            coords: storedCoords,
            source: "stored",
            zoom: STREET_ZOOM,
            seq: ++pinSeq.current,
          }
        : null,
    );
    addressPin.resetBaseline({
      state: address.state,
      city: address.city,
      neighborhood: address.neighborhood,
      street: address.street,
      number: String(address.number ?? ""),
    });
    setLastFetchedCep(onlyNumbers(address.zipCode ?? ""));
    lastCepRequest.current = null;
    autoFilledCep.current = null;
    setZipCodeHint(null);
    addressFields.resetOtherNeighborhood();
  };

  /** Limpa formulário, CEP buscado e pino (fechar ou depois de salvar). */
  const resetEditor = () => {
    addressForm.reset();
    setLastFetchedCep(null);
    lastCepRequest.current = null;
    autoFilledCep.current = null;
    setZipCodeHint(null);
    setPin(null);
    addressPin.resetBaseline();
    addressFields.resetOtherNeighborhood();
  };

  /**
   * Confere o que o schema não cobre antes de salvar e devolve a posição do
   * pino. `null` = não salva (o aviso já foi mostrado).
   */
  const getPinForSave = (data: AddressFormData): Coords | null => {
    // "Outro" exige o nome do bairro (só espaços não vale).
    if (isOtherNeighborhood && !data.neighborhood?.trim()) {
      toast.error("Informe qual é o seu bairro.");
      return null;
    }

    // Salvar = confirmar o pino. Endereço sem coordenada some das buscas por
    // proximidade, então sem pino não sai nada.
    if (!addressCoords) {
      toast.error("Marque no mapa onde fica o endereço antes de salvar.");
      return null;
    }

    return addressCoords.coords;
  };

  /** "É essa?" aceito: o logradouro achado vai para o formulário (LDMF-282). */
  const acceptStreetSuggestion = () => {
    const road = addressPin.acceptStreetSuggestion();
    if (road) addressForm.setValue("street", road, { shouldValidate: true });
  };

  return {
    addressForm,
    loadAddress,
    resetEditor,
    getPinForSave,
    addressCoords,
    applyCoords,
    neighborhoodOptions:
      addressPin.neighborhoodList?.neighborhoods.map((item) => ({
        value: item.name,
        label: neighborhoodLabel(item),
      })) ?? null,
    stateOptions: addressFields.stateOptions,
    cityOptions: addressFields.cityOptions,
    isLoadingCities: addressFields.isLoadingCities,
    citiesError: addressFields.citiesError,
    fieldLocks: addressFields.locks,
    changeState: addressFields.changeState,
    changeCity: addressFields.changeCity,
    changeNeighborhood: addressFields.changeNeighborhood,
    isOtherNeighborhood,
    selectOtherNeighborhood: addressFields.selectOtherNeighborhood,
    changeOtherNeighborhood: addressFields.changeOtherNeighborhood,
    isLocatingPin: addressPin.isLocatingNeighborhood,
    isSearchingAddress: addressPin.isSearchingAddress,
    addressNotFound: addressPin.addressNotFound,
    streetSuggestion: addressPin.streetSuggestion,
    acceptStreetSuggestion,
    dismissStreetSuggestion: addressPin.dismissStreetSuggestion,
    pinZoom: pin?.zoom,
    pinRecenterKey: pin?.seq,
    // CEP
    isLoadingCep,
    zipCodeHint,
    formatCep,
    watchedZipCode,
  };
};
