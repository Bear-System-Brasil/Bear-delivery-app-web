import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleBadge } from "./index";

// Referência estável do usuário: o mock devolve o mesmo objeto a cada render.
const auth = vi.hoisted(() => ({ user: null as { role: string } | null }));

vi.mock("@/contexts/auth-provider", () => ({
  useAuth: () => auth,
}));

beforeEach(() => {
  auth.user = { role: "owner" };
});

describe("RoleBadge", () => {
  it('mostra "Dono" para owner, com o rótulo do mapa de permissions', () => {
    render(<RoleBadge />);
    expect(screen.getByText("Dono")).toBeInTheDocument();
    expect(screen.queryByText("Proprietário")).not.toBeInTheDocument();
  });

  it("não renderiza nada antes de o papel carregar", () => {
    auth.user = null;
    const { container } = render(<RoleBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não mostra a chave crua de um papel sem rótulo", () => {
    auth.user = { role: "papel-novo" };
    const { container } = render(<RoleBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
