import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { BIRTH_DATE_MESSAGES, getBirthDateError } from "@/utils";
import { BirthDateInput } from "./index";

function Wrapper({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <BirthDateInput
      id="birthDate"
      value={value}
      onChange={setValue}
      error={getBirthDateError(value)}
    />
  );
}

const getInput = () => screen.getByRole("textbox") as HTMLInputElement;

// Digita caractere a caractere, como no teclado
function typeChars(chars: string) {
  const input = getInput();
  for (const ch of chars) {
    fireEvent.change(input, { target: { value: input.value + ch } });
  }
}

function paste(text: string) {
  const input = getInput();
  input.setSelectionRange(0, input.value.length);
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe("BirthDateInput - digitação (LDMF-303)", () => {
  it("abre teclado numérico e não é o seletor nativo", () => {
    render(<Wrapper />);
    expect(getInput()).toHaveAttribute("inputmode", "numeric");
    expect(getInput()).toHaveAttribute("type", "text");
  });

  it("dígito impossível nem entra no campo", () => {
    render(<Wrapper />);
    typeChars("4");
    expect(getInput()).toHaveValue("");
    typeChars("3");
    typeChars("5");
    expect(getInput()).toHaveValue("3");
    typeChars("1");
    typeChars("04");
    // 31/04 não existe: o 4 não entra
    expect(getInput()).toHaveValue("31/0");
    typeChars("5");
    expect(getInput()).toHaveValue("31/05");
    typeChars("9");
    expect(getInput()).toHaveValue("31/05");
    typeChars("1990");
    expect(getInput()).toHaveValue("31/05/1990");
    expect(screen.queryByText(BIRTH_DATE_MESSAGES.invalid)).not.toBeInTheDocument();
  });

  it("menor de 18 entra e mostra o aviso", () => {
    render(<Wrapper />);
    typeChars(`0101${new Date().getFullYear() - 10}`);
    expect(getInput()).toHaveValue(`01/01/${new Date().getFullYear() - 10}`);
    expect(screen.getByText(BIRTH_DATE_MESSAGES.underage)).toBeInTheDocument();
  });
});

describe("BirthDateInput - colar (LDMF-303)", () => {
  it("aproveita só os números do texto colado", () => {
    render(<Wrapper />);
    paste("Nascido em 15.10.2000");
    expect(getInput()).toHaveValue("15/10/2000");
  });

  it("colado que não fecha entra com aviso na hora e continua editável", () => {
    render(<Wrapper />);
    paste("31/04/2000");
    expect(getInput()).toHaveValue("31/04/2000");
    expect(screen.getByText(BIRTH_DATE_MESSAGES.invalid)).toBeInTheDocument();

    fireEvent.change(getInput(), { target: { value: "31/04/200" } });
    expect(getInput()).toHaveValue("31/04/200");
  });
});
