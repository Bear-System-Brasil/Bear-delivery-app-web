import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "@/services/api";
import { MenuAppPreview } from ".";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const makeProduct = (id: string, name: string) =>
  ({
    id,
    name,
    price: 10,
    isAvailable: true,
    images: [],
  }) as unknown as Product;

// Referencias estaveis entre renders (mock com identidade nova a cada
// chamada causa laco de render nos testes deste projeto).
const groupedItems = {
  Massas: [makeProduct("p1", "Lasanha")],
  Bebidas: [makeProduct("p2", "Suco")],
};
const categories = ["Massas", "Bebidas"];

describe("MenuAppPreview", () => {
  it("mostra os pratos e filtra pela aba de categoria", async () => {
    const user = userEvent.setup();
    render(
      <MenuAppPreview
        open
        onOpenChange={vi.fn()}
        categories={categories}
        groupedItems={groupedItems}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Lasanha")).toBeInTheDocument();
    expect(within(dialog).getByText("Suco")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Bebidas" }));

    expect(within(dialog).queryByText("Lasanha")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Suco")).toBeInTheDocument();
  });

  it("fecha pelo botão 'Fechar prévia'", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <MenuAppPreview
        open
        onOpenChange={onOpenChange}
        categories={categories}
        groupedItems={groupedItems}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Fechar prévia" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("usa a grade de celular, sem colunas por largura de tela", () => {
    render(
      <MenuAppPreview
        open
        onOpenChange={vi.fn()}
        categories={categories}
        groupedItems={groupedItems}
      />,
    );

    const grids = screen.getByRole("dialog").querySelectorAll(".grid.gap-3");
    expect(grids.length).toBeGreaterThan(0);
    grids.forEach((grid) => {
      expect(grid.className).not.toContain("sm:grid-cols-2");
    });
  });

  it("sem pratos, mostra o aviso em vez da lista", () => {
    render(
      <MenuAppPreview
        open
        onOpenChange={vi.fn()}
        categories={[]}
        groupedItems={{}}
      />,
    );

    expect(
      screen.getByText("Cadastre pratos disponíveis pra ver a prévia do app."),
    ).toBeInTheDocument();
  });
});
