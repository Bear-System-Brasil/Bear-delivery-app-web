import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Restaurant } from "@/types/restaurant";
import { RestaurantHero, resolveRestaurantRating } from "./restaurant-hero";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));

const restaurant = {
  id: "r1",
  tradeName: "DeCasa Pizzaria Delivery",
  description: "Pizzaria caseira pra delivery",
  logo_url: "https://exemplo.r2.dev/logo.png",
  cover_url: "https://exemplo.r2.dev/capa.png",
  rating: 0,
  totalReviews: 0,
} as unknown as Restaurant;

function renderHero(overrides: Partial<Parameters<typeof RestaurantHero>[0]> = {}) {
  const props = {
    restaurant,
    isOpen: true as boolean | null,
    isFavorite: false,
    onToggleFavorite: vi.fn(),
    onBack: vi.fn(),
    rating: 0,
    totalReviews: 0,
    deliveryTime: "0-100 min",
    deliveryLabel: "R$ 99,00",
    isFreeDelivery: false,
    ...overrides,
  };
  render(<RestaurantHero {...props} />);
  return props;
}

describe("RestaurantHero", () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "share", {
      value: originalShare,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  it("mostra nome, descrição, selo Aberto e os três números", () => {
    renderHero();
    expect(
      screen.getByRole("heading", { name: "DeCasa Pizzaria Delivery" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pizzaria caseira pra delivery")).toBeInTheDocument();
    expect(screen.getByText("Aberto")).toBeInTheDocument();
    expect(screen.getByText("Novo")).toBeInTheDocument();
    expect(screen.getByText("sem avaliações")).toBeInTheDocument();
    expect(screen.getByText("0-100 min")).toBeInTheDocument();
    expect(screen.getByText("R$ 99,00")).toBeInTheDocument();
  });

  it("sem status calculado não mostra selo; fechado mostra Fechado", () => {
    renderHero({ isOpen: null });
    expect(screen.queryByText("Aberto")).not.toBeInTheDocument();
    expect(screen.queryByText("Fechado")).not.toBeInTheDocument();
  });

  it("com avaliações mostra a média com vírgula e o total", () => {
    renderHero({ rating: 4.5, totalReviews: 12 });
    expect(screen.getByText("4,5")).toBeInTheDocument();
    expect(screen.getByText("12 avaliações")).toBeInTheDocument();
  });

  it("favoritar e voltar chamam os handlers", () => {
    const props = renderHero();
    fireEvent.click(screen.getByRole("button", { name: "Salvar nos favoritos" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar para as lojas" }));
    expect(props.onToggleFavorite).toHaveBeenCalledTimes(1);
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it("compartilhar usa o compartilhamento do aparelho quando existe", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar loja" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "DeCasa Pizzaria Delivery",
        url: window.location.href,
      }),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("sem compartilhamento do aparelho, copia o link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderHero();
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar loja" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href));
    expect(toast.success).toHaveBeenCalledWith("Link da loja copiado");
  });
});

describe("resolveRestaurantRating", () => {
  it("usa o GET /reviews quando já respondeu, mesmo com a loja zerada", () => {
    expect(
      resolveRestaurantRating(
        { data: [], average: 4.2, total: 38 },
        { rating: 0, totalReviews: 0 },
      ),
    ).toEqual({ rating: 4.2, total: 38 });
  });

  it("antes das avaliações chegarem, usa os campos da loja", () => {
    expect(
      resolveRestaurantRating(undefined, { rating: 3, totalReviews: 2 }),
    ).toEqual({ rating: 3, total: 2 });
  });

  it("valor inválido vira 0", () => {
    expect(
      resolveRestaurantRating(undefined, {
        rating: Number.NaN,
        totalReviews: undefined as unknown as number,
      }),
    ).toEqual({ rating: 0, total: 0 });
  });
});
