import { describe, expect, it } from "vitest";
import {
  ROUTE_PERMISSIONS,
  getAccessibleRoutes,
  hasRoutePermission,
  isClient,
  isRestaurantStaff,
} from "./permissions";

describe("hasRoutePermission", () => {
  it("permite quando o role está na lista da rota", () => {
    expect(hasRoutePermission("/menu-management", "owner")).toBe(true);
    expect(hasRoutePermission("/cart", "client")).toBe(true);
    expect(hasRoutePermission("/orders", "client")).toBe(true);
    expect(hasRoutePermission("/orders", "customer")).toBe(true);
    expect(hasRoutePermission("/order-status", "owner")).toBe(true);
  });

  it("nega quando o role não está na lista da rota", () => {
    expect(hasRoutePermission("/menu-management", "client")).toBe(false);
    expect(hasRoutePermission("/cart", "cook")).toBe(false);
    expect(hasRoutePermission("/cart", "owner")).toBe(false);
    expect(hasRoutePermission("/orders", "owner")).toBe(false);
  });

  it("bloqueia por padrão uma rota não mapeada (segurança)", () => {
    expect(hasRoutePermission("/rota-inexistente", "owner")).toBe(false);
  });

  it("resolve rotas com segmento dinâmico contra o pathname real", () => {
    expect(hasRoutePermission("/restaurant/abc123", "client")).toBe(true);
    expect(hasRoutePermission("/restaurant/abc123", "cook")).toBe(true);
  });

  it("não confunde rota dinâmica com uma de tamanho diferente", () => {
    expect(hasRoutePermission("/restaurant/abc123/delivery", "client")).toBe(false);
  });
});

/**
 * O menu passou a listar todas as areas de trabalho para quem administra o
 * restaurante - o primeiro cliente e uma pessoa so, que e dono, cozinheiro e
 * entregador. Item de menu que aponta pra rota que a role nao alcanca leva
 * direto pro "Acesso Negado", entao cada area listada precisa estar liberada
 * aqui. Estes testes travam esse par.
 */
describe("areas de trabalho das roles de gestao", () => {
  const AREAS = [
    "/menu-management",
    "/kitchen",
    "/financial-management/dashboard",
  ];

  it.each(["owner", "admin", "manager"])("%s alcanca todas as areas", (role) => {
    for (const area of AREAS) {
      expect(hasRoutePermission(area, role)).toBe(true);
    }
  });

  it("a area de entregas continua aberta pro entregador", () => {
    expect(hasRoutePermission("/delivery-dashboard", "delivery")).toBe(true);
  });

  it.each(["owner", "admin", "manager"])(
    "%s nao alcanca a area de entregas",
    (role) => {
      // LDMF-324: a tela lista as entregas do entregador logado - a gerencia
      // nao pega entrega por ali.
      expect(hasRoutePermission("/delivery-dashboard", role)).toBe(false);
    },
  );

  it("nao abre as demais areas pra quem faz uma coisa so", () => {
    // Estas roles continuam com um destino unico no menu, e o mapa tem de
    // dizer o mesmo - senao a lista de areas e a permissao divergem.
    expect(hasRoutePermission("/menu-management", "cook")).toBe(false);
    expect(hasRoutePermission("/delivery-dashboard", "cook")).toBe(false);
    expect(hasRoutePermission("/kitchen", "delivery")).toBe(false);
    expect(hasRoutePermission("/menu-management", "financial")).toBe(false);
    expect(hasRoutePermission("/delivery-dashboard", "financial")).toBe(false);
  });

  it("Equipe e a mesma trinca da gestao do cardapio", () => {
    // A rota existia so no middleware. Como rota nao mapeada e bloqueada por
    // padrao aqui, qualquer guard de front que lesse este mapa negaria a
    // tela a quem o middleware libera.
    for (const role of ["owner", "admin", "manager"]) {
      expect(hasRoutePermission("/team-management", role)).toBe(true);
    }

    expect(hasRoutePermission("/team-management", "cook")).toBe(false);
    expect(hasRoutePermission("/team-management", "delivery")).toBe(false);
    expect(hasRoutePermission("/team-management", "financial")).toBe(false);
    expect(hasRoutePermission("/team-management", "client")).toBe(false);
  });

  it("cliente nao entra em area de trabalho nenhuma", () => {
    for (const area of AREAS) {
      expect(hasRoutePermission(area, "client")).toBe(false);
    }
  });
});

