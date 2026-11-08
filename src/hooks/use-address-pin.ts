"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeText, parseCoords } from "@/lib/geocode";
import { nominatim } from "@/lib/nominatim";
import {
  findNeighborhood,
  getNeighborhoods,
  type CityNeighborhoods,
} from "@/services/neighborhoods";
import { Coords } from "@/types/restaurant";

import { isNoNumber } from "./use-form-validation";

/**
 * Espera depois da última tecla em rua/número antes de buscar: uma busca por
 * endereço preenchido, nunca uma por letra.
 */
export const ADDRESS_SEARCH_DELAY_MS = 800;

/** Zoom do mapa conforme a origem do pino. */
export const STREET_ZOOM = 17;
export const NEIGHBORHOOD_ZOOM = 15;
export const CITY_ZOOM = 13;

export type PinSource = "neighborhood" | "geocode";

export type AddressPinFields = {
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  number?: string;
};

type Options = {
  fields: AddressPinFields;
  /** Chamado quando o preenchimento define uma nova posição para o pino. */
  onPin: (coords: Coords, source: PinSource, zoom: number) => void;
  /**
   * Bairro em "Outro" (texto livre): o nome digitado não mexe no pino e é
   * salvo como foi escrito.
   */
  otherNeighborhood?: boolean;
};

/**
 * Chave do endereço buscável, ou "" enquanto falta campo. "Sem número" (S/N)
 * conta como preenchido: a busca vai só com a rua.
 */
function addressKey({ street, number, city, state }: AddressPinFields) {
  const numberKey = isNoNumber(number) ? "s/n" : normalizeText(number);
  const parts = [street, city, state].map((part) => normalizeText(part));
  return numberKey && parts.every(Boolean)
    ? [parts[0], numberKey, parts[1], parts[2]].join("|")
    : "";
}

/** Centro da área urbana que veio com a lista de bairros, se houver. */
function listCenter(list: CityNeighborhoods | null) {
  return list?.center ? parseCoords(list.center.lat, list.center.lng) : null;
}

/**
 * Pino que acompanha o preenchimento do endereço (LDMF-261):
 *
 * 1. Bairro da lista escolhido → centro do bairro; sem coordenada do bairro,
 *    o `center` da lista (LDMF-264), sem chamar o Nominatim. Só cidade cuja
 *    lista não traz `center` busca o centro da cidade no Nominatim.
 * 2. Rua e número (ou "Sem número") preenchidos → uma busca no Nominatim; só
 *    move o pino se o ponto cair dentro da cidade. Sem resultado, o pino fica
 *    onde estava.
 *
 * Vale sempre a última ação do cliente. Nada aqui roda na hora de salvar.
 */
