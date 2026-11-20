import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  showAuthModal: vi.fn(),
  logout: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("@/contexts/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
}));
vi.mock("@/hooks/use-synced-user-location", () => ({
  useSyncedUserLocation: () => undefined,
}));
vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => null,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));

import { MainHeader } from "./index";

describe("MainHeader - menu superior enxuto (LDMF-499)", () => {
  beforeEach(() => {
    document.cookie = "userLocation=; max-age=0; path=/";
  });

  it("mostra 'Entregar em:' com o endereço em duas linhas", () => {
    render(<MainHeader showSearch showLocation />);
    const trigger = screen.getByRole("button", {
      name: /Entregar em: Escolha seu endereço/,
    });
    expect(trigger).toHaveTextContent("Entregar em:");
    expect(trigger).toHaveTextContent("Escolha seu endereço");
  });

  it("no celular, com o endereço à mostra, o logo sai do topo", () => {
    render(<MainHeader showSearch showLocation />);
    expect(
      screen.getByRole("link", { name: "Beara Delivery - início" }),
    ).toHaveClass("max-sm:hidden");
  });

  it("sem o endereço, o logo continua no celular", () => {
    render(<MainHeader showSearch showLocation={false} />);
    expect(
      screen.getByRole("link", { name: "Beara Delivery - início" }),
    ).not.toHaveClass("max-sm:hidden");
  });

  it("deslogado: botão de busca e 'Entrar' que abre o login", async () => {
    render(<MainHeader showSearch showLocation />);
    expect(screen.getByRole("button", { name: "Buscar" })).toBeInTheDocument();
    const entrar = await screen.findByRole("button", { name: "Entrar" });
    entrar.click();
    expect(auth.showAuthModal).toHaveBeenCalledWith("login");
  });
});
