import type { Specialty } from "@/services/api";

/**
 * Chave de comparação do nome do tipo: sem acento, sem diferença de
 * maiúscula e sem espaço sobrando. "BeBidas", "bebidas " e "Bébidas" viram
 * a mesma chave.
 */
export function specialtyNameKey(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O back tem o mesmo tipo de restaurante cadastrado mais de uma vez, cada
 * cadastro com seu id ("Hambúrgueres" 3x, "Bebidas"/"BeBidas") — LDMF-497.
 * Mostra cada nome uma vez só.
 *
 * Qual id representa o nome: o que estiver em `preferredIds` (o que a loja
 * já tem escolhido), para o seletor continuar mostrando a escolha salva.
 * Sem nenhum escolhido, fica o primeiro da lista. A ordem é a da primeira
 * aparição de cada nome. Nome vazio fica de fora.
 */
export function dedupeSpecialties(
  specialties: readonly Specialty[],
  preferredIds: readonly string[] = [],
): Specialty[] {
  const preferred = new Set(preferredIds.filter(Boolean));
  const byKey = new Map<string, Specialty>();

  for (const specialty of specialties) {
    const key = specialtyNameKey(specialty.name);
    if (!key) continue;

    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, specialty);
    } else if (!preferred.has(current.id) && preferred.has(specialty.id)) {
      // Troca o representante, mas mantém a posição da primeira aparição.
      byKey.set(key, specialty);
    }
  }

  return Array.from(byKey.values());
}
