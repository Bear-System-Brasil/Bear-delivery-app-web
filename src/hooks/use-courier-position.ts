"use client";

import { useCallback, useEffect, useState } from "react";

import { parseCoords } from "@/lib/geocode";
import {
  isPositionFresh,
  useCourierPositionStore,
  type CourierPosition,
} from "@/stores/courier-position-store";
import type { Coords } from "@/types/restaurant";

/**
 * Teto de espera pelo GPS.
 *
 * O `watchPosition` do rastreamento usa 15s, que é razoável pra um sinal que
 * fica atualizando sozinho em segundo plano. Aqui o entregador está parado
 * olhando pro botão que acabou de tocar: passando disso, é melhor abrir o
 * campo de digitar do que deixá-lo esperando sem saber por quê.
 */
const GPS_TIMEOUT_MS = 8_000;

/**
 * Teto do próprio app, acima do `timeout` do navegador.
 *
 * O `timeout` da Geolocation API só começa a contar depois que a permissão
 * é concedida: com o pedido de permissão aberto e sem resposta, nenhum
 * callback chega e o aceite ficava em "Aceitando..." indefinidamente
 * (medido no LDMF-314). Folgado de propósito, pra dar tempo de o entregador
 * ler e responder o pedido; passando disso, abre o campo de digitar.
 */
const GPS_HARD_TIMEOUT_MS = 20_000;

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

/**
 * O que o Nominatim achou pro texto digitado. Ainda não é a posição: o
 * entregador confirma antes (ver `findFromText`).
 */
export type TextMatch = {
  coords: Coords;
  /** Endereço que o Nominatim devolveu, encurtado pra caber na tela. */
  found: string;
};

/**
 * O endereço vem em português (`accept-language=pt-BR` na busca, senão o
 * Nominatim segue o idioma do navegador e devolve "Northeast Region").
 *
 * "1000, Avenida Paulista, Bela Vista, São Paulo, Região Imediata de São
 * Paulo, ..., 01310-100, Brasil" vira "1000, Avenida Paulista, Bela Vista,
 * São Paulo": regiões, CEP e país não ajudam o entregador a reconhecer o
 * lugar.
 */
function shortAddress(displayName: unknown): string | null {
  if (typeof displayName !== "string") return null;
  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !/^Região/i.test(part) &&
        !/^Brasil$/i.test(part) &&
        !/^\d{5}-?\d{3}$/.test(part),
    );
  return parts.length ? parts.slice(0, 5).join(", ") : null;
}

/**
 * Busca a linha livre que o entregador digitou, sem plano B.
 *
 * Não usa `geocodeAddress`: com só a rua preenchida, a busca de reserva
 * dele (bairro/cidade/estado) vira só "Brasil" e devolve o centro do país.
 * Medido no LDMF-314 - o aceite saía com -10.33, -53.2 e a tela dizia
 * "Localização registrada". Aqui, não achou = não achou: o entregador
 * corrige o texto.
 */
async function searchFreeText(query: string): Promise<TextMatch | null> {
  try {
    const response = await fetch(
      `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(
        `${query}, Brasil`,
      )}&format=jsonv2&limit=1&accept-language=pt-BR`,
    );
    if (!response.ok) return null;

    const results = await response.json();
    const result = Array.isArray(results) ? results[0] : null;
    if (!result) return null;

    const coords = parseCoords(result.lat, result.lon);
    if (!coords) return null;

    return { coords, found: shortAddress(result.display_name) ?? query };
  } catch {
    return null;
  }
}

/** Por que o GPS não respondeu - decide a mensagem, não o caminho. */
export type PositionFailure =
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported";

export type PositionOutcome =
  | { ok: true; position: CourierPosition }
  | { ok: false; reason: PositionFailure };

type GpsReading =
  | { ok: true; coords: Coords }
  | { ok: false; reason: PositionFailure };

function readGps(): Promise<GpsReading> {
  return new Promise((done) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      done({ ok: false, reason: "unsupported" });
      return;
    }

    // Quem chegar primeiro decide: resposta do navegador ou o teto.
    let settled = false;
    const resolve = (reading: GpsReading) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      done(reading);
    };
    const timer = setTimeout(
      () => resolve({ ok: false, reason: "timeout" }),
      GPS_HARD_TIMEOUT_MS,
    );

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        }),
      (error) => {
        // Os três motivos levam ao mesmo lugar (pedir por texto), mas a
        // mensagem muda: negar permissão é decisão do entregador, os outros
        // dois são acidente.
        if (error.code === error.PERMISSION_DENIED) {
          resolve({ ok: false, reason: "denied" });
        } else if (error.code === error.TIMEOUT) {
          resolve({ ok: false, reason: "timeout" });
        } else {
          resolve({ ok: false, reason: "unavailable" });
        }
      },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

