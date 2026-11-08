import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";

describe("Card", () => {
  it("nao desfoca o fundo por padrao (backdrop-blur pesava na GPU ao rolar; LDMF-475)", () => {
    const { container } = render(<Card>conteudo</Card>);
    expect((container.firstChild as HTMLElement).className).not.toMatch(/\bbackdrop-blur(?!-none)/);
  });

  it("continua aceitando classe extra de quem usa", () => {
    const { container } = render(<Card className="p-4">conteudo</Card>);
    expect((container.firstChild as HTMLElement).className).toMatch(/\bp-4\b/);
  });
});