export function useAddressPin({ fields, onPin, otherNeighborhood = false }: Options) {
  const [neighborhoodList, setNeighborhoodList] =
    useState<CityNeighborhoods | null>(null);
  const [isLocatingNeighborhood, setIsLocatingNeighborhood] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  // A última busca de rua e número não achou nada dentro da cidade.
  const [addressNotFound, setAddressNotFound] = useState(false);

  const onPinRef = useRef(onPin);
  onPinRef.current = onPin;

  // Cada busca do centro da cidade pelo "Outro" ganha um número; resposta de
  // busca antiga (o cliente já escolheu outra coisa) é descartada.
  const cityLookup = useRef(0);

  // Valores que já estão representados no pino (endereço aberto para edição
  // ou última busca feita). Só mudança em relação a eles dispara algo.
  const baseline = useRef({ neighborhood: "", address: "" });

  const state = fields.state?.trim() ?? "";
  const city = fields.city?.trim() ?? "";
  const neighborhood = fields.neighborhood ?? "";
  const street = fields.street ?? "";
  // "Sem número": a busca vai só com a rua.
  const number = isNoNumber(fields.number) ? "" : (fields.number ?? "");
  const currentAddressKey = addressKey({ street, number: fields.number, city, state });

  useEffect(() => {
    let active = true;

    getNeighborhoods(state, city).then((list) => {
      if (active) setNeighborhoodList(list);
    });

    return () => {
      active = false;
    };
  }, [state, city]);

  useEffect(() => {
    if (!neighborhoodList) return;

    const key = normalizeText(neighborhood);
    if (!key || key === baseline.current.neighborhood) return;
    if (otherNeighborhood) return;

    // Nome oficial ou alternativo. Trocar um pelo outro (ex.: "Pombal" →
    // "Castelo III") é o mesmo bairro e não mexe no pino.
    const item = findNeighborhood(neighborhoodList, key);
    const previous = findNeighborhood(neighborhoodList, baseline.current.neighborhood);
    baseline.current.neighborhood = key;
    if (!item || item === previous) return;
    cityLookup.current += 1;

    const neighborhoodCenter = parseCoords(item.lat, item.lng);
    if (neighborhoodCenter) {
      onPinRef.current(neighborhoodCenter, "neighborhood", NEIGHBORHOOD_ZOOM);
      return;
    }

    const urbanCenter = listCenter(neighborhoodList);
    if (urbanCenter) {
      onPinRef.current(urbanCenter, "neighborhood", CITY_ZOOM);
      return;
    }

    let active = true;
    setIsLocatingNeighborhood(true);

    nominatim
      .searchCity({ city: neighborhoodList.city, state: neighborhoodList.state })
      .then((cityCenter) => {
        if (active && cityCenter) {
          onPinRef.current(cityCenter, "neighborhood", CITY_ZOOM);
        }
      })
      .finally(() => {
        if (active) setIsLocatingNeighborhood(false);
      });

    return () => {
      active = false;
      setIsLocatingNeighborhood(false);
    };
  }, [neighborhood, neighborhoodList, otherNeighborhood]);

  useEffect(() => {
    if (!currentAddressKey) {
      setAddressNotFound(false);
      return;
    }
    if (currentAddressKey === baseline.current.address) return;

    let active = true;

    const timer = setTimeout(async () => {
      baseline.current.address = currentAddressKey;
      setAddressNotFound(false);
      setIsSearchingAddress(true);

      const coords = await nominatim.searchAddress({ street, number, city, state });
      if (!active) return;

      setIsSearchingAddress(false);
      // Não achou ou caiu fora da cidade: o pino fica onde estava e o
      // cliente é avisado para arrastar.
      if (coords) onPinRef.current(coords, "geocode", STREET_ZOOM);
      else setAddressNotFound(true);
    }, ADDRESS_SEARCH_DELAY_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      setIsSearchingAddress(false);
    };
  }, [currentAddressKey, street, number, city, state]);

  /**
   * "Outro" escolhido: pino no centro da cidade, como bairro sem coordenada -
   * o `center` da lista quando houver, senão a busca da cidade no Nominatim.
   */
  const locateCityCenter = useCallback(() => {
    if (!city || !state) return;

    const lookup = ++cityLookup.current;

    const sameCity =
      neighborhoodList &&
      normalizeText(neighborhoodList.city) === normalizeText(city) &&
      normalizeText(neighborhoodList.state) === normalizeText(state);
    const urbanCenter = sameCity ? listCenter(neighborhoodList) : null;
    if (urbanCenter) {
      setIsLocatingNeighborhood(false);
      onPinRef.current(urbanCenter, "neighborhood", CITY_ZOOM);
      return;
    }

    setIsLocatingNeighborhood(true);

    nominatim
      .searchCity({ city, state })
      .then((cityCenter) => {
        if (lookup === cityLookup.current && cityCenter) {
          onPinRef.current(cityCenter, "neighborhood", CITY_ZOOM);
        }
      })
      .finally(() => {
        if (lookup === cityLookup.current) setIsLocatingNeighborhood(false);
      });
  }, [city, state, neighborhoodList]);

  /**
   * Marca os valores atuais como já representados no pino: ao abrir um
   * endereço salvo para edição (o pino já está na coordenada dele) ou ao
   * limpar o formulário.
   */
  const resetBaseline = useCallback((values: AddressPinFields = {}) => {
    cityLookup.current += 1;
    baseline.current = {
      neighborhood: normalizeText(values.neighborhood),
      address: addressKey(values),
    };
    setAddressNotFound(false);
  }, []);

  /** O cliente posicionou o pino à mão: o aviso de não encontrado sai. */
  const clearNotice = useCallback(() => setAddressNotFound(false), []);

  return {
    /** Lista oficial de bairros da cidade, ou `null` sem lista. */
    neighborhoodList,
    isLocatingNeighborhood,
    isSearchingAddress,
    addressNotFound,
    resetBaseline,
    clearNotice,
    locateCityCenter,
  };
}
