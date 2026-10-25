import { fireEvent, render, screen, within } from "@testing-library/react";
import { RotateCcw, Settings } from "lucide-react";
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

  it("mantém o botão da tela junto do papel e do sino", () => {
    render(
      <AdminPageLayout
        title="Controle de Caixa"
        icon={Settings}
        action={{ label: "Atualizar", onClick: vi.fn() }}
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

describe("AdminPageLayout - header padronizado (LDMF-392)", () => {
  it("mostra o subtítulo no header quando a tela passa", () => {
    render(
      <AdminPageLayout
        title="Controle de Caixa"
        icon={Settings}
        subtitle="Abertura, fechamento e movimentos financeiros"
      >
        conteúdo
      </AdminPageLayout>,
    );

    const header = screen.getByRole("banner");
    expect(
      within(header).getByText("Abertura, fechamento e movimentos financeiros"),
    ).toBeInTheDocument();
  });

  it("o botão único usa o rótulo e a ação da tela", () => {
    const onClick = vi.fn();
    render(
      <AdminPageLayout
        title="Configurações"
        icon={Settings}
        action={{ label: "Restaurar padrão", icon: RotateCcw, onClick }}
      >
        conteúdo
      </AdminPageLayout>,
    );

    const header = screen.getByRole("banner");
    // O rótulo fica no aria-label: no mobile o botão mostra só o ícone.
    fireEvent.click(within(header).getByRole("button", { name: "Restaurar padrão" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("em andamento, troca o rótulo e trava o botão", () => {
    render(
      <AdminPageLayout
        title="Dashboard"
        icon={Settings}
        action={{
          label: "Atualizar",
          busyLabel: "Atualizando...",
          busy: true,
          onClick: vi.fn(),
        }}
      >
        conteúdo
      </AdminPageLayout>,
    );

    expect(screen.getByRole("button", { name: "Atualizando..." })).toBeDisabled();
  });

  it("sem ação, o header não mostra botão da tela", () => {
    render(
      <AdminPageLayout title="Cozinha" icon={Settings}>
        conteúdo
      </AdminPageLayout>,
    );

    expect(screen.queryByRole("button", { name: "Atualizar" })).not.toBeInTheDocument();
  });

  it("o botão de Ajuda abre o modal da página", () => {
    render(
      <AdminPageLayout title="Controle de Caixa" icon={Settings}>
        conteúdo
      </AdminPageLayout>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ajuda sobre esta página" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ajuda: Controle de Caixa")).toBeInTheDocument();
    expect(
      within(dialog).getByText("O guia desta página ainda está sendo preparado."),
    ).toBeInTheDocument();
  });

  it("o modal de Ajuda mostra o conteúdo que a tela passa", () => {
    render(
      <AdminPageLayout
        title="Controle de Caixa"
        icon={Settings}
        help={<p>Sangria é a retirada de dinheiro da gaveta.</p>}
      >
        conteúdo
      </AdminPageLayout>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ajuda sobre esta página" }));
    expect(
      within(screen.getByRole("dialog")).getByText(
        "Sangria é a retirada de dinheiro da gaveta.",
      ),
    ).toBeInTheDocument();
  });

  it("com fillViewport, o main ocupa o que sobra abaixo do header", () => {
    render(
      <AdminPageLayout title="Cozinha" icon={Settings} fillViewport>
        conteúdo
      </AdminPageLayout>,
    );

    // A Cozinha descontava 52px fixos e o header real tem 61/65px: a página
    // rolava. Agora o main é flex e encolhe (min-h-0) no espaço que sobra.
    const main = screen.getByRole("main");
    expect(main).toHaveClass("flex", "min-h-0", "flex-col");
    expect(main.parentElement).toHaveClass("h-dvh", "overflow-hidden");
  });
});
