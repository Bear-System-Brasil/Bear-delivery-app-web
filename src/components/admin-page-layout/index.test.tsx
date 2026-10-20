import { render, screen, within } from "@testing-library/react";
import { Settings } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AdminPageLayout } from "./index";

// Referência estável: o mesmo objeto a cada render.
const auth = vi.hoisted(() => ({ user: { role: "owner" } }));

vi.mock("@/contexts/auth-provider", () => ({
  useAuth: () => auth,
}));

// Sidebar e sino têm testes próprios; aqui só interessa o header.
vi.mock("@/components/sidebar-menu-management", () => ({
  default: () => null,
}));
vi.mock("@/components/notifications/notification-bell", () => ({
  NotificationBell: () => <button type="button">Notificações</button>,
}));

describe("AdminPageLayout - header", () => {
  it('mostra o título e o papel "Dono" no header', () => {
    render(
      <AdminPageLayout title="Configurações" icon={Settings}>
        conteúdo
      </AdminPageLayout>,
    );

    const header = screen.getByRole("banner");
    expect(
      within(header).getByRole("heading", { level: 1, name: "Configurações" }),
    ).toBeInTheDocument();
    expect(within(header).getByText("Dono")).toBeInTheDocument();
  });

  it("mantém as ações da tela junto do papel e do sino", () => {
    render(
      <AdminPageLayout
        title="Controle de Caixa"
        icon={Settings}
        actions={<button type="button">Atualizar</button>}
      >
        conteúdo
      </AdminPageLayout>,
    );

    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: "Atualizar" })).toBeInTheDocument();
    expect(within(header).getByText("Dono")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Notificações" })).toBeInTheDocument();
  });
});
