import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hasRoutePermission } from "@/utils/permissions";

/**
 * O menu lateral da gestao e o unico menu que existe dentro das telas de
 * trabalho: o AdminPageLayout renderiza este Sidebar e nao o MainHeader,
 * entao o menu do app com as areas nao esta ali. Item que falta aqui e
 * caminho que nao existe - foi o caso de Entregas.
 *
 * E item que sobra e pior: leva direto pro "Acesso Negado". O ultimo teste
 * cruza cada link com o mapa de permissoes, pra que os dois lados nao
 * divirjam em silencio.
 */

// Lido a cada render pelo mock de useAuth.
let role = "owner";

vi.mock("@/contexts/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "u1", role },
    logout: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/menu-management",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../ui/bear-delivery-logo", () => ({
  BearDeliveryLogo: () => <span>Bear Delivery</span>,
}));

const { default: Sidebar } = await import("./index");

beforeAll(() => {
  // jsdom nao implementa matchMedia, e o Sidebar decide por ele se renderiza
  // a versao fixa de desktop ou a folha do mobile. Desktop e o caso que
  // importa aqui: e nele que a BottomBar nao existe.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

beforeEach(() => {
  role = "owner";
});

/** Rotas dos links visiveis, na ordem em que aparecem. */
const visibleHrefs = () =>
  screen
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"))
    .filter((href): href is string => !!href);

describe("Sidebar da gestao - Entregas", () => {
  it.each(["owner", "admin", "manager"])(
    "%s tem link direto pra area de entregas",
    (currentRole) => {
      role = currentRole;
      render(<Sidebar isOpen onClose={() => {}} />);

      expect(
        screen.getByRole("link", { name: "Entregas" }),
      ).toHaveAttribute("href", "/delivery-dashboard");
    },
  );

  it("fica junto da operacao do dia a dia, e nao no fim da lista", () => {
    render(<Sidebar isOpen onClose={() => {}} />);

    const hrefs = visibleHrefs();

    // Cozinha e Entregas em sequencia - é a operação do dia a dia.
    expect(hrefs.indexOf("/kitchen")).toBe(
      hrefs.indexOf("/category-management") + 1,
    );
    expect(hrefs.indexOf("/delivery-dashboard")).toBe(
      hrefs.indexOf("/kitchen") + 1,
    );
  });

  it("nao aparece pra quem nao alcanca a area", () => {
    role = "cook";
    render(<Sidebar isOpen onClose={() => {}} />);

    expect(
      screen.queryByRole("link", { name: "Entregas" }),
    ).not.toBeInTheDocument();
  });
});

describe("Sidebar da gestao - Financeiro", () => {
  it("o financeiro ve Configuracoes, que e preferencia de quem usa a area", () => {
    // O mapa sempre liberou a tela pro financeiro; so o link ficava
    // escondido dele - acesso sem caminho.
    role = "financial";
    render(<Sidebar isOpen onClose={() => {}} />);

    expect(
      screen.getByRole("link", { name: "Configurações" }),
    ).toHaveAttribute("href", "/financial-management/settings");
  });
});

describe("Sidebar da gestao - menu e permissao nao divergem", () => {
  const ROLES = ["owner", "admin", "manager", "cook", "delivery", "financial"];

  /**
   * So o logo fica fora: "/" e saida pro app, nao item de navegacao de
   * trabalho. Todo o resto do menu lateral passa pelo cruzamento.
   */
  const NAO_COBERTAS = new Set(["/"]);

  it.each(ROLES)("todo link mostrado para %s e alcancavel", (currentRole) => {
    role = currentRole;
    render(<Sidebar isOpen onClose={() => {}} />);

    for (const href of visibleHrefs()) {
      if (NAO_COBERTAS.has(href)) continue;

      expect(
        hasRoutePermission(href, currentRole),
        `${currentRole} nao alcanca ${href}`,
      ).toBe(true);
    }
  });
});

describe("Sidebar da gestao - papel no rodape", () => {
  // No mobile o header cede a linha ao titulo e nao mostra o papel; o
  // rodape do menu e onde ele fica visivel. Nao pode virar link.
  it("mostra Dono para o owner, sem virar item de navegacao", () => {
    render(<Sidebar isOpen onClose={() => {}} />);

    expect(screen.getByText("Dono")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dono" })).not.toBeInTheDocument();
  });

  it("usa o rotulo do papel de quem esta logado", () => {
    role = "cook";
    render(<Sidebar isOpen onClose={() => {}} />);

    expect(screen.getByText("Cozinheiro")).toBeInTheDocument();
  });
});

describe("Sidebar da gestao - design novo (LDMF-443)", () => {
  it("chama o cadastro da empresa de Perfil da Empresa, como o titulo da tela", () => {
    render(<Sidebar isOpen onClose={() => {}} />);

    expect(
      screen.getByRole("link", { name: "Perfil da Empresa" }),
    ).toHaveAttribute("href", "/company-profile");
  });

  it("marca o item ativo com fundo claro, e nao com o laranja cheio", () => {
    // usePathname esta fixo em /menu-management no mock.
    render(<Sidebar isOpen onClose={() => {}} />);

    const ativo = screen.getByRole("link", { name: "Cardápio" });
    expect(ativo).toHaveClass("bg-brand-50", "text-brand-700");
    expect(ativo).not.toHaveClass("bg-brand-500");
  });

  it("mostra o Sair discreto, sem o laranja de botao de acao", () => {
    render(<Sidebar isOpen onClose={() => {}} />);

    const sair = screen.getByRole("button", { name: "Sair" });
    expect(sair).not.toHaveClass("bg-brand-500");
  });
});

describe("Sidebar da gestao - menu fixo sem depender do matchMedia (LDMF-443)", () => {
  it("o menu fixo ja vem renderizado antes do matchMedia responder", () => {
    // No servidor e na primeira pintura o matchMedia ainda nao rodou; o menu
    // fixo tem que estar la mesmo assim (quem esconde no mobile e o CSS).
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;

    try {
      const { container } = render(<Sidebar isOpen={false} onClose={() => {}} />);
      const aside = container.querySelector("aside");
      expect(aside).toBeInTheDocument();
      expect(aside).toHaveClass("hidden", "lg:block");
    } finally {
      window.matchMedia = original;
    }
  });

  it("no desktop a gaveta nao abre por cima do menu fixo", () => {
    render(<Sidebar isOpen onClose={() => {}} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