/**
 * Matriz da area financeira, fixada rota por rota.
 *
 * Estas rotas ja regrediram duas vezes sem ninguem perceber: /cash-register
 * ficou fora do mapa e derrubou o acesso do financeiro, e o layout da area
 * ficou com ["owner", "admin"] literal, barrando a mesma role que o mapa e o
 * middleware liberavam. Rota nao mapeada e bloqueada por padrao em
 * hasRoutePermission, entao esquecer uma linha nao da erro - da tela negada.
 *
 * Por isso a matriz e escrita aqui por extenso, e nao derivada do mapa: uma
 * segunda afirmacao independente da intencao. Derivar do proprio mapa
 * passaria com qualquer valor que ele tivesse.
 */
describe("matriz de permissoes da area financeira", () => {
  const PERMITIDAS: Record<string, string[]> = {
    "/financial-management": ["owner", "admin", "manager", "financial"],
    "/financial-management/dashboard": [
      "owner",
      "admin",
      "manager",
      "financial",
    ],
    "/financial-management/orders": [
      "owner",
      "admin",
      "manager",
      "financial",
    ],
    "/financial-management/customers": [
      "owner",
      "admin",
      "manager",
      "financial",
    ],
    "/financial-management/finance": [
      "owner",
      "admin",
      "manager",
      "financial",
    ],
    "/financial-management/cash-register": [
      "owner",
      "admin",
      "manager",
      "financial",
    ],
    "/financial-management/settings": [
      "owner",
      "admin",
      "manager",
      "financial",
    ],
  };

  const TODAS_AS_ROLES = [
    "owner",
    "admin",
    "manager",
    "cook",
    "delivery",
    "financial",
    "client",
  ];

  it.each(Object.entries(PERMITIDAS))(
    "%s aceita exatamente as roles fixadas",
    (rota, permitidas) => {
      // Os dois sentidos na mesma volta: role removida sem querer quebra
      // aqui, e role acrescentada sem querer tambem.
      for (const role of TODAS_AS_ROLES) {
        expect(
          hasRoutePermission(rota, role),
          `${role} em ${rota}`,
        ).toBe(permitidas.includes(role));
      }
    },
  );

  it("a matriz cobre toda rota de /financial-management do mapa", () => {
    // Sem isto, tela nova ali dentro entraria no mapa e ficaria fora da
    // matriz - de novo sem ninguem perceber, que e o modo de falha destas
    // rotas. Tambem pega a rota que sair do mapa.
    const noMapa = Object.keys(ROUTE_PERMISSIONS).filter((rota) =>
      rota.startsWith("/financial-management"),
    );

    expect(noMapa.sort()).toEqual(Object.keys(PERMITIDAS).sort());
  });
});

describe("getAccessibleRoutes", () => {
  it("retorna só as rotas cujo role tem acesso", () => {
    const routes = getAccessibleRoutes("financial");
    expect(routes).toContain("/financial-management");
    expect(routes).toContain("/financial-management/cash-register");
    expect(routes).not.toContain("/menu-management");
  });
});

describe("isRestaurantStaff / isClient", () => {
  it("identifica staff administrativo (owner, admin, manager)", () => {
    expect(isRestaurantStaff("owner")).toBe(true);
    expect(isRestaurantStaff("manager")).toBe(true);
    expect(isRestaurantStaff("cook")).toBe(false);
  });

  it("identifica cliente", () => {
    expect(isClient("client")).toBe(true);
    expect(isClient("owner")).toBe(false);
  });
});
