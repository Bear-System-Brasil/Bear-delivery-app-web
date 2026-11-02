import {
  parseBrasilApiCoords,
  withCoords,
  type CoordinateSource,
  type SourcedCoords,
} from "@/lib/address-coordinates";
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
 */
export const useAddressEditor = ({ enabled }: { enabled: boolean }) => {
  // CEP state
  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [lastFetchedCep, setLastFetchedCep] = useState<string | null>(null);

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

  const addressForm = useAddressForm();

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

  /**
   * Auto-fetch CEP when complete (8 digits)
   */
  useEffect(() => {
    if (watchedZipCode) {
      const cleanCep = onlyNumbers(watchedZipCode);
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
   * Buscar CEP na BrasilAPI
   */
  const fetchCepData = async (cep: string) => {
    const cleanCep = onlyNumbers(cep);
    if (cleanCep.length !== 8) return;

    setIsLoadingCep(true);
    try {
      const response = await fetch(
        `https://brasilapi.com.br/api/cep/v2/${cleanCep}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("CEP não encontrado");
        } else {
          toast.error("Erro ao buscar CEP");
        }
        return;
      }

      const data = await response.json();
      // CEP preenche estado e cidade. Se a cidade mudou, os campos seguintes
      // e o pino são limpos como em qualquer troca de campo anterior.
      if (data.state) addressFields.changeState(data.state);
      if (data.city) addressFields.changeCity(data.city);
      // CEP de rua (não o de cidade inteira) também traz bairro e rua.
      if (data.neighborhood) addressForm.setValue("neighborhood", data.neighborhood);
      if (data.street) addressForm.setValue("street", data.street);

      // A BrasilAPI já devolve a coordenada do logradouro - usa como ponto de
      // partida e centra o mapa nela. É a fonte de menor prioridade: cede
      // para a geocodificação do endereço completo e para o clique no mapa.
      applyCoords(parseBrasilApiCoords(data), "cep");

      toast.success("CEP encontrado! Campos preenchidos automaticamente");
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
      toast.error("Erro ao buscar CEP. Verifique sua conexão.");
    } finally {
      setIsLoadingCep(false);
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
    addressFields.resetOtherNeighborhood();
  };

  /** Limpa formulário, CEP buscado e pino (fechar ou depois de salvar). */
  const resetEditor = () => {
    addressForm.reset();
    setLastFetchedCep(null);
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
    pinZoom: pin?.zoom,
    pinRecenterKey: pin?.seq,
    // CEP
    isLoadingCep,
    formatCep,
    watchedZipCode,
  };
};
