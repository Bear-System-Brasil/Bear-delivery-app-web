import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Restaurant } from "@/types/restaurant";

/**
 * Sem endereço a home não pode listar o catálogo inteiro (quase todo de
 * outras cidades): mostra o convite pra informar o endereço, e só depois
 * disso aparecem as lojas perto.
 */

vi.mock("@/hooks", () => ({
  useNewDishes: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/components/customize-order/customize-order", () => ({
  CustomizeOrder: () => null,
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const { TrendingRestaurantsSection } = await import(
  "@/components/home-page/trending-restaurants-section"
);
const { OPEN_LOCATION_SHEET_EVENT } = await import("@/lib/location-sheet");

const STORE = {
  id: "comp-1",
  tradeName: "DeCasa Pizzaria",
  description: "Pizzaria caseira",
  logo_url: "",
  cover_url: "",
  phone: "",
  time: "",
  deliveryFee: "",
  rating: 0,
  discount: 0,
  actionRadius: 5,
  totalReviews: 0,
  isOpen: true,
  trending: false,
  status: "active",
  openingHours: [],
  categories: [],
} as Restaurant;

describe("Home sem endereço", () => {
  it("pede o endereço em vez de listar as lojas", () => {
    render(
      <TrendingRestaurantsSection
        restaurants={[STORE]}
        visibleCount={10}
        loading={false}
        hasUserLocation={false}
      />,
    );

    expect(
      screen.getByText("Onde você quer receber seu pedido?"),
    ).toBeInTheDocument();
    // nem a lista de lojas nem as novidades aparecem antes do endereço
    expect(screen.queryByText("DeCasa Pizzaria")).not.toBeInTheDocument();
    expect(screen.queryByText("Lojas")).not.toBeInTheDocument();
    expect(screen.queryByText("Novidades")).not.toBeInTheDocument();
  });

  it("abre o painel de endereço do header ao clicar em 'Informar endereço'", async () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_LOCATION_SHEET_EVENT, listener);

    render(
      <TrendingRestaurantsSection
        restaurants={[]}
        visibleCount={10}
        loading={false}
        hasUserLocation={false}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Informar endereço" }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<{ mode: string }>;
    expect(event.detail.mode).toBe("form");

    window.removeEventListener(OPEN_LOCATION_SHEET_EVENT, listener);
  });

  it("com endereço, volta a listar as lojas perto", () => {
    render(
      <TrendingRestaurantsSection
        restaurants={[STORE]}
        visibleCount={10}
        loading={false}
        hasUserLocation
      />,
    );

    expect(
      screen.queryByText("Onde você quer receber seu pedido?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Lojas")).toBeInTheDocument();
    expect(screen.getByText("DeCasa Pizzaria")).toBeInTheDocument();
  });
});