export type GeolocationPermission = PermissionState | "unknown";

/**
 * Estado da permissão de localização, acompanhando mudanças.
 *
 * Com a permissão negada o navegador nem pergunta de novo: tocar em "tentar
 * pelo GPS" falha na hora, e o entregador fica sem saber o que fazer
 * (LDMF-314). Saber o estado deixa a tela explicar como liberar e reabilitar
 * o GPS sozinha quando ele liberar nas configurações.
 *
 * `unknown` quando o navegador não tem a Permissions API (Safari antigo) -
 * aí a tela segue como antes, sem travar o botão.
 */
export function useGeolocationPermission(enabled = true): GeolocationPermission {
  const [state, setState] = useState<GeolocationPermission>("unknown");

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;

    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (status) setState(status.state);
    };

    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (cancelled) return;
        status = result;
        setState(result.state);
        result.addEventListener("change", onChange);
      })
      .catch(() => {
        // Alguns navegadores recusam o nome "geolocation": fica `unknown`.
      });

    return () => {
      cancelled = true;
      status?.removeEventListener("change", onChange);
    };
  }, [enabled]);

  return state;
}

/**
 * Posição do entregador para o aceite: cache do rastreamento primeiro, GPS
 * depois, texto geocodificado como último recurso.
 */
export function useCourierPosition() {
  const position = useCourierPositionStore((state) => state.position);
  const setStorePosition = useCourierPositionStore(
    (state) => state.setPosition,
  );

  const [isLocating, setIsLocating] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  /**
   * Posição utilizável, sem incomodar o entregador se der pra evitar.
   *
   * 1. A do rastreamento/GPS que já está no store, se ainda estiver fresca -
   *    com uma entrega PICKED_UP em curso isso quase sempre acerta, porque o
   *    `watchPosition` do socket alimenta o store de graça.
   * 2. Uma leitura nova do GPS.
   * 3. Falhou: devolve o motivo, e quem chamou decide abrir o campo de texto.
   */
  const resolvePosition = useCallback(async (): Promise<PositionOutcome> => {
    const cached = useCourierPositionStore.getState().position;
    if (isPositionFresh(cached)) return { ok: true, position: cached };

    setIsLocating(true);
    try {
      const reading = await readGps();

      if (!reading.ok) return { ok: false, reason: reading.reason };

      setStorePosition(reading.coords, "gps");
      const stored = useCourierPositionStore.getState().position;

      // `stored` acabou de ser escrito acima; o non-null é só pro TypeScript.
      return { ok: true, position: stored! };
    } finally {
      setIsLocating(false);
    }
  }, [setStorePosition]);

  /** Leitura nova de GPS pedida explicitamente (botão "tentar GPS"). */
  const refreshFromGps = useCallback(async (): Promise<PositionOutcome> => {
    setIsLocating(true);
    try {
      const reading = await readGps();
      if (!reading.ok) return { ok: false, reason: reading.reason };

      setStorePosition(reading.coords, "gps");
      return { ok: true, position: useCourierPositionStore.getState().position! };
    } finally {
      setIsLocating(false);
    }
  }, [setStorePosition]);

  /**
   * Procura o texto digitado no Nominatim, sem gravar nada.
   *
   * O Nominatim não diz "não existe": devolve o lugar mais parecido que
   * conhece, às vezes em outra cidade ("ai delícia" virou um endereço real
   * e a entrega foi aceita com ele - LDMF-314). Quem chama mostra o que foi
   * achado e só grava com `confirmTextMatch`, depois que o entregador
   * reconhece o lugar.
   */
  const findFromText = useCallback(
    async (text: string): Promise<TextMatch | null> => {
      const query = text.trim();
      if (!query) return null;

      setIsGeocoding(true);
      try {
        return await searchFreeText(query);
      } finally {
        setIsGeocoding(false);
      }
    },
    [],
  );

  /** O entregador reconheceu o endereço achado: vira a posição manual. */
  const confirmTextMatch = useCallback(
    (match: TextMatch) => {
      setStorePosition(match.coords, "manual", match.found);
    },
    [setStorePosition],
  );

  return {
    position,
    isFresh: isPositionFresh(position),
    isLocating,
    isGeocoding,
    resolvePosition,
    refreshFromGps,
    findFromText,
    confirmTextMatch,
  };
}
