import { parseBrasilApiCoords } from "@/lib/address-coordinates";
import type { Coords } from "@/types/restaurant";

export interface CepAddress {
  /** Só dígitos. */
  zipCode: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  /** Coordenada do logradouro (não do número) - nem todo CEP tem. */
  coords: Coords | null;
}

export class CepNotFoundError extends Error {
  constructor() {
    super("CEP não encontrado");
    this.name = "CepNotFoundError";
  }
}

/**
 * Busca o CEP na BrasilAPI v2 - a mesma fonte do checkout e do perfil, que
 * além do endereço devolve a coordenada do logradouro como ponto de partida.
 */
export async function fetchCepAddress(cep: string): Promise<CepAddress> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) throw new Error("CEP incompleto");

  const response = await fetch(
    `https://brasilapi.com.br/api/cep/v2/${digits}`,
  );

  if (response.status === 404) throw new CepNotFoundError();
  if (!response.ok) throw new Error("Erro ao buscar CEP");

  const data = await response.json();

  return {
    zipCode: digits,
    street: data.street || "",
    neighborhood: data.neighborhood || "",
    city: data.city || "",
    state: data.state || "",
    coords: parseBrasilApiCoords(data),
  };
}
