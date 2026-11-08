import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NewDish } from "@/services/products/new-dishes";
import type { Restaurant } from "@/types/restaurant";

/**
 * Seção "Novidades" da home: carrossel de pratos. Trava o que o mock
 * promete - chips só quando há dado pra filtrar, card abre o modal do
 * prato, coração favorita a loja sem abrir nada.
 */

let dishes: NewDish[] = [];
let loadingDishes = false;

vi.mock("@/hooks", () => ({
  useNewDishes: () => ({ data: dishes, isLoading: loadingDishes }),
}));

// O modal real puxa restaurante, tamanhos e complementos da API - aqui só
// interessa saber se abriu e com qual prato.
vi.mock("@/components/customize-order/customize-order", () => ({
  CustomizeOrder: ({
    isModalOpen,
    productData,
  }: {
    isModalOpen: boolean;
    productData: { name: string };
  }) =>
    isModalOpen ? (
      <div role="dialog">Modal: {productData.name}</div>
    ) : null,
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

const { NewDishesSection } = await import("./index");
const { useFavoritesStore } = await import("@/stores");

const STORE = { id: "comp-1", tradeName: "DeCasa Pizzaria" } as Restaurant;

function dish(id: string, overrides: Partial<NewDish> = {}): NewDish {
  return {
    id,
    name: `Prato ${id}`,
    price: 42.9,
    originalPrice: null,
    discountPercent: 0,
    imageUrl: null,
    createdAt: null,
    product: {
      id,
      companyId: "comp-1",
      name: `Prato ${id}`,
      description: "",
      salePrice: 42.9,
      isAvailable: true,
    },
    restaurant: {
      id: "comp-1",
      name: "DeCasa Pizzaria",
      logoUrl: null,
      deliveryFeeLabel: null,
      isFreeDelivery: false,
      deliveryTimeLabel: null,
      deliveryMaxMinutes: null,
    },
    ...overrides,
  };
}

function renderSection() {
  return render(
    <NewDishesSection
      restaurants={[STORE]}
      loading={false}
      hasUserLocation
    />,
  );
}

describe("NewDishesSection", () => {
  beforeEach(() => {
    dishes = [];
    loadingDishes = false;
    useFavoritesStore.getState().clearFavorites();
  });

  it("lista os pratos com badge NOVO, loja e preço", () => {
    dishes = [dish("p1")];
    renderSection();

    expect(screen.getByText("Prato p1")).toBeInTheDocument();
    expect(screen.getByText("NOVO")).toBeInTheDocument();
    expect(screen.getByText("DeCasa Pizzaria")).toBeInTheDocument();
    expect(screen.getByText("R$ 42,90")).toBeInTheDocument();
  });

  it("esconde os chips quando nenhum prato tem frete, tempo ou promoção", () => {
    dishes = [dish("p1")];
    renderSection();

    expect(screen.queryByRole("button", { name: "Tudo" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Promoções" }),
    ).not.toBeInTheDocument();
  });

  it("mostra só os chips com dado e filtra por eles", async () => {
    dishes = [
      dish("p1"),
      dish("p2", {
        price: 58,
        originalPrice: 69,
        discountPercent: 16,
        restaurant: {
          ...dish("p2").restaurant,
          deliveryTimeLabel: "40-50 min",
          deliveryMaxMinutes: 50,
        },
      }),
    ];
    renderSection();

    expect(screen.getByRole("button", { name: "Tudo" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Promoções" }),
    ).toBeInTheDocument();
    // ninguém entrega em até 30 min nem tem frete grátis
    expect(
      screen.queryByRole("button", { name: "Até 30 min" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Entrega grátis" }),
    ).not.toBeInTheDocument();

    expect(screen.getByText("-16%")).toBeInTheDocument();
    expect(screen.getByText("R$ 69,00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Promoções" }));

    expect(screen.queryByText("Prato p1")).not.toBeInTheDocument();
    expect(screen.getByText("Prato p2")).toBeInTheDocument();
  });

  it("abre o modal do prato ao clicar no card ou no +", async () => {
    dishes = [dish("p1")];
    renderSection();

    await userEvent.click(screen.getByRole("button", { name: "Ver Prato p1" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Modal: Prato p1");
  });

  it("coração favorita a loja sem abrir o modal", async () => {
    dishes = [dish("p1")];
    renderSection();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Salvar DeCasa Pizzaria nos favoritos",
      }),
    );

    expect(useFavoritesStore.getState().favorites).toEqual(["comp-1"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mostra o estado vazio quando não há pratos", () => {
    renderSection();

    expect(
      screen.getByText("Nenhuma novidade encontrada"),
    ).toBeInTheDocument();
  });

  describe("seta de voltar (desktop)", () => {
    // jsdom não faz layout: simula um trilho de 1000px com 10 cards de
    // 212px + 12px de gap (224px por card)
    const CARD_STEP = 224;

    function renderRail() {
      dishes = Array.from({ length: 10 }, (_, index) => dish(`p${index}`));
      renderSection();

      const back = screen.getByRole("button", {
        name: "Rolar novidades para a esquerda",
      });
      const rail = back.nextElementSibling as HTMLElement;
      Object.defineProperty(rail, "clientWidth", { value: 1000 });
      Object.defineProperty(rail, "scrollWidth", { value: CARD_STEP * 10 });

      const scrollToCard = (index: number) => {
        rail.scrollLeft = index * CARD_STEP;
        fireEvent.scroll(rail);
      };

      return { back, scrollToCard };
    }

    const isHiddenOnDesktop = (button: HTMLElement) =>
      button.className.split(" ").includes("sm:hidden");

    it("some no primeiro card", () => {
      const { back, scrollToCard } = renderRail();

      scrollToCard(0);

      expect(isHiddenOnDesktop(back)).toBe(true);
    });

    it.each([1, 2, 3, 5])(
      "aparece quando o card %i está no início (há card anterior)",
      (index) => {
        const { back, scrollToCard } = renderRail();

        scrollToCard(index);

        expect(isHiddenOnDesktop(back)).toBe(false);
      },
    );

    it("some de novo ao voltar para o primeiro card", () => {
      const { back, scrollToCard } = renderRail();

      scrollToCard(2);
      scrollToCard(0);

      expect(isHiddenOnDesktop(back)).toBe(true);
    });
  });

  describe("seta de avançar e indicador (desktop)", () => {
    // mesmo trilho: 1000px visíveis de 2240px, fim do scroll em 1240px
    function renderRail() {
      dishes = Array.from({ length: 10 }, (_, index) => dish(`p${index}`));
      renderSection();

      const forward = screen.getByRole("button", {
        name: "Rolar novidades para a direita",
      });
      const rail = forward.previousElementSibling as HTMLElement;
      Object.defineProperty(rail, "clientWidth", { value: 1000 });
      Object.defineProperty(rail, "scrollWidth", { value: 2240 });

      const scrollTo = (left: number) => {
        rail.scrollLeft = left;
        fireEvent.scroll(rail);
      };
      const activeDot = () => {
        const dots = Array.from(
          forward.nextElementSibling?.children ?? [],
        ) as HTMLElement[];
        return dots.findIndex((dot) => dot.className.includes("bg-orange-500"));
      };

      return { forward, scrollTo, activeDot };
    }

    const isHiddenOnDesktop = (button: HTMLElement) =>
      button.className.split(" ").includes("sm:hidden");

    it.each([0, 224, 1000, 1238])(
      "aparece enquanto há card adiante (scroll em %ipx)",
      (left) => {
        const { forward, scrollTo } = renderRail();

        scrollTo(left);

        expect(isHiddenOnDesktop(forward)).toBe(false);
      },
    );

    it("some no fim do trilho", () => {
      const { forward, scrollTo } = renderRail();

      scrollTo(1240);

      expect(isHiddenOnDesktop(forward)).toBe(true);
    });

    it("acende o último ponto no fim do trilho", () => {
      const { scrollTo, activeDot } = renderRail();

      scrollTo(0);
      expect(activeDot()).toBe(0);

      scrollTo(1000);
      expect(activeDot()).toBe(1);

      scrollTo(1240);
      expect(activeDot()).toBe(2);
    });
  });
});
