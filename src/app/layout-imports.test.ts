import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O layout raiz carrega em TODAS as telas. Se algo nele importa o barrel
 * `@/hooks`, o webpack leva junto os hooks do app inteiro (cozinha,
 * entregador, checkout, perfil) e o zod - medido: ~78 KB a mais baixados ate
 * na tela de termos (LDMF-478). Este teste percorre os imports estaticos a
 * partir do layout e falha se o barrel voltar a ser alcancado.
 */

const SRC = path.resolve(__dirname, "..");
const IMPORT_RE =
  /(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolver(spec: string, de: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(de), spec);
  else return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** Arquivo alcancado -> quem o importou primeiro (para mostrar o caminho). */
function alcancaveis(inicio: string): Map<string, string | null> {
  const vistos = new Map<string, string | null>([[inicio, null]]);
  const fila = [inicio];
  while (fila.length) {
    const arquivo = fila.shift()!;
    for (const m of readFileSync(arquivo, "utf8").matchAll(IMPORT_RE)) {
      if (m[1]) continue; // import type nao entra no bundle
      const alvo = resolver(m[2] ?? m[3], arquivo);
      if (alvo && !vistos.has(alvo)) {
        vistos.set(alvo, arquivo);
        fila.push(alvo);
      }
    }
  }
  return vistos;
}

function caminho(vistos: Map<string, string | null>, alvo: string): string {
  const passos: string[] = [];
  for (let a: string | null = alvo; a; a = vistos.get(a) ?? null) {
    passos.unshift(path.relative(SRC, a));
  }
  return passos.join(" -> ");
}

describe("imports do layout raiz", () => {
  const vistos = alcancaveis(path.join(SRC, "app/layout.tsx"));

  it.each([
    ["barrel @/hooks", "hooks/index.ts"],
    ["validacao com zod", "hooks/use-form-validation.ts"],
  ])("nao alcanca o %s", (_nome, arquivo) => {
    const alvo = path.join(SRC, arquivo);
    expect(vistos.has(alvo) ? caminho(vistos, alvo) : null).toBeNull();
  });
});
