import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { BIRTH_DATE_MESSAGES, brasiliaYear, getBirthDateError } from "@/utils";
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

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: /escolher data no calendário/i }));
}

const column = (name: string) => screen.getByRole("listbox", { name });

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
    typeChars(`0101${brasiliaYear() - 10}`);
    expect(getInput()).toHaveValue(`01/01/${brasiliaYear() - 10}`);
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

describe("BirthDateInput - seletor (LDMF-303)", () => {
  it("abre com três colunas e o ano começando em hoje menos 18", () => {
    render(<Wrapper />);
    openPicker();

    expect(column("Dia")).toBeInTheDocument();
    expect(column("Mês")).toBeInTheDocument();
    const years = within(column("Ano")).getAllByRole("option");
    expect(years[0]).toHaveTextContent(String(brasiliaYear() - 18));
    expect(years[years.length - 1]).toHaveTextContent(String(brasiliaYear() - 120));
    expect(within(column("Ano")).queryByText(String(brasiliaYear() - 17))).toBeNull();
  });

  it("escolher dia, mês e ano preenche o campo em DD/MM/AAAA", () => {
    render(<Wrapper />);
    openPicker();

    fireEvent.click(within(column("Ano")).getByRole("option", { name: "2000" }));
    expect(getInput()).toHaveValue("");
    fireEvent.click(within(column("Mês")).getByRole("option", { name: "Fevereiro" }));
    fireEvent.click(within(column("Dia")).getByRole("option", { name: "29" }));

    expect(getInput()).toHaveValue("29/02/2000");
  });

  it("a coluna de dia se ajusta ao mês e ao ano bissexto", () => {
    render(<Wrapper />);
    openPicker();

    fireEvent.click(within(column("Mês")).getByRole("option", { name: "Fevereiro" }));
    fireEvent.click(within(column("Ano")).getByRole("option", { name: "2000" }));
    expect(within(column("Dia")).getAllByRole("option")).toHaveLength(29);

    fireEvent.click(within(column("Ano")).getByRole("option", { name: "2001" }));
    expect(within(column("Dia")).getAllByRole("option")).toHaveLength(28);

    fireEvent.click(within(column("Mês")).getByRole("option", { name: "Abril" }));
    expect(within(column("Dia")).getAllByRole("option")).toHaveLength(30);
  });

  it("dia que deixa de existir é ajustado ao trocar o mês ou o ano", () => {
    render(<Wrapper />);
    openPicker();

    fireEvent.click(within(column("Dia")).getByRole("option", { name: "29" }));
    fireEvent.click(within(column("Mês")).getByRole("option", { name: "Fevereiro" }));
    fireEvent.click(within(column("Ano")).getByRole("option", { name: "2000" }));
    expect(getInput()).toHaveValue("29/02/2000");

    fireEvent.click(within(column("Ano")).getByRole("option", { name: "2001" }));
    expect(getInput()).toHaveValue("28/02/2001");
  });

  it("digitar atualiza o seletor", () => {
    render(<Wrapper />);
    typeChars("15101990");
    openPicker();

    expect(within(column("Dia")).getByRole("option", { name: "15" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      within(column("Mês")).getByRole("option", { name: "Outubro" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(within(column("Ano")).getByRole("option", { name: "1990" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("Pronto fecha o painel", () => {
    render(<Wrapper />);
    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Pronto" }));
    expect(screen.queryByRole("listbox", { name: "Dia" })).not.toBeInTheDocument();
  });
});
