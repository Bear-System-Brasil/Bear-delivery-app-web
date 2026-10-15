import { describe, expect, it } from "vitest";
import {
  getPrimaryWorkspaceLink,
  getWorkspaceLinks,
} from "./workspace-links";
import { hasRoutePermission } from "@/utils/permissions";

/**
 * O menu tinha um slot unico por role, o que serve para quem faz uma coisa
 * so. O primeiro cliente e uma pessoa so - dono, cozinheiro e entregador - e
 * enxergava apenas Gestao.
 */

const labels = (role?: string) =>
  getWorkspaceLinks(role).map((area) => area.label);

describe("getWorkspaceLinks", () => {
  it.each(["owner", "admin", "manager"])(
    "%s enxerga as quatro areas",
    (role) => {
      expect(labels(role)).toEqual([
        "Gestão",
        "Cozinha",
        "Entregas",
        "Financeiro",
      ]);
    },
  );

  it("quem faz uma coisa so continua com a sua area", () => {
    expect(labels("cook")).toEqual(["Cozinha"]);
    expect(labels("delivery")).toEqual(["Entregas"]);
    expect(labels("financial")).toEqual(["Financeiro"]);
  });

  it("role sem area de trabalho nao mostra a secao", () => {
    expect(labels("client")).toEqual([]);
    expect(labels(undefined)).toEqual([]);
    expect(labels("role-que-nao-existe")).toEqual([]);
  });
});

describe("getPrimaryWorkspaceLink", () => {
  it("devolve a primeira area da role", () => {
    // A barra inferior do mobile tem tres colunas e nao comporta cinco
    // destinos - ela usa so esta. As demais ficam no menu do cabecalho.
    expect(getPrimaryWorkspaceLink("owner")?.label).toBe("Gestão");
    expect(getPrimaryWorkspaceLink("cook")?.label).toBe("Cozinha");
    expect(getPrimaryWorkspaceLink("delivery")?.label).toBe("Entregas");
    expect(getPrimaryWorkspaceLink("financial")?.label).toBe("Financeiro");
  });

  it("devolve null para quem nao tem area", () => {
    expect(getPrimaryWorkspaceLink("client")).toBeNull();
    expect(getPrimaryWorkspaceLink(undefined)).toBeNull();
  });
});

/**
 * O par que mais custa caro: item de menu apontando para rota que a role nao
 * alcanca leva direto pro "Acesso Negado". Foi o que motivou esta lista sair
 * de constantes de owner/admin (ver o comentario na BottomBar), e nada
 * impede que volte a divergir quando alguem mexer num dos dois lados.
 */
describe("menu e permissao nao divergem", () => {
  const ROLES = ["owner", "admin", "manager", "cook", "delivery", "financial"];

  it.each(ROLES)("toda area listada para %s e alcancavel", (role) => {
    for (const area of getWorkspaceLinks(role)) {
      expect(
        hasRoutePermission(area.href, role),
        `${role} nao alcanca ${area.href}`,
      ).toBe(true);
    }
  });
});
