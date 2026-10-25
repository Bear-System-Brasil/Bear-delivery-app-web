import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TimeInput } from "./index";

function Wrapper({
  initial = "",
  onChange,
}: {
  initial?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <TimeInput
      aria-label="Abertura"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const getInput = () => screen.getByRole("textbox", { name: "Abertura" }) as HTMLInputElement;

async function typeInField(text: string) {
  const user = userEvent.setup();
  await user.click(getInput());
  await user.keyboard(text);
}

describe("TimeInput (LDMF-351)", () => {
  it("é texto com teclado numérico, não o seletor nativo de hora", () => {
    render(<Wrapper />);
    expect(getInput().type).toBe("text");
    expect(getInput().inputMode).toBe("numeric");
  });

  it("completa com zero o que falta: 12 vira 12:00", async () => {
    render(<Wrapper />);
    await typeInField("12");
    expect(getInput().value).toBe("12:00");
  });

  it("vai substituindo da esquerda para a direita", async () => {
    render(<Wrapper initial="18:00" />);
    await typeInField("1");
    expect(getInput().value).toBe("10:00");
    await userEvent.keyboard("23");
    expect(getInput().value).toBe("12:30");
    await userEvent.keyboard("5");
    expect(getInput().value).toBe("12:35");
  });

  it("não deixa passar de 23 horas nem de 59 minutos", async () => {
    render(<Wrapper />);
    await typeInField("2");
    await userEvent.keyboard("4");
    expect(getInput().value).toBe("20:00");
    await userEvent.keyboard("3");
    expect(getInput().value).toBe("23:00");
    await userEvent.keyboard("7");
    expect(getInput().value).toBe("23:07");
  });

  it("hora 3 a 9 no primeiro dígito vira 03 a 09", async () => {
    render(<Wrapper />);
    await typeInField("930");
    expect(getInput().value).toBe("09:30");
  });

  it("ignora o que não é número", async () => {
    render(<Wrapper />);
    await typeInField("1a:8");
    expect(getInput().value).toBe("18:00");
  });

  it("apagar logo depois do foco zera em 00:00, nunca deixa vazio", async () => {
    const onChange = vi.fn();
    render(<Wrapper initial="15:00" onChange={onChange} />);
    await typeInField("{Backspace}");
    expect(getInput().value).toBe("00:00");
    expect(onChange).toHaveBeenLastCalledWith("00:00");
  });

  it("apagar no meio da digitação volta um dígito, até 00:00", async () => {
    render(<Wrapper />);
    await typeInField("123{Backspace}");
    expect(getInput().value).toBe("12:00");
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}");
    expect(getInput().value).toBe("00:00");
  });

  it("sem nada digitado mostra o campo vazio", () => {
    render(<Wrapper />);
    expect(getInput().value).toBe("");
    expect(getInput()).toHaveAttribute("placeholder", "--:--");
  });

  it("mostra 9:00 do servidor como 09:00", () => {
    render(<Wrapper initial="9:00" />);
    expect(getInput().value).toBe("09:00");
  });

  it("colar aproveita só os números válidos", () => {
    render(<Wrapper />);
    fireEvent.paste(getInput(), { clipboardData: { getData: () => "abre 18h30" } });
    expect(getInput().value).toBe("18:30");
  });
});
