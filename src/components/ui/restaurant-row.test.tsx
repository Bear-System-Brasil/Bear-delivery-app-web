import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Restaurant } from "@/types/restaurant";

/**
 * Linha compacta da seção "Lojas". Trava o que o layout promete: a linha
 * inteira abre o cardápio, o coração favorita sem navegar, e a loja sem
 * logo cai nas iniciais em vez de quebrar a imagem.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

const { RestaurantRow } = await import("./restaurant-row");
const { useFavoritesStore } = await import("@/stores");

const BASE: Restaurant = {
  id: "comp-1",
  time: "",
  phone: "",
  logo_url: "https://cdn.example.com/logo.png",
  cover_url: "",
  tradeName: "Burger do Ze Pilantra",
  description: "Burger do bom",
  deliveryFee: "0",
  rating: 4.5,
  discount: 0,
  actionRadius: 5,
  totalReviews: 10,
  isOpen: true,
  trending: false,
  status: "active",
  openingHours: [],
  categories: [],
  specialty: [{ id: "burger", name: "Burger" }],
};

describe("RestaurantRow", () => {
  beforeEach(() => {
    push.mockClear();
    useFavoritesStore.getState().clearFavorites();
  });

  it("abre o cardápio ao clicar na linha", async () => {
    render(<RestaurantRow restaurant={BASE} index={0} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Abrir cardapio de Burger do Ze Pilantra",
      }),
    );

    expect(push).toHaveBeenCalledWith("/restaurant/comp-1");
  });

  it("favorita pelo coração sem abrir o cardápio", async () => {
    render(<RestaurantRow restaurant={BASE} index={0} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Salvar nos favoritos" }),
    );

    expect(useFavoritesStore.getState().favorites).toEqual(["comp-1"]);
    expect(
      screen.getByRole("button", { name: "Remover dos favoritos" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(push).not.toHaveBeenCalled();
  });

  it("mostra frete grátis e a nota formatada", () => {
    render(<RestaurantRow restaurant={BASE} index={0} />);

    expect(screen.getByText("Grátis")).toBeInTheDocument();
    expect(screen.getByText("4,5")).toBeInTheDocument();
  });

  it("usa iniciais coloridas quando a loja não tem logo", () => {
    render(
      <RestaurantRow restaurant={{ ...BASE, logo_url: "" }} index={0} />,
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // "do" é ignorado: Burger + Ze
    expect(screen.getByText("BZ")).toBeInTheDocument();
    expect(screen.getByText("Burger")).toBeInTheDocument();
  });

  describe("status da loja (LDMF-480)", () => {
    // Quarta 04/11/2026, 12:00 em São Paulo.
    const NOW = new Date("2026-11-04T12:00:00-03:00");
    const day = (openTime: string, closeTime: string) => ({
      id: "h",
      day: 3,
      openTime,
      closeTime,
      breakStart: null,
      breakEnd: null,
      companyId: "comp-1",
    });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("mostra Aberto pela grade de horários", () => {
      render(
        <RestaurantRow
          restaurant={{ ...BASE, openingHours: [day("11:00", "22:00")] }}
          index={0}
        />,
      );

      expect(screen.getByText("Aberto")).toBeInTheDocument();
      expect(screen.queryByText(/^Abre /)).not.toBeInTheDocument();
    });

    it("mostra Fechado e a próxima abertura, mesmo com isOpen guardado true", () => {
      render(
        <RestaurantRow
          restaurant={{
            ...BASE,
            isOpen: true,
            openingHours: [day("18:00", "23:00")],
          }}
          index={0}
        />,
      );

      expect(screen.getByText("Fechado")).toBeInTheDocument();
      expect(screen.getByText("Abre hoje às 18:00")).toBeInTheDocument();
    });

    it("loja fechada continua abrindo o cardápio", async () => {
      vi.useRealTimers();
      render(<RestaurantRow restaurant={BASE} index={0} />);

      expect(screen.getByText("Fechado")).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole("button", {
          name: "Abrir cardapio de Burger do Ze Pilantra",
        }),
      );
      expect(push).toHaveBeenCalledWith("/restaurant/comp-1");
    });

    it("sem openingHours na resposta não mostra selo", () => {
      render(
        <RestaurantRow
          restaurant={{ ...BASE, openingHours: undefined }}
          index={0}
        />,
      );

      expect(screen.queryByText("Aberto")).not.toBeInTheDocument();
      expect(screen.queryByText("Fechado")).not.toBeInTheDocument();
    });
  });
});
