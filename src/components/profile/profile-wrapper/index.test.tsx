import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileWrapper } from "./index";

const { router, profileState, cartState } = vi.hoisted(() => ({
  router: { push: vi.fn(), back: vi.fn(), refresh: vi.fn() },
  // Referências estáveis: mock com identidade nova a cada render gera laço
  // infinito de render nos testes deste projeto.
  profileState: { current: {} as Record<string, unknown> },
  cartState: { totalItems: 0 },
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

// Os dois jeitos de importar: pelo barrel @/hooks e pelo arquivo de cada
// hook (LDMF-478 troca o wrapper para o segundo).
vi.mock("@/hooks", () => ({
  useCartActions: () => cartState,
  useProfileManagement: () => profileState.current,
}));
vi.mock("@/hooks/use-cart-actions", () => ({
  useCartActions: () => cartState,
}));
vi.mock("@/hooks/use-profile-management", () => ({
  useProfileManagement: () => profileState.current,
}));

// Só interessa saber se cada seção aparece; o conteúdo tem testes próprios.
vi.mock("@/components/main-header", () => ({ MainHeader: () => null }));
vi.mock("@/components/ui/animated-background", () => ({
  AnimatedBackground: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/components/user-photo-upload", () => ({
  UserPhotoUpload: () => <div data-testid="secao-foto" />,
}));
vi.mock("@/components/profile/personal-information", () => ({
  PersonalInformation: () => <div data-testid="secao-dados" />,
}));
vi.mock("@/components/profile/security", () => ({
  Security: () => <div data-testid="secao-seguranca" />,
}));
vi.mock("@/components/profile/order-history", () => ({
  OrderHistory: () => <div data-testid="secao-pedidos" />,
}));
vi.mock("@/components/profile/addresses", () => ({
  Addresses: () => <div data-testid="secao-enderecos" />,
}));

function renderAs(role: string) {
  profileState.current = {
    user: { id: `user-${role}`, name: "Teste", email: "t@t.com", role },
    isMounted: true,
    isAuthenticated: true,
    hasHydrated: true,
    isLoadingProfile: false,
    profileError: null,
  };
  return render(<ProfileWrapper />);
}

describe("ProfileWrapper - seções por role", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cliente vê histórico de pedidos e endereços", () => {
    renderAs("client");

    expect(screen.getByTestId("secao-pedidos")).toBeInTheDocument();
    expect(screen.getByTestId("secao-enderecos")).toBeInTheDocument();
  });

  // /orders é só de cliente e GET /address/me devolve o endereço da loja
  // (cozinheiro, gerente) ou 403 (financeiro) - LDMF-481.
  it.each(["cook", "manager", "financial", "delivery"])(
    "%s não vê histórico de pedidos nem endereços",
    (role) => {
      renderAs(role);

      expect(screen.queryByTestId("secao-pedidos")).not.toBeInTheDocument();
      expect(screen.queryByTestId("secao-enderecos")).not.toBeInTheDocument();
    },
  );

  it.each(["client", "cook", "manager", "financial", "delivery"])(
    "%s continua com foto, dados pessoais e senha",
    (role) => {
      renderAs(role);

      expect(screen.getByTestId("secao-foto")).toBeInTheDocument();
      expect(screen.getByTestId("secao-dados")).toBeInTheDocument();
      expect(screen.getByTestId("secao-seguranca")).toBeInTheDocument();
    },
  );
});
