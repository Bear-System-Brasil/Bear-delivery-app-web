import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Setas do carrossel de Categorias: a da esquerda cobria "Pizza" no PC,
 * porque aparecia sempre, colada na borda, por cima da lista. Agora cada
 * seta só aparece quando há para onde rolar.
 */

vi.mock("@/hooks/use-new-dishes", () => ({
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

function setScroll(
  el: HTMLElement,
  { left, client, total }: { left: number; client: number; total: number },
) {
  Object.defineProperty(el, "scrollLeft", { value: left, configurable: true });
  Object.defineProperty(el, "clientWidth", {
    value: client,
    configurable: true,
  });
  Object.defineProperty(el, "scrollWidth", { value: total, configurable: true });
  fireEvent.scroll(el);
}

const LEFT = { name: "Rolar categorias para a esquerda" };
const RIGHT = { name: "Rolar categorias para a direita" };

describe("Categorias da home: setas do carrossel", () => {
  function renderSection() {
    render(
      <TrendingRestaurantsSection
        visibleCount={10}
        restaurants={[]}
        loading={false}
        hasUserLocation
        location={{ lat: -8.06, lng: -34.88 }}
      />,
    );
    const pizza = screen.getByRole("button", { name: /Pizza/ });
    return pizza.parentElement as HTMLElement;
  }

  it("no começo da lista, a seta da esquerda não aparece (não cobre Pizza)", () => {
    const scroller = renderSection();
    setScroll(scroller, { left: 0, client: 400, total: 1000 });

    expect(screen.queryByRole("button", LEFT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", RIGHT)).toBeInTheDocument();
  });

  it("no meio, as duas aparecem; no fim, só a da esquerda", () => {
    const scroller = renderSection();

    setScroll(scroller, { left: 300, client: 400, total: 1000 });
    expect(screen.getByRole("button", LEFT)).toBeInTheDocument();
    expect(screen.getByRole("button", RIGHT)).toBeInTheDocument();

    setScroll(scroller, { left: 600, client: 400, total: 1000 });
    expect(screen.getByRole("button", LEFT)).toBeInTheDocument();
    expect(screen.queryByRole("button", RIGHT)).not.toBeInTheDocument();
  });

  it("se todas as categorias cabem, nenhuma seta aparece", () => {
    const scroller = renderSection();
    setScroll(scroller, { left: 0, client: 1000, total: 1000 });

    expect(screen.queryByRole("button", LEFT)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", RIGHT)).not.toBeInTheDocument();
  });
});
