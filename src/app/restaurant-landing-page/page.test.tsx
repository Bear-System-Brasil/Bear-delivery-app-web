import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RestaurantLandingPage from "./page";

// Referencia estavel: mock com identidade nova a cada render causa laco.
const router = { push: vi.fn(), back: vi.fn(), replace: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/restaurant-landing-page",
}));

vi.mock("@/components/main-header", () => ({
  MainHeader: () => <header />,
}));

describe("RestaurantLandingPage", () => {
  it("renderiza as manchas do fundo sem animacao (o pulso refazia o blur a cada quadro)", () => {
    const { container } = render(<RestaurantLandingPage />);

    const manchas = container.querySelectorAll(".rounded-full.blur-3xl, .rounded-full.blur-2xl");
    expect(manchas).toHaveLength(3);
    manchas.forEach((mancha) => {
      expect(mancha.className).not.toMatch(/\banimate-/);
    });
  });
});
