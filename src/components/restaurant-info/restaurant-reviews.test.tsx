import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RestaurantReviews } from "./restaurant-reviews";

describe("RestaurantReviews", () => {
  it("sem avaliações mostra o aviso", () => {
    render(
      <RestaurantReviews
        summary={{ data: [], average: 0, total: 0 }}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Esta loja ainda não tem avaliações"),
    ).toBeInTheDocument();
  });

  it("com erro oferece tentar de novo", () => {
    const onRetry = vi.fn();
    render(
      <RestaurantReviews isLoading={false} isError onRetry={onRetry} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("lista média, total e cada avaliação com iniciais e comentário", () => {
    render(
      <RestaurantReviews
        summary={{
          average: 4.5,
          total: 2,
          data: [
            {
              id: "a",
              rating: 5,
              comment: "Ótima pizza!",
              author: { id: "u1", name: "Maria Souza" },
              created_at: "2026-11-10T15:00:00.000Z",
            },
            {
              id: "b",
              rating: 4,
              comment: null,
              author: null,
              created_at: "2026-11-09T15:00:00.000Z",
            },
          ],
        }}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("4,5")).toBeInTheDocument();
    expect(screen.getByText("2 avaliações")).toBeInTheDocument();
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByText("MS")).toBeInTheDocument();
    expect(screen.getByText("Ótima pizza!")).toBeInTheDocument();
    // Sem autor, aparece "Cliente".
    expect(screen.getByText("Cliente")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "5 de 5 estrelas" })).toBeInTheDocument();
  });
});
