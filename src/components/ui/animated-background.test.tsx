import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnimatedBackground } from "./animated-background";

describe("AnimatedBackground", () => {
  it("renderiza as manchas sem animacao (o pulso refazia o blur a cada quadro)", () => {
    const { container } = render(
      <AnimatedBackground>
        <p>conteudo</p>
      </AnimatedBackground>,
    );

    const manchas = container.querySelectorAll(".blur-3xl");
    expect(manchas).toHaveLength(4);
    manchas.forEach((mancha) => {
      expect(mancha.className).not.toMatch(/\banimate-/);
    });
  });

  it("nao renderiza manchas com showBlobs={false}", () => {
    const { container } = render(<AnimatedBackground showBlobs={false} />);
    expect(container.querySelectorAll(".blur-3xl")).toHaveLength(0);
  });
});
