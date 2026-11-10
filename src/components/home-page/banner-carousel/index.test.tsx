import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BannerCarousel } from "./index";

// O Embla depende de matchMedia/ResizeObserver, que o jsdom não tem. Aqui só
// interessa a <img> do banner. Referência estável: mock com identidade nova
// a cada render causa laço infinito nos testes deste projeto.
const { emblaApi } = vi.hoisted(() => ({ emblaApi: [() => {}, undefined] }));
vi.mock("embla-carousel-react", () => ({ default: () => emblaApi }));

describe("BannerCarousel", () => {
  it("informa a largura em que a arte é desenhada, não 100vw (LDMF-495)", () => {
    // Sem `sizes`, o Next assume 100vw e manda uma imagem com metade da
    // resolução que o celular precisa: as letras do banner saíam borradas.
    render(<BannerCarousel />);
    const img = screen.getByRole("img", { name: /bem-vindo|inaugura/i });
    expect(img.getAttribute("sizes")).toBe(
      "(max-width: 639px) 210vw, (max-width: 767px) 1110px, 1280px",
    );
  });
});
