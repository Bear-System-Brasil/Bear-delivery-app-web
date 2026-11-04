import { parseBrasilApiCoords } from "@/lib/address-coordinates";
import type { Coords } from "@/types/restaurant";

export interface CepAddress {
  /** Só dígitos. */
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  /** Código IBGE do município ("3201407" = Castelo); vazio se não veio. */
  ibgeCode: string;
  /** Coordenada do logradouro (não do número) - nem todo CEP tem. */
  coords: Coords | null;
}

export class CepNotFoundError extends Error {
  constructor() {
    super("CEP não encontrado");
    this.name = "CepNotFoundError";
  }
}

/** A API respondeu, mas não conseguiu consultar (rede, 5xx, formato). */
class CepServiceError extends Error {}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Principal (LDMF-260): BrasilAPI v2. Além do endereço, devolve a coordenada
 * do logradouro (ponto de partida do pino) e o código IBGE da cidade.
 */
async function fetchFromBrasilApi(digits: string): Promise<CepAddress> {
  let response: Response;
  try {
    response = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
  } catch {
    throw new CepServiceError("BrasilAPI fora do ar");
  }

  if (response.status === 404) throw new CepNotFoundError();
  if (!response.ok) throw new CepServiceError(`BrasilAPI ${response.status}`);

  const data = await response.json();

  return {
    zipCode: digits,
    street: text(data.street),
    neighborhood: text(data.neighborhood),
    city: text(data.city),
    state: text(data.state),
    ibgeCode: text(data.ibge?.city),
    coords: parseBrasilApiCoords(data),
  };
}

/**
 * Reserva: ViaCEP. Mesmo endereço e código IBGE, sem coordenada. CEP que
 * não existe volta 200 com `{"erro": "true"}`.
 */
async function fetchFromViaCep(digits: string): Promise<CepAddress> {
  let response: Response;
  try {
    response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  } catch {
    throw new CepServiceError("ViaCEP fora do ar");
  }

  if (!response.ok) throw new CepServiceError(`ViaCEP ${response.status}`);

  const data = await response.json();
  if (data?.erro === true || data?.erro === "true") throw new CepNotFoundError();

  return {
    zipCode: digits,
    street: text(data.logradouro),
    neighborhood: text(data.bairro),
    city: text(data.localidade),
    state: text(data.uf),
    ibgeCode: text(data.ibge),
    coords: null,
  };
}

/**
 * Busca o CEP na BrasilAPI e, se ela falhar, na ViaCEP.
 *
 * O 404 da BrasilAPI também passa pela ViaCEP: ela responde 404 quando os
 * serviços dela por trás falham, não só quando o CEP não existe. Só é "CEP
 * não encontrado" quando nenhuma das duas acha; se a reserva também cair,
 * vale o que a principal disse.
 */
export async function fetchCepAddress(cep: string): Promise<CepAddress> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) throw new Error("CEP incompleto");

  let primaryError: unknown;
  try {
    return await fetchFromBrasilApi(digits);
  } catch (error) {
    primaryError = error;
  }

  try {
    return await fetchFromViaCep(digits);
  } catch (fallbackError) {
    if (fallbackError instanceof CepNotFoundError) throw fallbackError;
    if (primaryError instanceof CepNotFoundError) throw primaryError;
    throw new Error("Erro ao buscar CEP");
  }
}
